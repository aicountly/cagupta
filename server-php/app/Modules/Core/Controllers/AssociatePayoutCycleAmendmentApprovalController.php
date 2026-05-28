<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Libraries\ApprovalDecisionNotifier;
use App\Libraries\ApprovalPendingNotificationDismisser;
use App\Models\AdminAuditLogModel;
use App\Models\AssociatePayoutCycleAmendmentModel;
use App\Models\AssociatePayoutCycleModel;
use App\Models\CommissionAccrualModel;

/**
 * Super Admin approval for Accounts-proposed changes to associate payout cycle amounts.
 */
final class AssociatePayoutCycleAmendmentApprovalController extends BaseController
{
    /** GET /api/admin/approvals/associate-payout-cycle-amendments */
    public function index(): never
    {
        if (!$this->isSuperAdminActor($this->authUser())) {
            $this->error('Only Super Admin may view payout cycle amendments.', 403);
        }
        $rows = (new AssociatePayoutCycleAmendmentModel())->listPendingWithCycle();
        $this->success($rows);
    }

    /** POST /api/admin/approvals/associate-payout-cycle-amendments/:id/approve */
    public function approve(int $id): never
    {
        $actor = $this->authUser();
        if (!$this->isSuperAdminActor($actor)) {
            $this->error('Only Super Admin may approve payout cycle amendments.', 403);
        }
        $actorId = $actor ? (int)$actor['id'] : 0;

        $amend = new AssociatePayoutCycleAmendmentModel();
        $row   = $amend->find($id);
        if ($row === null || ($row['status'] ?? '') !== 'pending') {
            $this->error('Amendment not found or already decided.', 404);
        }

        $cycleId = (int)$row['associate_payout_cycle_id'];
        $cycles  = new AssociatePayoutCycleModel();
        $cycle   = $cycles->find($cycleId);
        if ($cycle === null || ($cycle['status'] ?? '') !== 'open') {
            $this->error('Cycle is not open; cannot apply amendment.', 422);
        }

        $rawAdj = $row['adjustments_json'] ?? '[]';
        if (is_array($rawAdj)) {
            $adjustments = $rawAdj;
        } else {
            $adjustments = json_decode((string)$rawAdj, true);
        }
        if (!is_array($adjustments)) {
            $adjustments = [];
        }

        $eligible = (new CommissionAccrualModel())->listEligibleForAssociatePayoutCycle(
            (string)$cycle['period_start'],
            (string)$cycle['period_end']
        );
        $amountMap = [];
        foreach ($eligible as $r) {
            $amountMap[(int)$r['id']] = round((float)$r['amount'], 2);
        }
        foreach ($adjustments as $a) {
            if (!is_array($a)) {
                continue;
            }
            $cid = (int)($a['commission_accrual_id'] ?? 0);
            if ($cid <= 0 || !array_key_exists($cid, $amountMap)) {
                $this->error('Invalid amendment payload vs current eligible accruals.', 422);
            }
            $amountMap[$cid] = round((float)($a['amount_final'] ?? 0), 2);
        }

        try {
            $cycles->finaliseWithAmountMap($cycleId, $actorId, $amountMap);
        } catch (\RuntimeException $e) {
            $this->error($e->getMessage(), 422);
        }

        $amend->markApproved($id, $actorId);
        $this->audit('associate_payout_cycle_amendment.approved', $id);
        $this->notifyAmendmentRequester(
            (int)($row['requested_by_user_id'] ?? 0),
            $id,
            $cycleId,
            $cycle,
            'approved',
            'Associate payout amendment approved',
            $actor,
            null
        );

        ApprovalPendingNotificationDismisser::dismiss(
            'associate_payout_cycle_amendment',
            'associate_payout_cycle_amendment',
            $id
        );

        $this->success([
            'amendment_id' => $id,
            'cycle'        => $cycles->find($cycleId),
        ], 'Amendment approved and cycle finalised');
    }

