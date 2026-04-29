<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Config\Auth as AuthConfig;
use App\Models\AffiliateProfileModel;
use App\Models\UserModel;
use App\Models\RoleModel;
use App\Libraries\BrevoMailer;
use App\Libraries\PasswordHasher;

/**
 * UserController — user and role management.
 *
 * Routes use permission_any: users.manage (full) or users.delegate (team they invited only).
 */
class UserController extends BaseController
{
    private UserModel $users;
    private RoleModel $roles;

    public function __construct()
    {
        $this->users = new UserModel();
        $this->roles = new RoleModel();
    }

    // ── GET /api/admin/users ─────────────────────────────────────────────────

    /**
     * Return a paginated list of users.
     *
     * Query params: page, per_page, search, role, status
     */
    public function index(): never
    {
        $page    = max(1, (int)$this->query('page', 1));
        $perPage = min(100, max(1, (int)$this->query('per_page', 20)));
        $search  = trim((string)$this->query('search', ''));
        $role    = trim((string)$this->query('role', ''));
        $status  = trim((string)$this->query('status', ''));

        $acting      = $this->authUser();
        $delegatorId = 0;
        if ($acting !== null && !$this->userHasManageAll() && $this->userHasDelegate()) {
            $delegatorId = (int)$acting['id'];
        }

        $result = $this->users->paginate($page, $perPage, $search, $role, $status, $delegatorId);

        $this->success($result['users'], 'Users retrieved', 200, [
            'pagination' => [
                'page'       => $page,
                'per_page'   => $perPage,
                'total'      => $result['total'],
                'last_page'  => (int)ceil($result['total'] / $perPage),
            ],
        ]);
    }

    // ── POST /api/admin/users ────────────────────────────────────────────────

    /**
     * Create a new user.
     *
     * Body: { name, email, password, role_id, is_active }
     */
    public function store(): never
    {
        $body  = $this->getJsonBody();
        $name  = trim((string)($body['name'] ?? ''));
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $pass  = (string)($body['password'] ?? '');

        // Validation
        $errors = [];
        if ($name === '') {
            $errors['name'][] = 'Name is required.';
        }
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'][] = 'A valid email address is required.';
        }
        if ($pass === '') {
            $errors['password'][] = 'Password is required.';
        } elseif (strlen($pass) < 8) {
            $errors['password'][] = 'Password must be at least 8 characters.';
        }

        if (!empty($errors)) {
            $this->error('Validation failed.', 422, $errors);
        }

        // Prevent duplicate email
        if ($this->users->findByEmail($email) !== null) {
            $this->error('A user with this email already exists.', 409);
        }

        $actingUser = $this->authUser();

        if (!$this->userHasManageAll() && $this->userHasDelegate()) {
            $this->assertDelegateAssignableRole((int)($body['role_id'] ?? 0));
        }

        $shiftTarget = 510;
        if (array_key_exists('shift_target_minutes', $body)) {
            $stv = (int)$body['shift_target_minutes'];
            if ($stv < 60 || $stv > 1440) {
                $this->error('shift_target_minutes must be between 60 and 1440.', 422);
            }
            $shiftTarget = $stv;
        }

        $newId = $this->users->create([
            'name'                 => $name,
            'email'                => $email,
            'password'             => $pass,
            'role_id'              => isset($body['role_id']) ? (int)$body['role_id'] : null,
            'is_active'            => isset($body['is_active']) ? (bool)$body['is_active'] : true,
            'created_by'           => $actingUser ? (int)$actingUser['id'] : null,
            'shift_target_minutes' => $shiftTarget,
        ]);

        $roleRow = isset($body['role_id']) ? $this->roles->find((int)$body['role_id']) : null;
        if ($roleRow !== null && ($roleRow['name'] ?? '') === 'affiliate') {
            (new AffiliateProfileModel())->insertPending($newId, null);
        }

