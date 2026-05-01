<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\AdminAuditLogModel;
use App\Models\AffiliateBankDetailModel;
use App\Models\AffiliateCommissionRateModel;
use App\Models\AffiliateProfileModel;
use App\Models\FirmCommissionDefaultsModel;
use App\Models\PayoutRequestModel;
use App\Models\UserModel;

/**
 * Staff management of affiliates, commission defaults, rates, payouts, KYC.
 */
final class AffiliateAdminController extends BaseController
{
    private function assertPerm(): void
    {
        $u = $this->authUser();
        if ($u === null) {
            $this->error('Not authenticated.', 401);
        }
        $p = $u['role_permissions_array'] ?? [];
        if (in_array('*', $p, true) || in_array('affiliates.manage', $p, true)) {
            return;
        }
        $this->error('Access denied. Required permission: affiliates.manage.', 403);
    }

    /** GET /api/admin/affiliates */
    public function index(): never
    {
        $this->assertPerm();
        $status = trim((string)$this->query('status', ''));
        $page   = max(1, (int)$this->query('page', 1));
        $per    = min(100, max(1, (int)$this->query('per_page', 30)));

        $profiles = new AffiliateProfileModel();
        if ($status === 'all' || $status === '') {
            $rows = $profiles->listAll($page, $per);
        } else {
            $st = in_array($status, ['pending', 'approved', 'suspended'], true) ? $status : 'pending';
            $rows = $profiles->listByStatus($st, $page, $per);
        }
        $this->success($rows);
    }

    /** PATCH /api/admin/affiliates/:userId/approve */
    public function approve(int $userId): never
    {
        $this->assertPerm();
        $actor = $this->authUser();
        (new AffiliateProfileModel())->setStatus($userId, 'approved', $actor ? (int)$actor['id'] : null);
        try {
            (new AdminAuditLogModel())->insert(
                $actor ? (int)$actor['id'] : null,
                'affiliate.approved',
                'affiliate_profile',
                $userId,
                [],
                null,
                null
            );
        } catch (\Throwable $e) {
            error_log('[AffiliateAdmin] audit: ' . $e->getMessage());
        }
        $this->success(null, 'Affiliate approved');
    }

    /** PATCH /api/admin/affiliates/:userId/suspend */
    public function suspend(int $userId): never
    {
        $this->assertPerm();
        $actor = $this->authUser();
        (new AffiliateProfileModel())->setStatus($userId, 'suspended', $actor ? (int)$actor['id'] : null);
        $this->success(null, 'Affiliate suspended');
    }

    /** GET /api/admin/commission-defaults */
    public function commissionDefaults(): never
    {
        $this->assertPerm();
        $this->success((new FirmCommissionDefaultsModel())->get());
    }

    /** PUT /api/admin/commission-defaults */
    public function updateCommissionDefaults(): never
    {
        $this->assertPerm();
        $body = $this->getJsonBody();
        (new FirmCommissionDefaultsModel())->update($body);
        $this->success((new FirmCommissionDefaultsModel())->get(), 'Defaults updated');
    }

    /** GET /api/admin/affiliates/:userId/rates */
    public function ratesIndex(int $userId): never
    {
        $this->assertPerm();
        $this->success((new AffiliateCommissionRateModel())->listForAffiliate($userId));
    }

    /** POST /api/admin/affiliates/:userId/rates */
    public function ratesStore(int $userId): never
    {
        $this->assertPerm();
        $body = $this->getJsonBody();
        $tier = (int)($body['tier'] ?? 0);
        $pct  = (float)($body['percent'] ?? 0);
        if (!in_array($tier, [1, 2, 3], true) || $pct < 0 || $pct > 100) {
            $this->error('tier (1–3) and percent (0–100) are required.', 422);
        }
        $id = (new AffiliateCommissionRateModel())->insert([
            'affiliate_user_id' => $userId,
            'tier'              => $tier,
            'percent'           => $pct,
            'effective_from'    => $body['effective_from'] ?? date('Y-m-d'),
            'effective_to'      => $body['effective_to'] ?? null,
        ]);
        $this->success(['id' => $id], 'Rate row added', 201);
    }

    /** DELETE /api/admin/affiliate-rates/:id */
    public function ratesDestroy(int $id): never
    {
        $this->assertPerm();
        (new AffiliateCommissionRateModel())->delete($id);
        $this->success(null, 'Rate row deleted');
    }

    /** GET /api/admin/payout-requests */
    public function payoutIndex(): never
    {
        $this->assertPerm();
        $status = trim((string)$this->query('status', ''));
        $page   = max(1, (int)$this->query('page', 1));
        $per    = min(100, max(1, (int)$this->query('per_page', 30)));
        $this->success((new PayoutRequestModel())->listAll($status, $page, $per));
    }

    /** PATCH /api/admin/payout-requests/:id */
    public function payoutUpdate(int $id): never
    {
        $this->assertPerm();
        $body   = $this->getJsonBody();
        $status = trim((string)($body['status'] ?? ''));
        if (!in_array($status, ['approved', 'paid', 'rejected'], true)) {
            $this->error('status must be approved, paid, or rejected.', 422);
        }
        $pr  = new PayoutRequestModel();
        $row = $pr->find($id);
        if ($row === null) {
            $this->error('Payout request not found.', 404);
        }
        $cur = (string)($row['status'] ?? '');
        if ($cur === 'paid') {
            $this->error('This payout is already marked paid.', 422);
        }
        if ($status === 'approved' && $cur !== 'pending') {
            $this->error('Only pending requests can be approved.', 422);
        }
        $actor = $this->authUser();
        $notes = isset($body['admin_notes']) ? (string)$body['admin_notes'] : null;

        if ($status === 'rejected') {
            $pr->releaseAccrualsForRejected($id);
        }
        if ($status === 'paid') {
            if (!in_array($cur, ['pending', 'approved'], true)) {
                $this->error('Invalid payout state for paid.', 422);
            }
            $pr->finalizeAccrualsPaid($id);
        }

        $pr->setStatus($id, $status, $actor ? (int)$actor['id'] : null, $notes);
        try {
            (new AdminAuditLogModel())->insert(
                $actor ? (int)$actor['id'] : null,
                'payout.' . $status,
                'payout_request',
                $id,
                ['status' => $status],
                null,
                null
            );
        } catch (\Throwable $e) {
            error_log('[AffiliateAdmin] audit: ' . $e->getMessage());
        }
        $this->success($pr->find($id), 'Payout updated');
    }

    /** PATCH /api/admin/affiliate-bank/:id/verify */
    public function bankVerify(int $id): never
    {
        $this->assertPerm();
        $body   = $this->getJsonBody();
        $status = trim((string)($body['verification_status'] ?? ''));
        if (!in_array($status, ['verified', 'rejected', 'pending'], true)) {
            $this->error('verification_status invalid.', 422);
        }
        $actor = $this->authUser();
        (new AffiliateBankDetailModel())->setVerification($id, $status, $actor ? (int)$actor['id'] : null);
        $this->success(null, 'Bank verification updated');
    }
}
