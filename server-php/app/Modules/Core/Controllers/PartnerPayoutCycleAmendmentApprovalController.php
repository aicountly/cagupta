<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\AdminAuditLogModel;
use App\Models\PartnerPayoutCycleAmendmentModel;
use App\Models\PartnerPayoutCycleModel;
use App\Models\PartnerPayoutModel;

final class PartnerPayoutCycleAmendmentApprovalController extends BaseController
{
    /** GET /api/admin/approvals/partner-payout-cycle-amendments */
    public function index(): never
    {
        if (!$this->isSuperAdminActor($this->authUser())) {
            $this->error('Only Super Admin may view partner payout cycle amendments.', 403);
        }
        $rows = (new PartnerPayoutCycleAmendmentModel())->listPendingWithCycle();
        $this->success($rows);
    }

    /** POST /api/admin/approvals/partner-payout-cycle-amendments/:id/approve */
    public function approve(int $id): never
    {
        $actor = $this->authUser();
        if (!$this->isSuperAdminActor($actor)) {
            $this->error('Only Super Admin may approve partner payout cycle amendments.', 403);
        }
        $actorId = $actor ? (int)$actor['id'] : 0;

        $amend = new PartnerPayoutCycleAmendmentModel();
        $row   = $amend->find($id);
        if ($row === null || ($row['status'] ?? '') !== 'pending') {
            $this->error('Amendment not found or already decided.', 404);
        }

        $cycleId = (int)$row['partner_payout_cycle_id'];
        $cycles  = new PartnerPayoutCycleModel();
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

        $eligible = (new PartnerPayoutModel())->listEligibleForPartnerPayoutCycle(
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
            $cid = (int)($a['partner_payout_accrual_id'] ?? 0);
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
        $this->audit('partner_payout_cycle_amendment.approved', $id);
        $this->success([
            'amendment_id' => $id,
            'cycle'        => $cycles->find($cycleId),
        ], 'Amendment approved and cycle finalised');
    }

    /** POST /api/admin/approvals/partner-payout-cycle-amendments/:id/reject */
    public function reject(int $id): never
    {
        $actor = $this->authUser();
        if (!$this->isSuperAdminActor($actor)) {
            $this->error('Only Super Admin may reject partner payout cycle amendments.', 403);
        }
        $actorId = $actor ? (int)$actor['id'] : 0;

        $body   = $this->getJsonBody();
        $reason = trim((string)($body['reason'] ?? ''));
        if ($reason === '') {
            $this->error('reason is required.', 422);
        }

        $amend = new PartnerPayoutCycleAmendmentModel();
        $row   = $amend->find($id);
        if ($row === null || ($row['status'] ?? '') !== 'pending') {
            $this->error('Amendment not found or already decided.', 404);
        }

        $amend->markRejected($id, $actorId, $reason);
        $this->audit('partner_payout_cycle_amendment.rejected', $id);
        $this->success(['id' => $id, 'status' => 'rejected'], 'Amendment rejected');
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
                'partner_payout_cycle_amendment',
                $entityId,
                [],
                null,
                null
            );
        } catch (\Throwable $e) {
            error_log('[PartnerPayoutCycleAmendment] audit: ' . $e->getMessage());
        }
    }
}