    /** POST /api/admin/approvals/associate-payout-cycle-amendments/:id/reject */
    public function reject(int $id): never
    {
        $actor = $this->authUser();
        if (!$this->isSuperAdminActor($actor)) {
            $this->error('Only Super Admin may reject payout cycle amendments.', 403);
        }
        $actorId = $actor ? (int)$actor['id'] : 0;

        $body   = $this->getJsonBody();
        $reason = trim((string)($body['reason'] ?? ''));
        if ($reason === '') {
            $this->error('reason is required.', 422);
        }

        $amend = new AssociatePayoutCycleAmendmentModel();
        $row   = $amend->find($id);
        if ($row === null || ($row['status'] ?? '') !== 'pending') {
            $this->error('Amendment not found or already decided.', 404);
        }

        $amend->markRejected($id, $actorId, $reason);
        $this->audit('associate_payout_cycle_amendment.rejected', $id);
        $cycleId = (int)($row['associate_payout_cycle_id'] ?? 0);
        $cycle   = $cycleId > 0 ? (new AssociatePayoutCycleModel())->find($cycleId) : null;
        $this->notifyAmendmentRequester(
            (int)($row['requested_by_user_id'] ?? 0),
            $id,
            $cycleId,
            $cycle,
            'rejected',
            'Associate payout amendment rejected',
            $actor,
            $reason
        );

        ApprovalPendingNotificationDismisser::dismiss(
            'associate_payout_cycle_amendment',
            'associate_payout_cycle_amendment',
            $id
        );

        $this->success(['id' => $id, 'status' => 'rejected'], 'Amendment rejected');
    }

    /**
     * @param array<string, mixed>|null $cycle
     * @param array<string, mixed>|null $actor
     */
    private function notifyAmendmentRequester(
        int $userId,
        int $amendmentId,
        int $cycleId,
        ?array $cycle,
        string $decision,
        string $title,
        ?array $actor,
        ?string $rejectReason
    ): void {
        $period = '';
        if ($cycle !== null) {
            $period = (string)($cycle['period_start'] ?? '') . ' → ' . (string)($cycle['period_end'] ?? '');
        }
        $periodPart = $period !== '' && $period !== ' → ' ? " ({$period})" : '';
        $summary    = $decision === 'rejected'
            ? "Amendment #{$amendmentId} for associate payout cycle #{$cycleId}{$periodPart} was rejected."
            : "Amendment #{$amendmentId} for associate payout cycle #{$cycleId}{$periodPart} was approved and the cycle was finalised.";

        $body = $summary;
        if ($rejectReason !== null && $rejectReason !== '') {
            $body .= ' Reason: ' . $rejectReason;
        }

        $detailHtml = null;
        if ($rejectReason !== null && $rejectReason !== '') {
            $detailHtml = ApprovalDecisionNotifier::detailBlock(
                'Reason: ' . ApprovalDecisionNotifier::escapeDetail($rejectReason)
            );
        }

        ApprovalDecisionNotifier::notifyRequester(
            $userId,
            'associate_payout_cycle_amendment_decided',
            $title,
            $body,
            'associate_payout_cycle_amendment',
            $amendmentId,
            'Associate payout amendment',
            $decision,
            $summary,
            $actor,
            $detailHtml
        );
    }

    /** @param array<string, mixed>|null $actor */
    private function isSuperAdminActor(?array $actor): bool
    {
        if ($actor === null) {
            return false;
        }
        if ($this->isSuperAdminEmail((string)($actor['email'] ?? ''))) {
            return true;
        }

        return ($actor['role_name'] ?? '') === 'super_admin';
    }

    private function audit(string $action, int $entityId): void
    {
        $actor = $this->authUser();
        try {
            (new AdminAuditLogModel())->insert(
                $actor ? (int)$actor['id'] : null,
                $action,
                'associate_payout_cycle_amendment',
                $entityId,
                [],
                null,
                null
            );
        } catch (\Throwable $e) {
            error_log('[AssociatePayoutCycleAmendmentApproval] audit: ' . $e->getMessage());
        }
    }
}
