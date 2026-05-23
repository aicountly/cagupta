<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\AdminAuditLogModel;
use App\Models\PartnerPayoutCycleAmendmentModel;
use App\Models\PartnerPayoutCycleModel;
use App\Models\PartnerPayoutModel;
use App\Models\UserModel;
use App\Models\UserNotificationModel;

final class PartnerPayoutCycleController extends BaseController
{
    private function assertPerm(): void
    {
        $u = $this->authUser();
        if ($u === null) {
            $this->error('Not authenticated.', 401);
        }
        $p = $u['role_permissions_array'] ?? [];
        if (in_array('*', $p, true) || in_array('partners.manage', $p, true)) {
            return;
        }
        $this->error('Access denied. Required permission: partners.manage.', 403);
    }

    /** GET /api/admin/partner-payout-cycles?year=2026 */
    public function index(): never
    {
        $this->assertPerm();
        $year = (int)$this->query('year', (int)date('Y'));
        if ($year < 2000 || $year > 2100) {
            $this->error('Invalid year.', 422);
        }
        $rows = (new PartnerPayoutCycleModel())->listForYearMerged($year);
        $this->success($rows);
    }

    /** POST /api/admin/partner-payout-cycles/ensure */
    public function ensure(): never
    {
        $this->assertPerm();
        $body = $this->getJsonBody();
        $pe   = trim((string)($body['period_end'] ?? ''));
        if ($pe === '') {
            $this->error('period_end is required.', 422);
        }
        try {
            $row = (new PartnerPayoutCycleModel())->ensureOpenForPeriodEnd($pe);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }
        $this->success($row);
    }

    /** GET /api/admin/partner-payout-cycles/:id */
    public function show(int $id): never
    {
        $this->assertPerm();
        $m   = new PartnerPayoutCycleModel();
        $row = $m->find($id);
        if ($row === null) {
            $this->error('Cycle not found.', 404);
        }
        $lines = [];
        if (in_array(($row['status'] ?? ''), ['finalised', 'disbursed'], true)) {
            $lines = $m->linesForCycle($id);
        }
        $pending = (new PartnerPayoutCycleAmendmentModel())->findPendingForCycle($id);
        $this->success([
            'cycle'             => $row,
            'lines'             => $lines,
            'pending_amendment' => $pending,
        ]);
    }

