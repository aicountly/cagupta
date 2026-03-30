<?php
declare(strict_types=1);

namespace App\Controllers\Auth;

use App\Controllers\BaseController;
use App\Config\Auth as AuthConfig;
use App\Libraries\JWT;
use App\Libraries\PasswordHasher;
use App\Models\UserModel;
use App\Models\RoleModel;
use App\Models\SessionModel;

/**
 * AuthController — login, SSO, logout, me, refresh.
 */
class AuthController extends BaseController
{
    private UserModel    $users;
    private RoleModel    $roles;
    private SessionModel $sessions;

    public function __construct()
    {
        $this->users    = new UserModel();
        $this->roles    = new RoleModel();
        $this->sessions = new SessionModel();
    }

    // ── POST /api/auth/login ─────────────────────────────────────────────────

    /**
     * Authenticate with email + password.
     */
    public function login(): never
    {
        $body  = $this->getJsonBody();
        $email = trim((string)($body['email'] ?? ''));
        $pass  = (string)($body['password'] ?? '');

        if ($email === '' || $pass === '') {
            $this->error('Email and password are required.', 422);
        }

        $user = $this->users->findByEmail($email);
        if ($user === null || !$user['is_active']) {
            $this->error('Invalid credentials.', 401);
        }

        // Super admin may have no password set — require SSO in that case
        if ($user['password_hash'] === null || $user['password_hash'] === '') {
            $this->error('Password login is not configured for this account. Please use SSO.', 403);
        }

        if (!PasswordHasher::verify($pass, $user['password_hash'])) {
            $this->error('Invalid credentials.', 401);
        }

        $this->users->touchLastLogin((int)$user['id']);
        $result = $this->buildSession($user);
        $this->success($result, 'Login successful');
    }

    // ── POST /api/auth/sso ───────────────────────────────────────────────────

    /**
     * Authenticate via SSO (Google / Microsoft).
     *
     * Body: { provider, sso_token, name, email, avatar_url? }
     */
    public function sso(): never
    {
        $body     = $this->getJsonBody();
        $provider = strtolower(trim((string)($body['provider'] ?? '')));
        $email    = strtolower(trim((string)($body['email'] ?? '')));
        $name     = trim((string)($body['name'] ?? ''));
        $ssoToken = trim((string)($body['sso_token'] ?? ''));
        $avatar   = trim((string)($body['avatar_url'] ?? ''));

        if (!in_array($provider, AuthConfig::SSO_PROVIDERS, true)) {
            $this->error('Unsupported SSO provider.', 422);
        }
        if ($email === '' || $ssoToken === '') {
            $this->error('email and sso_token are required.', 422);
        }

        // Look up existing user; create one if needed
        $user = $this->users->findByEmail($email);

        if ($user === null) {
            $superAdminRole = $this->roles->findByName('super_admin');
            $viewerRole     = $this->roles->findByName('viewer');
            $isSuperAdmin   = strtolower($email) === strtolower(AuthConfig::SUPER_ADMIN_EMAIL);
            $roleId         = $isSuperAdmin ? ($superAdminRole['id'] ?? null) : ($viewerRole['id'] ?? null);

            $newId = $this->users->create([
                'name'            => $name ?: $email,
                'email'           => $email,
                'role_id'         => $roleId,
                'is_active'       => true,
                'is_email_verified' => true,
                'login_provider'  => $provider,
                'sso_provider_id' => $ssoToken,
                'avatar_url'      => $avatar ?: null,
            ]);
            $user = $this->users->find($newId);
        } else {
            // Update SSO fields if changed
            $this->users->update((int)$user['id'], [
                'sso_provider_id' => $ssoToken,
                'avatar_url'      => $avatar ?: ($user['avatar_url'] ?? null),
                'last_login_at'   => date('Y-m-d H:i:sO'),
            ]);
            $user = $this->users->find((int)$user['id']);
        }

        if ($user === null || !$user['is_active']) {
            $this->error('Account is deactivated.', 403);
        }

        $result = $this->buildSession($user);
        $this->success($result, 'SSO login successful');
    }

