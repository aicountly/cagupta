<?php
declare(strict_types=1);

namespace App\Controllers\Partner;

use App\Controllers\BaseController;
use App\Models\PartnerAssignmentModel;
use App\Models\PartnerBankDetailModel;
use App\Models\PartnerPayoutModel;
use App\Models\PartnerProfileModel;

/**
 * Authenticated partner portal APIs.
 */
final class PartnerPortalController extends BaseController
{
    private function assertPartner(): array
    {
        $u = $this->authUser();
        if ($u === null) {
            $this->error('Not authenticated.', 401);
        }
        if (($u['role_name'] ?? '') !== 'partner') {
            $this->error('Partner access only.', 403);
        }
        $p = (new PartnerProfileModel())->findByUserId((int)$u['id']);
        if ($p === null || ($p['status'] ?? '') !== 'approved') {
            $this->error('Your partner account is not approved yet.', 403);
        }

        return $u;
    }

    private function hasPerm(string $key): bool
    {
        $u = $this->authUser();
        if ($u === null) {
            return false;
        }
        $p = $u['role_permissions_array'] ?? [];

        return in_array('*', $p, true) || in_array($key, $p, true);
    }

    /** GET /api/partner/dashboard */
    public function dashboard(): never
    {
        $u   = $this->assertPartner();
        $uid = (int)$u['id'];

        $assignments = new PartnerAssignmentModel();
        $payouts     = new PartnerPayoutModel();
        $banks       = new PartnerBankDetailModel();

        $activeCount    = $assignments->countByPartner($uid, 'in_progress');
        $completedCount = $assignments->countByPartner($uid, 'completed');
        $totalCount     = $assignments->countByPartner($uid);
        $availBalance   = $payouts->availableBalance($uid);
        $totalEarned    = $payouts->totalEarned($uid);
        $pendingPayouts = count(array_filter(
            $payouts->listRequestsForPartner($uid),
            static fn (array $r): bool => ($r['status'] ?? '') === 'pending'
        ));
        $bankRows = $banks->listByUserId($uid);
        $primary  = $bankRows[0] ?? null;

        $this->success([
            'assignments_active'    => $activeCount,
            'assignments_completed' => $completedCount,
            'assignments_total'     => $totalCount,
            'total_earned'          => $totalEarned,
            'available_balance'     => $availBalance,
            'pending_payouts'       => $pendingPayouts,
            'primary_bank_status'   => $primary['verification_status'] ?? 'none',
        ]);
    }

    /** GET /api/partner/assignments */
    public function assignments(): never
    {
        $u   = $this->assertPartner();
        $pg  = max(1, (int)$this->query('page', 1));
        $per = min(50, max(1, (int)$this->query('per_page', 20)));
        $st  = trim((string)$this->query('status', ''));
        $res = (new PartnerAssignmentModel())->paginateForPartner((int)$u['id'], $pg, $per, $st ?: null);

        $this->success($res['assignments'], 'OK', 200, [
            'pagination' => [
                'page' => $pg, 'per_page' => $per, 'total' => $res['total'],
                'last_page' => (int)ceil($res['total'] / $per),
            ],
        ]);
    }

    /** PATCH /api/partner/assignments/:id */
    public function assignmentUpdate(int $id): never
    {
        $u    = $this->assertPartner();
        $body = $this->getJsonBody();
        $st   = trim((string)($body['status'] ?? ''));

        if (!in_array($st, ['in_progress', 'completed'], true)) {
            $this->error('Status must be in_progress or completed.', 422);
        }

        $model = new PartnerAssignmentModel();
        $row   = $model->find($id);
        if ($row === null || (int)$row['partner_user_id'] !== (int)$u['id']) {
            $this->error('Assignment not found.', 404);
        }

        $model->updateStatus($id, $st, (int)$u['id']);
        $this->success(null, 'Assignment updated');
    }

    /** GET /api/partner/payouts */
    public function payoutIndex(): never
    {
        $u = $this->assertPartner();
        if (!$this->hasPerm('partner.payouts.request')) {
            $this->error('Access denied.', 403);
        }
        $this->success((new PartnerPayoutModel())->listRequestsForPartner((int)$u['id']));
    }

    /** POST /api/partner/payouts */
    public function payoutStore(): never
    {
        $u = $this->assertPartner();
        if (!$this->hasPerm('partner.payouts.request')) {
            $this->error('Access denied.', 403);
        }
        $body      = $this->getJsonBody();
        $maxAmount = (float)($body['max_amount'] ?? 0);
        if ($maxAmount <= 0) {
            $this->error('max_amount must be greater than zero.', 422);
        }

        $payoutModel = new PartnerPayoutModel();
        $rows        = $payoutModel->listAvailableForPayoutFifo((int)$u['id']);
        $lines       = [];
        $sum         = 0.0;
        foreach ($rows as $r) {
            $amt = (float)($r['amount'] ?? 0);
            if ($amt <= 0) {
                continue;
            }
            if ($sum + $amt > $maxAmount + 0.01) {
                continue;
            }
            $lines[] = [
                'accrual_id' => (int)$r['id'],
                'amount'     => $amt,
            ];
            $sum += $amt;
        }
        if ($sum <= 0 || $lines === []) {
            $this->error('No balance available for the requested amount.', 422);
        }

        $pid = $payoutModel->createWithLines((int)$u['id'], round($sum, 2), $lines);
        $this->success(['id' => $pid, 'allocated_amount' => round($sum, 2)], 'Payout request submitted', 201);
    }

    /** GET /api/partner/bank */
    public function bankIndex(): never
    {
        $u = $this->assertPartner();
        if (!$this->hasPerm('partner.bank.manage')) {
            $this->error('Access denied.', 403);
        }
        $this->success((new PartnerBankDetailModel())->listByUserId((int)$u['id']));
    }

    /** POST /api/partner/bank */
    public function bankStore(): never
    {
        $u = $this->assertPartner();
        if (!$this->hasPerm('partner.bank.manage')) {
            $this->error('Access denied.', 403);
        }
        $body   = $this->getJsonBody();
        $holder = trim((string)($body['account_holder_name'] ?? ''));
        $ifsc   = trim((string)($body['ifsc'] ?? ''));
        $num    = trim((string)($body['account_number'] ?? ''));
        if ($holder === '' || $ifsc === '' || strlen($num) < 4) {
            $this->error('account_holder_name, ifsc, and account_number are required.', 422);
        }
        $id = (new PartnerBankDetailModel())->insert([
            'user_id'              => (int)$u['id'],
            'account_holder_name'  => $holder,
            'bank_name'            => trim((string)($body['bank_name'] ?? '')) ?: null,
            'account_number'       => $num,
            'ifsc'                 => $ifsc,
            'is_primary'           => !empty($body['is_primary']),
        ]);
        $this->success(['id' => $id], 'Bank detail saved', 201);
    }

    /** GET /api/partner/accruals */
    public function accruals(): never
    {
        $u  = $this->assertPartner();
        $pg = max(1, (int)$this->query('page', 1));
        $per = min(100, max(1, (int)$this->query('per_page', 30)));

        $this->success((new PartnerPayoutModel())->listAccrualsForPartner((int)$u['id'], $pg, $per));
    }
}