        $user = $this->users->find($newId);
        $this->success($this->formatUserRow($user), 'User created', 201);
    }

    // ── GET /api/admin/users/:id ─────────────────────────────────────────────

    /**
     * Return a single user.
     */
    public function show(int $id): never
    {
        $user = $this->users->find($id);
        if ($user === null) {
            $this->error('User not found.', 404);
        }
        $this->assertUserRowVisible($user);
        $this->success($this->formatUserRow($user));
    }

    // ── PUT /api/admin/users/:id ─────────────────────────────────────────────

    /**
     * Update a user's profile.
     *
     * Body: { name?, email?, role_id?, is_active? }
     * Cannot modify the super-admin account.
     */
    public function update(int $id): never
    {
        $user = $this->users->find($id);
        if ($user === null) {
            $this->error('User not found.', 404);
        }
        $this->assertUserRowVisible($user);

        // Protect the hardcoded super admin
        if ($this->isSuperAdminEmail($user['email'])) {
            $this->error('The super-admin account cannot be modified.', 403);
        }

        $body = $this->getJsonBody();

        if (!$this->userHasManageAll() && $this->userHasDelegate() && array_key_exists('role_id', $body)) {
            $this->assertDelegateAssignableRole((int)$body['role_id']);
        }
        $data = [];

        if (isset($body['name'])) {
            $name = trim((string)$body['name']);
            if ($name === '') {
                $this->error('Name cannot be empty.', 422);
            }
            $data['name'] = $name;
        }
        if (isset($body['email'])) {
            $email = strtolower(trim((string)$body['email']));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $this->error('Invalid email address.', 422);
            }
            // Prevent duplicate email (excluding this user)
            $existing = $this->users->findByEmail($email);
            if ($existing !== null && (int)$existing['id'] !== $id) {
                $this->error('Email is already used by another account.', 409);
            }
            $data['email'] = $email;
        }
        if (isset($body['role_id'])) {
            $data['role_id'] = (int)$body['role_id'];
        }
        if (isset($body['is_active'])) {
            $data['is_active'] = (bool)$body['is_active'];
        }
        if (array_key_exists('planned_billable_rate_per_hour', $body)) {
            $v = $body['planned_billable_rate_per_hour'];
            if ($v === '' || $v === null) {
                $data['planned_billable_rate_per_hour'] = null;
            } elseif (is_numeric($v)) {
                $n = round((float)$v, 2);
                if ($n < 0) {
                    $this->error('planned_billable_rate_per_hour cannot be negative.', 422);
                }
                $data['planned_billable_rate_per_hour'] = $n;
            } else {
                $this->error('planned_billable_rate_per_hour must be a number or empty.', 422);
            }
        }
        if (!empty($body['password'])) {
            $pass = (string)$body['password'];
            if (strlen($pass) < 8) {
                $this->error('Password must be at least 8 characters.', 422);
            }
            $data['password'] = $pass;
        }
        if (array_key_exists('shift_target_minutes', $body)) {
            $stv = (int)$body['shift_target_minutes'];
            if ($stv < 60 || $stv > 1440) {
                $this->error('shift_target_minutes must be between 60 and 1440.', 422);
            }
            $data['shift_target_minutes'] = $stv;
        }

        $this->users->update($id, $data);
        $updated = $this->users->find($id);

        // ── Password-change alert (best-effort) ───────────────────────────────
        if (!empty($data['password'])) {
            try {
                $ipAddress = $_SERVER['REMOTE_ADDR'] ?? 'Unknown';
                $htmlBody  = BrevoMailer::renderTemplate('password-changed', [
                    'userName'  => $updated['name']  ?? '',
                    'userEmail' => $updated['email'] ?? '',
                    'changedAt' => date('d M Y, h:i A T'),
                    'ipAddress' => $ipAddress,
                ]);
                if ($htmlBody !== '') {
                    BrevoMailer::send(
                        $updated['email'] ?? '',
                        $updated['name']  ?? '',
                        'Password Changed Successfully - CA Rahul Gupta',
                        $htmlBody
                    );
                }
            } catch (\Throwable $e) {
                error_log('[UserController] Password-change alert failed: ' . $e->getMessage());
            }
        }

        $this->success($this->formatUserRow($updated), 'User updated');
    }

    // ── DELETE /api/admin/users/:id ──────────────────────────────────────────

    /**
     * Soft-delete (deactivate) a user.
     *
     * Cannot delete the super-admin account.
     */
    public function destroy(int $id): never
    {
        $user = $this->users->find($id);
        if ($user === null) {
            $this->error('User not found.', 404);
        }
        $this->assertUserRowVisible($user);

        if ($this->isSuperAdminEmail($user['email'])) {
            $this->error('The super-admin account cannot be deleted.', 403);
        }

        $this->users->deactivate($id);
        $this->success(null, 'User deactivated');
    }

    // ── GET /api/admin/roles ─────────────────────────────────────────────────

    /**
     * Return all roles with permissions.
     */
    public function roles(): never
    {
        $all = $this->roles->all();
        if (!$this->userHasManageAll() && $this->userHasDelegate()) {
            $all = array_values(array_filter(
                $all,
                static fn (array $r): bool => in_array($r['name'] ?? '', ['staff', 'viewer'], true)
            ));
        }
        $this->success($all);
    }

    // ── PUT /api/admin/roles/:id ─────────────────────────────────────────────

    /**
     * Update a role's permissions JSONB.
     *
     * Cannot modify the super_admin role.
     * Body: { permissions: string[] }
     */
    public function updateRole(int $id): never
    {
        $role = $this->roles->find($id);
        if ($role === null) {
            $this->error('Role not found.', 404);
        }
        if ($role['name'] === 'super_admin') {
            $this->error('The super_admin role permissions cannot be modified.', 403);
        }

        $body        = $this->getJsonBody();
        $permissions = $body['permissions'] ?? [];
        if (!is_array($permissions)) {
            $this->error('permissions must be an array of strings.', 422);
        }

        $this->roles->updatePermissions($id, ['permissions' => array_values($permissions)]);
        $updated = $this->roles->find($id);
        $this->success($updated, 'Role updated');
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private function userHasManageAll(): bool
    {
        $u = $this->authUser();
        if ($u === null) {
            return false;
        }
        if (strtolower((string)($u['email'] ?? '')) === strtolower(AuthConfig::SUPER_ADMIN_EMAIL)) {
            return true;
        }
        $p = $u['role_permissions_array'] ?? [];

        return in_array('*', $p, true) || in_array('users.manage', $p, true);
    }

    private function userHasDelegate(): bool
    {
        $u = $this->authUser();
        if ($u === null) {
            return false;
        }
        $p = $u['role_permissions_array'] ?? [];

        return in_array('users.delegate', $p, true);
    }

    /**
     * @param array<string, mixed> $user
     */
    private function assertUserRowVisible(array $user): void
    {
        if ($this->userHasManageAll()) {
            return;
        }
        $acting = $this->authUser();
        if ($acting === null) {
            $this->error('Not authenticated.', 401);
        }
        $aid = (int)$acting['id'];
        if ((int)$user['id'] === $aid) {
            return;
        }
        if ($this->userHasDelegate() && (int)($user['created_by'] ?? 0) === $aid) {
            return;
        }
        $this->error('Access denied.', 403);
    }

    private function assertDelegateAssignableRole(int $roleId): void
    {
        if ($roleId <= 0) {
            $this->error('role_id is required.', 422);
        }
        $role = $this->roles->find($roleId);
        if ($role === null) {
            $this->error('Invalid role.', 422);
        }
        $allowed = ['staff', 'viewer'];
        if (!in_array($role['name'], $allowed, true)) {
            $this->error('Delegated administrators may only assign staff or viewer roles.', 422);
        }
    }

    /**
     * Normalise a user row for API output.
     *
     * @param array<string, mixed>|null $user
     * @return array<string, mixed>
     */
    private function formatUserRow(?array $user): array
    {
        if ($user === null) {
            return [];
        }
        return [
            'id'           => (int)$user['id'],
            'name'         => $user['name'],
            'email'        => $user['email'],
            'role'         => $user['role_name'] ?? null,
            'role_display' => $user['role_display_name'] ?? null,
            'is_active'    => (bool)$user['is_active'],
            'is_email_verified' => (bool)$user['is_email_verified'],
            'avatar_url'   => $user['avatar_url'] ?? null,
            'last_login_at'  => $user['last_login_at'] ?? null,
            'login_provider' => $user['login_provider'] ?? 'local',
            'created_at'   => $user['created_at'],
            'planned_billable_rate_per_hour' => isset($user['planned_billable_rate_per_hour']) && $user['planned_billable_rate_per_hour'] !== null && $user['planned_billable_rate_per_hour'] !== ''
                ? round((float)$user['planned_billable_rate_per_hour'], 2)
                : null,
            'shift_target_minutes' => (int)($user['shift_target_minutes'] ?? 510),
        ];
    }
}
