<?php
declare(strict_types=1);

namespace App\Controllers\Associate;

use App\Controllers\BaseController;
use App\Models\AssociateBankDetailModel;
use App\Models\AssociateProfileModel;
use App\Models\AssociateRedemptionRequestModel;
use App\Models\AssociateRewardLedgerModel;
use App\Models\CommissionAccrualModel;
use App\Models\PayoutRequestModel;
use App\Models\RoleModel;
use App\Models\ServiceModel;
use App\Models\UserModel;

/**
 * Authenticated associate portal APIs.
 */
final class AssociatePortalController extends BaseController
{
    private function assertAssociate(): array
    {
        $u = $this->authUser();
        if ($u === null) {
            $this->error('Not authenticated.', 401);
        }
        if (($u['role_name'] ?? '') !== 'associate') {
            $this->error('Associate access only.', 403);
        }
        $p = (new AssociateProfileModel())->findByUserId((int)$u['id']);
        if ($p === null || ($p['status'] ?? '') !== 'approved') {
            $this->error('Your associate account is not approved yet.', 403);
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

    /** GET /api/associate/dashboard */
    public function dashboard(): never
    {
        $u         = $this->assertAssociate();
        $uid       = (int)$u['id'];
        $services  = new ServiceModel();
        $accruals  = new CommissionAccrualModel();
        $payouts   = new PayoutRequestModel();
        $banks     = new AssociateBankDetailModel();

        $svcCount = $services->paginateForReferringAssociate($uid, 1, 1)['total'];
        $ytd      = $accruals->paginateForAssociate($uid, 1, 1, date('Y') . '-01-01', date('Y') . '-12-31');
        $avail    = $accruals->availableBalance($uid);
        $pendingP = count(array_filter(
            $payouts->listForAssociate($uid),
            static fn (array $r): bool => ($r['status'] ?? '') === 'pending'
        ));
        $bankRows = $banks->listByUserId($uid);
        $primary  = $bankRows[0] ?? null;

        $this->success([
            'services_total'       => $svcCount,
            'ytd_commission_total' => $ytd['total'],
            'available_balance'    => $avail,
            'pending_payouts'      => $pendingP,
            'primary_bank_status'  => $primary['verification_status'] ?? 'none',
        ]);
    }

    /** GET /api/associate/services */
    public function services(): never
    {
        $u   = $this->assertAssociate();
        $pg  = max(1, (int)$this->query('page', 1));
        $per = min(50, max(1, (int)$this->query('per_page', 20)));
        $res = (new ServiceModel())->paginateForReferringAssociate((int)$u['id'], $pg, $per);
        foreach ($res['services'] as &$s) {
            $s = $this->maskServiceClient($s);
        }
        unset($s);
        $this->success($res['services'], 'OK', 200, [
            'pagination' => [
                'page' => $pg, 'per_page' => $per, 'total' => $res['total'],
                'last_page' => (int)ceil($res['total'] / $per),
            ],
        ]);
    }

    /**
     * @param array<string, mixed> $s
     * @return array<string, mixed>
     */
    private function maskServiceClient(array $s): array
    {
        $name = (string)($s['client_name'] ?? 'Client');
        $s['client_display'] = strlen($name) > 2 ? substr($name, 0, 2) . '…' : $name;
        unset($s['client_name']);

        return $s;
    }

    /** GET /api/associate/commissions */
    public function commissions(): never
    {
        $u    = $this->assertAssociate();
        $pg   = max(1, (int)$this->query('page', 1));
        $per  = min(100, max(1, (int)$this->query('per_page', 30)));
        $from = trim((string)$this->query('date_from', ''));
        $to   = trim((string)$this->query('date_to', ''));
        $res  = (new CommissionAccrualModel())->paginateForAssociate((int)$u['id'], $pg, $per, $from ?: null, $to ?: null);
        $this->success($res['rows'], 'OK', 200, [
            'pagination' => [
                'page' => $pg, 'per_page' => $per,
                'period_total' => $res['total'],
            ],
        ]);
    }

    /** GET /api/associate/statement */
    public function statement(): never
    {
        $this->commissions();
    }

    /** GET /api/associate/bank */
    public function bankIndex(): never
    {
        $u = $this->assertAssociate();
        if (!$this->hasPerm('associate.bank.manage')) {
            $this->error('Access denied.', 403);
        }
        $this->success((new AssociateBankDetailModel())->listByUserId((int)$u['id']));
    }

    /** POST /api/associate/bank */
    public function bankStore(): never
    {
        $u = $this->assertAssociate();
        if (!$this->hasPerm('associate.bank.manage')) {
            $this->error('Access denied.', 403);
        }
        $body = $this->getJsonBody();
        $holder = trim((string)($body['account_holder_name'] ?? ''));
        $ifsc   = trim((string)($body['ifsc'] ?? ''));
        $num    = trim((string)($body['account_number'] ?? ''));
        if ($holder === '' || $ifsc === '' || strlen($num) < 4) {
            $this->error('account_holder_name, ifsc, and account_number are required.', 422);
        }
        $id = (new AssociateBankDetailModel())->insert([
            'user_id'              => (int)$u['id'],
            'account_holder_name'  => $holder,
            'bank_name'            => trim((string)($body['bank_name'] ?? '')) ?: null,
            'account_number'       => $num,
            'ifsc'                 => $ifsc,
            'is_primary'           => !empty($body['is_primary']),
        ]);
        $this->success(['id' => $id], 'Bank detail saved', 201);
    }

    /** GET /api/associate/payout-requests */
    public function payoutIndex(): never
    {
        $u = $this->assertAssociate();
        if (!$this->hasPerm('associate.payouts.request')) {
            $this->error('Access denied.', 403);
        }
        $this->success((new PayoutRequestModel())->listForAssociate((int)$u['id']));
    }

    /** POST /api/associate/payout-requests */
    public function payoutStore(): never
    {
        $u = $this->assertAssociate();
        if (!$this->hasPerm('associate.payouts.request')) {
            $this->error('Access denied.', 403);
        }
        $body       = $this->getJsonBody();
        $maxAmount  = (float)($body['max_amount'] ?? 0);
        $fastTrack  = !empty($body['fast_track']);
        if ($maxAmount <= 0) {
            $this->error('max_amount must be greater than zero.', 422);
        }

        $accrualModel = new CommissionAccrualModel();
        $rows         = $accrualModel->listAvailableForPayoutFifo((int)$u['id']);
        $lines        = [];
        $sum          = 0.0;
        foreach ($rows as $r) {
            $amt = (float)($r['amount'] ?? 0);
            if ($amt <= 0) {
                continue;
            }
            if ($sum + $amt > $maxAmount + 0.01) {
                continue;
            }
            $lines[] = [
                'commission_accrual_id' => (int)$r['id'],
                'amount'                => $amt,
            ];
            $sum += $amt;
        }
        if ($sum <= 0 || $lines === []) {
            $this->error('No commission balance available for the requested amount.', 422);
        }

        $pid = (new PayoutRequestModel())->createWithLines((int)$u['id'], round($sum, 2), $fastTrack, $lines);
        $this->success(['id' => $pid, 'allocated_amount' => round($sum, 2)], 'Payout request submitted', 201);
    }

    /** POST /api/associate/sub-associates */
    public function subAssociateStore(): never
    {
        $u = $this->assertAssociate();
        if (!$this->hasPerm('associate.sub_associates.create')) {
            $this->error('Access denied.', 403);
        }
        $body = $this->getJsonBody();
        $name = trim((string)($body['name'] ?? ''));
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $pass  = (string)($body['password'] ?? '');
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($pass) < 8) {
            $this->error('name, valid email, and password (min 8 chars) are required.', 422);
        }
        $users = new UserModel();
        if ($users->findByEmail($email) !== null) {
            $this->error('A user with this email already exists.', 409);
        }
        $role = (new RoleModel())->findByName('associate');
        if ($role === null) {
            $this->error('Associate role is not configured.', 500);
        }
        $newId = $users->create([
            'name'       => $name,
            'email'      => $email,
            'password'   => $pass,
            'role_id'    => (int)$role['id'],
            'is_active'  => true,
            'created_by' => (int)$u['id'],
        ]);
        (new AssociateProfileModel())->insertPendingWithParent($newId, (int)$u['id']);
        $this->success(['id' => $newId], 'Sub-associate registered pending approval', 201);
    }

    /** GET /api/associate/rewards */
    public function rewardsIndex(): never
    {
        $u      = $this->assertAssociate();
        $uid    = (int)$u['id'];
        $ledger = new AssociateRewardLedgerModel();
        $rows   = $ledger->listForAssociate($uid, 40);
        $masked = [];
        foreach ($rows as $r) {
            $masked[] = [
                'id'           => (int)$r['id'],
                'delta_points' => (int)$r['delta_points'],
                'kind'         => (string)$r['kind'],
                'label'        => (string)($r['label'] ?? ''),
                'created_at'   => (string)$r['created_at'],
            ];
        }
        $this->success([
            'balance_points' => $ledger->balancePoints($uid),
            'value_inr_per_point' => 1,
            'catalog' => [
                ['catalog_key' => 'amazon_voucher', 'label' => 'Amazon (placeholder)', 'min_points' => 500],
                ['catalog_key' => 'petrol_voucher', 'label' => 'Petrol / fuel (placeholder)', 'min_points' => 300],
            ],
            'ledger' => $masked,
            'redemptions' => (new AssociateRedemptionRequestModel())->listForAssociate($uid),
        ]);
    }

    /** POST /api/associate/rewards/redeem */
    public function rewardsRedeem(): never
    {
        $u    = $this->assertAssociate();
        $body = $this->getJsonBody();
        $key  = trim((string)($body['catalog_key'] ?? ''));
        $pts  = (int)($body['points'] ?? 0);
        if ($key === '' || $pts < 1) {
            $this->error('catalog_key and positive points required.', 422);
        }
        $ledger = new AssociateRewardLedgerModel();
        if ($ledger->balancePoints((int)$u['id']) < $pts) {
            $this->error('Insufficient points.', 422);
        }
        $allowed = ['amazon_voucher', 'petrol_voucher'];
        if (!in_array($key, $allowed, true)) {
            $this->error('Unknown catalog item.', 422);
        }
        $id = (new AssociateRedemptionRequestModel())->createPending((int)$u['id'], $key, $pts);
        $this->success(['id' => $id], 'Request submitted', 201);
    }
}