    // ── POST /api/auth/logout ────────────────────────────────────────────────

    /**
     * Invalidate the current session token.
     *
     * Requires: Bearer token (enforced by AuthFilter).
     */
    public function logout(): never
    {
        $this->sessions->deleteByToken($this->authToken());
        $this->success(null, 'Logged out successfully');
    }

    // ── GET /api/auth/me ─────────────────────────────────────────────────────

    /**
     * Return the currently authenticated user's profile.
     *
     * Requires: Bearer token (enforced by AuthFilter).
     */
    public function me(): never
    {
        $user = $this->authUser();
        $this->success($this->formatUser($user));
    }

    // ── POST /api/auth/refresh ───────────────────────────────────────────────

    /**
     * Exchange the current token for a new one with a fresh expiry.
     *
     * Requires: Bearer token (enforced by AuthFilter).
     */
    public function refresh(): never
    {
        $user      = $this->authUser();
        $oldToken  = $this->authToken();

        // Delete old session
        $this->sessions->deleteByToken($oldToken);

        // Re-load fresh user from DB
        $freshUser = $this->users->find((int)$user['id']);
        if ($freshUser === null || !$freshUser['is_active']) {
            $this->error('Account deactivated.', 401);
        }

        $result = $this->buildSession($freshUser);
        $this->success($result, 'Token refreshed');
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Build a new JWT + session row, return { token, user }.
     *
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    private function buildSession(array $user): array
    {
        // Super-admin email always forces super_admin role
        if (strtolower($user['email']) === strtolower(AuthConfig::SUPER_ADMIN_EMAIL)) {
            $user['role_name'] = 'super_admin';
        }

        $role        = $user['role_name'] ?? 'viewer';
        $permissions = $this->resolvePermissions($user);
        $now         = time();
        $ttl         = (int)AuthConfig::TOKEN_TTL_HOURS * 3600;
        $exp         = $now + $ttl;

        $payload = [
            'sub'         => (int)$user['id'],
            'email'       => $user['email'],
            'role'        => $role,
            'permissions' => $permissions,
            'iat'         => $now,
            'exp'         => $exp,
        ];

        $token     = JWT::encode($payload, AuthConfig::jwtSecret());
        $expiresAt = new \DateTimeImmutable("@{$exp}");

        $this->sessions->create(
            (int)$user['id'],
            $token,
            $expiresAt,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        );

        return [
            'token' => $token,
            'user'  => $this->formatUser($user, $role, $permissions),
        ];
    }

    /**
     * Resolve permissions array from the role's JSONB column.
     *
     * @param array<string, mixed> $user
     * @return string[]
     */
    private function resolvePermissions(array $user): array
    {
        $role = $user['role_name'] ?? '';

        // Super admin has wildcard access
        if ($role === 'super_admin') {
            return ['*'];
        }

        $raw = $user['role_permissions'] ?? '{}';
        if (is_string($raw)) {
            $decoded = json_decode($raw, true) ?? [];
        } else {
            $decoded = $raw;
        }

        return (array)($decoded['permissions'] ?? []);
    }

    /**
     * Format a user row for the API response.
     *
     * @param array<string, mixed> $user
     * @param string|null          $roleOverride
     * @param string[]|null        $permissionsOverride
     * @return array<string, mixed>
     */
    private function formatUser(array $user, ?string $roleOverride = null, ?array $permissionsOverride = null): array
    {
        $role        = $roleOverride ?? ($user['role_name'] ?? 'viewer');
        $permissions = $permissionsOverride ?? $this->resolvePermissions($user);

        return [
            'id'          => (int)$user['id'],
            'name'        => $user['name'],
            'email'       => $user['email'],
            'role'        => $role,
            'permissions' => $permissions,
            'avatar_url'  => $user['avatar_url'] ?? null,
            'is_active'   => (bool)$user['is_active'],
            'last_login_at' => $user['last_login_at'] ?? null,
        ];
    }
}
