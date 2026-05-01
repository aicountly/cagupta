<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\PartnerAssignmentModel;
use App\Models\PartnerBankDetailModel;
use App\Models\PartnerPayoutModel;
use App\Models\PartnerProfileModel;
use App\Models\RoleModel;
use App\Models\UserModel;

/**
 * Admin endpoints for managing partners — approve/suspend, assign work, manage payouts.
 */
final class PartnerAdminController extends BaseController
{
    /** GET /api/admin/partners */
    public function index(): never
    {
        $status = trim((string)$this->query('status', ''));
        $pg     = max(1, (int)$this->query('page', 1));
        $per    = min(100, max(1, (int)$this->query('per_page', 50)));
        $model  = new PartnerProfileModel();

        $rows = ($status !== '')
            ? $model->listByStatus($status, $pg, $per)
            : $model->listAll($pg, $per);

        $this->success($rows, 'OK', 200, [
            'pagination' => ['page' => $pg, 'per_page' => $per],
        ]);
    }

    /** PATCH /api/admin/partners/:id/approve */
    public function approve(int $userId): never
    {
        $admin = $this->authUser();
        $model = new PartnerProfileModel();
        $p     = $model->findByUserId($userId);
        if ($p === null) {
            $this->error('Partner profile not found.', 404);
        }
        $model->setStatus($userId, 'approved', (int)$admin['id']);
        $this->success(null, 'Partner approved');
    }

    /** PATCH /api/admin/partners/:id/suspend */
    public function suspend(int $userId): never
    {
        $admin = $this->authUser();
        $model = new PartnerProfileModel();
        $p     = $model->findByUserId($userId);
        if ($p === null) {
            $this->error('Partner profile not found.', 404);
        }
        $model->setStatus($userId, 'suspended', (int)$admin['id']);
        $this->success(null, 'Partner suspended');
    }

    /** POST /api/admin/partners/create */
    public function create(): never
    {
        $admin = $this->authUser();
        $body  = $this->getJsonBody();
        $name  = trim((string)($body['name'] ?? ''));
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $pass  = (string)($body['password'] ?? '');
        $spec  = trim((string)($body['specialty'] ?? ''));

        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($pass) < 8) {
            $this->error('name, valid email, and password (min 8 chars) are required.', 422);
        }

        $users = new UserModel();
        if ($users->findByEmail($email) !== null) {
            $this->error('A user with this email already exists.', 409);
        }

        $role = (new RoleModel())->findByName('partner');
        if ($role === null) {
            $this->error('Partner role is not configured. Run migration 046.', 500);
        }

        $newId = $users->create([
            'name'       => $name,
            'email'      => $email,
            'password'   => $pass,
            'role_id'    => (int)$role['id'],
            'is_active'  => true,
            'created_by' => (int)$admin['id'],
        ]);

        (new PartnerProfileModel())->insertPending($newId, $spec ?: null);
        $this->success(['id' => $newId], 'Partner created pending approval', 201);
    }

    /** POST /api/admin/partner-assignments */
    public function assignWork(): never
    {
        $admin = $this->authUser();
        $body  = $this->getJsonBody();
        $sid   = (int)($body['service_id'] ?? 0);
        $pid   = (int)($body['partner_user_id'] ?? 0);
        $pct   = isset($body['partner_payout_pct']) ? (float)$body['partner_payout_pct'] : null;
        $flat  = isset($body['partner_payout_flat']) ? (float)$body['partner_payout_flat'] : null;
        $notes = trim((string)($body['notes'] ?? ''));

        if ($sid <= 0 || $pid <= 0) {
            $this->error('service_id and partner_user_id are required.', 422);
        }

        $profile = (new PartnerProfileModel())->findByUserId($pid);
        if ($profile === null || ($profile['status'] ?? '') !== 'approved') {
            $this->error('Partner is not approved.', 422);
        }

        $id = (new PartnerAssignmentModel())->create([
            'service_id'         => $sid,
            'partner_user_id'    => $pid,
            'assigned_by'        => (int)$admin['id'],
            'partner_payout_pct' => $pct,
            'partner_payout_flat'=> $flat,
            'notes'              => $notes ?: null,
        ]);
        $this->success(['id' => $id], 'Work assigned to partner', 201);
    }

    /** GET /api/admin/partner-assignments */
    public function assignmentsIndex(): never
    {
        $pg  = max(1, (int)$this->query('page', 1));
        $per = min(100, max(1, (int)$this->query('per_page', 50)));
        $st  = trim((string)$this->query('status', ''));
        $res = (new PartnerAssignmentModel())->paginateAll($pg, $per, $st ?: null);

        $this->success($res['assignments'], 'OK', 200, [
            'pagination' => [
                'page' => $pg, 'per_page' => $per, 'total' => $res['total'],
                'last_page' => (int)ceil($res['total'] / $per),
            ],
        ]);
    }

    /** GET /api/admin/partner-payout-requests */
    public function payoutIndex(): never
    {
        $pg  = max(1, (int)$this->query('page', 1));
        $per = min(50, max(1, (int)$this->query('per_page', 20)));
        $st  = trim((string)$this->query('status', ''));
        $this->success(
            (new PartnerPayoutModel())->listAllRequests($pg, $per, $st ?: null)
        );
    }

    /** PATCH /api/admin/partner-payout-requests/:id */
    public function payoutUpdate(int $id): never
    {
        $admin = $this->authUser();
        $body  = $this->getJsonBody();
        $st    = trim((string)($body['status'] ?? ''));

        if (!in_array($st, ['approved', 'paid', 'rejected'], true)) {
            $this->error('Status must be approved, paid, or rejected.', 422);
        }

        $model = new PartnerPayoutModel();
        $row   = $model->findRequest($id);
        if ($row === null) {
            $this->error('Payout request not found.', 404);
        }

        $model->updateRequestStatus($id, $st, (int)$admin['id'], trim((string)($body['admin_notes'] ?? '')) ?: null);
        $this->success(null, 'Payout request updated');
    }

    /** PATCH /api/admin/partner-bank/:id/verify */
    public function bankVerify(int $id): never
    {
        $admin  = $this->authUser();
        $body   = $this->getJsonBody();
        $st     = trim((string)($body['status'] ?? 'verified'));

        if (!in_array($st, ['verified', 'rejected'], true)) {
            $this->error('Status must be verified or rejected.', 422);
        }

        $model = new PartnerBankDetailModel();
        $row   = $model->find($id);
        if ($row === null) {
            $this->error('Bank detail not found.', 404);
        }

        $model->setVerification($id, $st, (int)$admin['id']);
        $this->success(null, "Bank detail {$st}");
    }
}