    /** GET /api/admin/partner-payout-cycles/:id/preview */
    public function preview(int $id): never
    {
        $this->assertPerm();
        try {
            $preview = (new PartnerPayoutCycleModel())->buildPreview($id);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 404);
        }
        $this->success($preview);
    }

    /** POST /api/admin/partner-payout-cycles/:id/finalise */
    public function finalise(int $id): never
    {
        $this->assertPerm();
        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : 0;
        if ($actorId <= 0) {
            $this->error('Unauthorized.', 401);
        }
        $cycles = new PartnerPayoutCycleModel();
        $amend  = new PartnerPayoutCycleAmendmentModel();
        if ($amend->findPendingForCycle($id) !== null) {
            $this->error(
                'A payout amendment is pending Super Admin approval. Resolve it before finalising at system amounts.',
                422
            );
        }
        try {
            $cycles->finaliseAtSystemAmounts($id, $actorId);
        } catch (\RuntimeException $e) {
            $this->error($e->getMessage(), 422);
        }
        $this->audit('partner_payout_cycle.finalised', $id);
        $this->success($cycles->find($id), 'Cycle finalised');
    }

    /** POST /api/admin/partner-payout-cycles/:id/disburse */
    public function disburse(int $id): never
    {
        $this->assertPerm();
        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : 0;
        if ($actorId <= 0) {
            $this->error('Unauthorized.', 401);
        }
        $cycles = new PartnerPayoutCycleModel();
        try {
            $cycles->disburse($id, $actorId);
        } catch (\RuntimeException $e) {
            $this->error($e->getMessage(), 422);
        }
        $this->audit('partner_payout_cycle.disbursed', $id);
        $this->success($cycles->find($id), 'Cycle marked disbursed');
    }

    /**
     * POST /api/admin/partner-payout-cycles/:id/amendments
     * Body: { adjustments: [ { partner_payout_accrual_id, amount_final, note? } ] }
     */
    public function submitAmendment(int $id): never
    {
        $this->assertPerm();
        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : 0;
        if ($actorId <= 0) {
            $this->error('Unauthorized.', 401);
        }

        $cycles = new PartnerPayoutCycleModel();
        $cycle  = $cycles->find($id);
        if ($cycle === null) {
            $this->error('Cycle not found.', 404);
        }
        if (($cycle['status'] ?? '') !== 'open') {
            $this->error('Amendments are only allowed while the cycle is open.', 422);
        }

        $amend = new PartnerPayoutCycleAmendmentModel();
        if ($amend->findPendingForCycle($id) !== null) {
            $this->error('An amendment is already pending for this cycle.', 422);
        }

        $body = $this->getJsonBody();
        $adj  = $body['adjustments'] ?? null;
        if (!is_array($adj) || $adj === []) {
            $this->error('adjustments array is required.', 422);
        }

        $payoutModel = new PartnerPayoutModel();
        $accruals    = $payoutModel->listEligibleForPartnerPayoutCycle(
            (string)$cycle['period_start'],
            (string)$cycle['period_end']
        );
        $eligibleIds = [];
        foreach ($accruals as $r) {
            $eligibleIds[(int)$r['id']] = round((float)$r['amount'], 2);
        }

        $normalized = [];
        $hasChange  = false;
        foreach ($adj as $row) {
            if (!is_array($row)) {
                continue;
            }
            $cid = (int)($row['partner_payout_accrual_id'] ?? 0);
            $fin = isset($row['amount_final']) ? round((float)$row['amount_final'], 2) : null;
            if ($cid <= 0 || $fin === null) {
                $this->error('Each adjustment needs partner_payout_accrual_id and amount_final.', 422);
            }
            if (!array_key_exists($cid, $eligibleIds)) {
                $this->error('Accrual ' . $cid . ' is not eligible for this cycle.', 422);
            }
            if ($fin < 0) {
                $this->error('amount_final cannot be negative.', 422);
            }
            if ($fin !== $eligibleIds[$cid]) {
                $hasChange = true;
            }
            $normalized[] = [
                'partner_payout_accrual_id' => $cid,
                'amount_final'              => $fin,
                'note'                      => $row['note'] ?? null,
            ];
        }

        if (!$hasChange) {
            $this->error('At least one adjustment must differ from the system amount.', 422);
        }

        $requestReason = trim((string)($body['request_reason'] ?? ''));
        if (\App\Libraries\ApprovalReason::validateRequestReason($requestReason) !== null) {
            $this->error(\App\Libraries\ApprovalReason::ERROR_MESSAGE, 422);
        }

        $aid = $amend->insertPending($id, $actorId, $normalized, \App\Libraries\ApprovalReason::normalize($requestReason));
        $this->audit('partner_payout_cycle_amendment.submitted', $aid);

        $uids = (new UserModel())->idsHavingRoleNames(['super_admin']);
        if ($uids !== []) {
            try {
                (new UserNotificationModel())->createForUsers(
                    $uids,
                    'partner_payout_cycle_amendment',
                    'Partner payout cycle amendment pending',
                    'Cycle #' . $id . ' (' . $cycle['period_start'] . ' → ' . $cycle['period_end'] . ') requires Super Admin approval.',
                    'partner_payout_cycle_amendment',
                    $aid
                );
            } catch (\Throwable $e) {
                error_log('[PartnerPayoutCycle] notify superadmins: ' . $e->getMessage());
            }
        }

        $this->success(['id' => $aid, 'status' => 'pending'], 'Amendment submitted', 202);
    }

    private function audit(string $action, int $entityId): void
    {
        $actor = $this->authUser();
        try {
            (new AdminAuditLogModel())->insert(
                $actor ? (int)$actor['id'] : null,
                $action,
                'partner_payout_cycle',
                $entityId,
                [],
                null,
                null
            );
        } catch (\Throwable $e) {
            error_log('[PartnerPayoutCycle] audit: ' . $e->getMessage());
        }
    }
}
