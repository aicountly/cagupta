<?php
declare(strict_types=1);

namespace App\Controllers\Auth;

use App\Controllers\BaseController;
use App\Config\Auth as AuthConfig;
use App\Libraries\BrevoMailer;
use App\Libraries\JWT;
use App\Libraries\OtpService;
use App\Libraries\PasswordHasher;
use App\Models\UserModel;
use App\Models\SessionModel;
use App\Models\ClientLoginOtpModel;
use App\Models\ClientPortalIdentityModel;
use App\Models\ClientSessionModel;
use App\Models\RoleModel;

/**
 * AuthController — login, SSO, logout, me, refresh.
 */
class AuthController extends BaseController
{
    private UserModel    $users;
    private SessionModel $sessions;
    private ClientPortalIdentityModel $clientIdentity;
    private ClientLoginOtpModel $clientOtps;
    private ClientSessionModel $clientSessions;

    public function __construct()
    {
        // #region agent log
        $this->_dbgLog('H-C', '__construct', 'start', []);
        // #endregion
        $this->users    = new UserModel();
        // #region agent log
        $this->_dbgLog('H-C', '__construct', 'UserModel ok', []);
        // #endregion
        $this->sessions = new SessionModel();
        // #region agent log
        $this->_dbgLog('H-C', '__construct', 'SessionModel ok', []);
        // #endregion
        $this->clientIdentity = new ClientPortalIdentityModel();
        // #region agent log
        $this->_dbgLog('H-C', '__construct', 'ClientPortalIdentityModel ok', []);
        // #endregion
        $this->clientOtps = new ClientLoginOtpModel();
        // #region agent log
        $this->_dbgLog('H-C', '__construct', 'ClientLoginOtpModel ok', []);
        // #endregion
        $this->clientSessions = new ClientSessionModel();
        // #region agent log
        $this->_dbgLog('H-C', '__construct', 'ClientSessionModel ok', []);
        // #endregion
    }

    // ── POST /api/auth/login ─────────────────────────────────────────────────

    /**
     * Authenticate with email + password.
     *
     * Step 1 of the two-step login flow: validate credentials, then issue an
     * OTP to the user's registered email address.  The response will be:
     *   { otp_required: true, masked_email: "j***@example.com" }
     *
     * The caller must then POST to /api/auth/verify-otp with { email, otp }
     * to complete login and receive a JWT.
     */
    public function login(): never
    {
        $body  = $this->getJsonBody();
        $portal = strtolower(trim((string)($body['portal'] ?? '')));
        if ($portal === 'client') {
            $this->loginClient($body);
        }
        $email = trim((string)($body['email'] ?? ''));
        $pass  = (string)($body['password'] ?? '');

        if ($email === '' || $pass === '') {
            $this->error('Email and password are required.', 422);
        }

        // #region agent log
        try {
            $user = $this->users->findByEmail($email);
        } catch (\Throwable $dbEx) {
            $this->_dbgLog('H-D', 'login', 'findByEmail EXCEPTION', [
                'class' => $dbEx::class, 'msg' => $dbEx->getMessage(), 'code' => $dbEx->getCode(),
            ]);
            throw $dbEx;
        }
        // #endregion
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

        // Credentials are valid — generate and send OTP
        $userId      = (int)$user['id'];
        $otp         = OtpService::generate($userId);
        $maskedEmail = $this->maskEmail($email);

        // Send OTP email (best-effort — never fail the API call on mail error)
        try {
            $htmlBody = BrevoMailer::renderTemplate('login-otp', [
                'userName'      => $user['name'] ?? $email,
                'otpCode'       => $otp,
                'expiryMinutes' => OtpService::expiryMinutes(),
            ]);
            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $email,
                    $user['name'] ?? $email,
                    'Your Login OTP - CA Rahul Gupta',
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[AuthController] OTP email failed: ' . $e->getMessage());
        }

        $this->success(
            ['otp_required' => true, 'masked_email' => $maskedEmail],
            'OTP sent to your registered email address'
        );
    }

    // ── POST /api/auth/verify-otp ────────────────────────────────────────────

    /**
     * Step 2 of the two-step login flow: verify OTP and issue a JWT.
     *
     * Body: { email, otp }
     */
    public function verifyOtp(): never
    {
        $body  = $this->getJsonBody();
        $portal = strtolower(trim((string)($body['portal'] ?? '')));
        if ($portal === 'client') {
            $this->verifyClientOtp($body);
        }
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $otp   = trim((string)($body['otp'] ?? ''));

        if ($email === '' || $otp === '') {
            $this->error('Email and OTP are required.', 422);
        }

        $user = $this->users->findByEmail($email);
        if ($user === null || !$user['is_active']) {
            $this->error('Invalid request.', 401);
        }

        if (!OtpService::verify((int)$user['id'], $otp)) {
            $this->error('Invalid or expired OTP. Please try again.', 401);
        }

        $this->users->touchLastLogin((int)$user['id']);
        $result = $this->buildSession($user);
        $this->success($result, 'Login successful');
    }

    // ── POST /api/auth/request-otp ───────────────────────────────────────────

    /**
     * Re-send an OTP to the given email (used by the "Resend OTP" button).
     *
     * Body: { email }
     */
    public function requestOtp(): never
    {
        $body  = $this->getJsonBody();
        $portal = strtolower(trim((string)($body['portal'] ?? '')));
        if ($portal === 'client') {
            $this->requestClientOtp($body);
        }
        $email = strtolower(trim((string)($body['email'] ?? '')));

        if ($email === '') {
            $this->error('Email is required.', 422);
        }

        $user = $this->users->findByEmail($email);
        if ($user === null || !$user['is_active']) {
            // Return success anyway to avoid user enumeration
            $this->success(null, 'If that email exists, a new OTP has been sent.');
        }

        if ($user['password_hash'] === null || $user['password_hash'] === '') {
            $this->success(null, 'If that email exists, a new OTP has been sent.');
        }

        $otp = OtpService::generate((int)$user['id']);

        try {
            $htmlBody = BrevoMailer::renderTemplate('login-otp', [
                'userName'      => $user['name'] ?? $email,
                'otpCode'       => $otp,
                'expiryMinutes' => OtpService::expiryMinutes(),
            ]);
            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $email,
                    $user['name'] ?? $email,
                    'Your Login OTP - CA Rahul Gupta',
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[AuthController] Resend OTP email failed: ' . $e->getMessage());
        }

        $this->success(null, 'If that email exists, a new OTP has been sent.');
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

        // Extract provider user ID from JWT payload (sub claim).
        // Storing only the short sub (~21 chars) instead of the full token
        // prevents column overflow on VARCHAR/TEXT length limits.
        $providerUserId = $ssoToken; // fallback
        try {
            $parts = explode('.', $ssoToken);
            if (count($parts) === 3) {
                $padded  = str_pad(strtr($parts[1], '-_', '+/'), (int)ceil(strlen($parts[1]) / 4) * 4, '=', STR_PAD_RIGHT);
                $payload = json_decode(base64_decode($padded), true);
                if (!empty($payload['sub'])) {
                    $providerUserId = (string)$payload['sub'];
                }
            }
        } catch (\Throwable $e) {
            // keep fallback
        }

        // Look up existing user — access is invite-only, no auto-registration
        // #region agent log
        $this->_dbgLog('H-D', 'sso', 'findByEmail start', ['email' => $email]);
        // #endregion
        try {
            $user = $this->users->findByEmail($email);
        } catch (\Throwable $dbEx) {
            // #region agent log
            $this->_dbgLog('H-D', 'sso', 'findByEmail EXCEPTION', [
                'class' => $dbEx::class, 'msg' => $dbEx->getMessage(), 'code' => $dbEx->getCode(),
            ]);
            // #endregion
            throw $dbEx;
        }
        // #region agent log
        $this->_dbgLog('H-D', 'sso', 'findByEmail done', ['found' => ($user !== null), 'id' => $user['id'] ?? null]);
        // #endregion

        if ($user === null) {
            $this->error('Your account is not registered. Please contact the administrator to request access.', 403);
        }

        if (!$user['is_active']) {
            $this->error('Your account has been deactivated. Please contact the administrator.', 403);
        }

        // Update SSO fields if changed
        // #region agent log
        $this->_dbgLog('H-A', 'sso', 'update start', ['id' => (int)$user['id']]);
        // #endregion
        try { $this->users->update((int)$user['id'], [
            'sso_provider_id' => $providerUserId,
            'avatar_url'      => $avatar ?: ($user['avatar_url'] ?? null),
            'last_login_at'   => date('Y-m-d H:i:sO'),
        ]); } catch (\Throwable $dbEx) {
            // #region agent log
            $this->_dbgLog('H-A', 'sso', 'update EXCEPTION', ['class' => $dbEx::class, 'msg' => $dbEx->getMessage()]);
            // #endregion
            throw $dbEx;
        }
        // #region agent log
        $this->_dbgLog('H-A', 'sso', 'update done', []);
        // #endregion
        $user = $this->users->find((int)$user['id']);
        // #region agent log
        $this->_dbgLog('H-A', 'sso', 'find after update done', ['found' => ($user !== null)]);
        // #endregion

        if ($user === null) {
            $this->error('Account could not be loaded. Please contact the administrator.', 500);
        }

        // #region agent log
        $this->_dbgLog('H-E', 'sso', 'buildSession start', []);
        // #endregion
        $result = $this->buildSession($user);
        // #region agent log
        $this->_dbgLog('H-B', 'sso', 'buildSession done', []);
        // #endregion
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
        $user = $this->authUser();
        if (($user['role_name'] ?? '') === 'client') {
            $this->clientSessions->deleteByToken($this->authToken());
        } else {
            $this->sessions->deleteByToken($this->authToken());
        }
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

    // ── PATCH /api/auth/me ─────────────────────────────────────────────────

    /**
     * Update the authenticated user's own profile (name, avatar URL).
     *
     * Body: { name?, avatar_url? } — at least one field required.
     * Requires: Bearer token (enforced by AuthFilter).
     */
    public function updateMe(): never
    {
        $user = $this->authUser();
        $body = $this->getJsonBody();
        $updates = [];

        if (array_key_exists('name', $body)) {
            $name = trim((string)$body['name']);
            if ($name === '') {
                $this->error('Name cannot be empty.', 422);
            }
            if (strlen($name) > 120) {
                $this->error('Name is too long (max 120 characters).', 422);
            }
            $updates['name'] = $name;
        }

        if (array_key_exists('avatar_url', $body)) {
            $url = trim((string)$body['avatar_url']);
            if ($url === '') {
                $updates['avatar_url'] = null;
            } else {
                if (strlen($url) > 2048) {
                    $this->error('Avatar URL is too long.', 422);
                }
                if (!preg_match('#^https?://#i', $url)) {
                    $this->error('Avatar URL must start with http:// or https://', 422);
                }
                $updates['avatar_url'] = $url;
            }
        }

        if ($updates === []) {
            $this->error('No valid fields to update. Send name and/or avatar_url.', 422);
        }

        $this->users->update((int)$user['id'], $updates);
        $fresh = $this->users->find((int)$user['id']);
        if ($fresh === null) {
            $this->error('Could not reload profile.', 500);
        }

        $this->success($this->formatUser($fresh), 'Profile updated');
    }

    // ── POST /api/auth/change-password ─────────────────────────────────────

    /**
     * Change password for accounts that use local (email + password) login.
     *
     * Body: { current_password, new_password }
     * Requires: Bearer token (enforced by AuthFilter).
     */
    public function changePassword(): never
    {
        $user    = $this->authUser();
        $body    = $this->getJsonBody();
        $current = (string)($body['current_password'] ?? '');
        $new     = (string)($body['new_password'] ?? '');

        if ($current === '' || $new === '') {
            $this->error('Current password and new password are required.', 422);
        }

        $full = $this->users->find((int)$user['id']);
        if ($full === null) {
            $this->error('User not found.', 404);
        }

        $hash = $full['password_hash'] ?? null;
        if ($hash === null || $hash === '') {
            $this->error(
                'Password change is not available for this account. Sign in with your SSO provider to manage security.',
                403
            );
        }

        if (!PasswordHasher::verify($current, $hash)) {
            $this->error('Current password is incorrect.', 401);
        }

        if (strlen($new) < 8) {
            $this->error('New password must be at least 8 characters.', 422);
        }

        if (PasswordHasher::verify($new, $hash)) {
            $this->error('New password must be different from your current password.', 422);
        }

        $this->users->update((int)$user['id'], ['password' => $new]);
        $this->success(null, 'Password updated successfully');
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

    // ── Debug helper (session 3bbd0c) — remove after fix ────────────────────
    private function _dbgLog(string $hyp, string $loc, string $msg, array $data): void
    {
        $entry = json_encode([
            'sessionId'    => '3bbd0c',
            'runId'        => 'run1',
            'hypothesisId' => $hyp,
            'timestamp'    => (int) round(microtime(true) * 1000),
            'location'     => "AuthController.php:{$loc}",
            'message'      => $msg,
            'data'         => $data,
        ]) . "\n";
        error_log('[SSO-DBG 3bbd0c] ' . $hyp . ' | ' . $loc . ' | ' . $msg . ' | ' . json_encode($data));
        @file_put_contents(dirname(__DIR__, 4) . '/debug-3bbd0c.log', $entry, FILE_APPEND | LOCK_EX);
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

        // #region agent log
        $this->_dbgLog('H-B', 'buildSession', 'sessions->create start', ['user_id' => (int)$user['id']]);
        // #endregion
        $this->sessions->create(
            (int)$user['id'],
            $token,
            $expiresAt,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        );
        // #region agent log
        $this->_dbgLog('H-B', 'buildSession', 'sessions->create done', []);
        // #endregion

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

        $pwd = $user['password_hash'] ?? null;

        return [
            'id'                   => (int)$user['id'],
            'name'                 => $user['name'],
            'email'                => $user['email'],
            'role'                 => $role,
            'permissions'          => $permissions,
            'avatar_url'           => $user['avatar_url'] ?? null,
            'is_active'            => (bool)$user['is_active'],
            'last_login_at'        => $user['last_login_at'] ?? null,
            'can_change_password'  => ($pwd !== null && $pwd !== ''),
            'entity_type'          => $user['entity_type'] ?? null,
            'entity_id'            => $user['entity_id'] ?? null,
            'contact_id'           => $user['contact_id'] ?? null,
            'organization_id'      => $user['organization_id'] ?? null,
        ];
    }

    /**
     * Mask an email address for display (e.g. "john@example.com" → "j**n@example.com").
     */
    private function maskEmail(string $email): string
    {
        $parts = explode('@', $email, 2);
        if (count($parts) !== 2) {
            return '***@***.***';
        }
        $local  = $parts[0];
        $domain = $parts[1];
        $len    = strlen($local);
        if ($len <= 2) {
            $masked = $local[0] . str_repeat('*', max(1, $len - 1));
        } else {
            $masked = $local[0] . str_repeat('*', $len - 2) . $local[$len - 1];
        }
        return $masked . '@' . $domain;
    }

    /**
     * @param array<string, mixed> $body
     */
    private function loginClient(array $body): never
    {
        $identifier = (string)($body['identifier'] ?? $body['email'] ?? $body['mobile'] ?? '');
        $normalized = $this->clientIdentity->normalizeIdentifier($identifier);
        if ($normalized === '') {
            $this->error('Client identifier is required.', 422);
        }

        $identity = $this->clientIdentity->resolveByIdentifier($normalized);
        if ($identity === null) {
            $this->error('Invalid credentials.', 401);
        }

        $otp = $this->clientOtps->generate($normalized);
        if (str_contains($normalized, '@')) {
            try {
                $htmlBody = BrevoMailer::renderTemplate('login-otp', [
                    'userName'      => $identity['display_name'] ?? 'Client',
                    'otpCode'       => $otp,
                    'expiryMinutes' => OtpService::expiryMinutes(),
                ]);
                if ($htmlBody !== '') {
                    BrevoMailer::send(
                        $normalized,
                        (string)($identity['display_name'] ?? 'Client'),
                        'Your Client Portal OTP - CA Rahul Gupta',
                        $htmlBody
                    );
                }
            } catch (\Throwable $e) {
                error_log('[AuthController] Client OTP email failed: ' . $e->getMessage());
            }
        }

        $masked = str_contains($normalized, '@') ? $this->maskEmail($normalized) : $this->maskPhone($normalized);
        $this->success(['otp_required' => true, 'masked_email' => $masked], 'OTP sent to your registered contact point');
    }

    /**
     * @param array<string, mixed> $body
     */
    private function verifyClientOtp(array $body): never
    {
        $identifier = (string)($body['identifier'] ?? $body['email'] ?? $body['mobile'] ?? '');
        $normalized = $this->clientIdentity->normalizeIdentifier($identifier);
        $otp = trim((string)($body['otp'] ?? ''));
        if ($normalized === '' || $otp === '') {
            $this->error('Identifier and OTP are required.', 422);
        }
        if (!$this->clientOtps->verify($normalized, $otp)) {
            $this->error('Invalid or expired OTP. Please try again.', 401);
        }
        $identity = $this->clientIdentity->resolveByIdentifier($normalized);
        if ($identity === null) {
            $this->error('Invalid request.', 401);
        }

        $result = $this->buildClientSession($identity, $normalized);
        $this->success($result, 'Login successful');
    }

    /**
     * @param array<string, mixed> $body
     */
    private function requestClientOtp(array $body): never
    {
        $identifier = (string)($body['identifier'] ?? $body['email'] ?? $body['mobile'] ?? '');
        $normalized = $this->clientIdentity->normalizeIdentifier($identifier);
        if ($normalized === '') {
            $this->error('Identifier is required.', 422);
        }
        $identity = $this->clientIdentity->resolveByIdentifier($normalized);
        if ($identity !== null) {
            $otp = $this->clientOtps->generate($normalized);
            if (str_contains($normalized, '@')) {
                try {
                    $htmlBody = BrevoMailer::renderTemplate('login-otp', [
                        'userName'      => $identity['display_name'] ?? 'Client',
                        'otpCode'       => $otp,
                        'expiryMinutes' => OtpService::expiryMinutes(),
                    ]);
                    if ($htmlBody !== '') {
                        BrevoMailer::send(
                            $normalized,
                            (string)($identity['display_name'] ?? 'Client'),
                            'Your Client Portal OTP - CA Rahul Gupta',
                            $htmlBody
                        );
                    }
                } catch (\Throwable $e) {
                    error_log('[AuthController] Client OTP resend failed: ' . $e->getMessage());
                }
            }
        }
        $this->success(null, 'If that identifier exists, a new OTP has been sent.');
    }

    /**
     * @param array<string, mixed> $identity
     * @return array<string, mixed>
     */
    private function buildClientSession(array $identity, string $identifier): array
    {
        $role = 'client';
        $permissions = ['client.portal', 'client.services.view', 'client.ledger.view', 'client.profile.view'];
        $roleRow = (new RoleModel())->findByName('client');
        if ($roleRow !== null) {
            $raw = $roleRow['permissions'] ?? '{}';
            $decoded = is_string($raw) ? (json_decode($raw, true) ?? []) : $raw;
            $permissions = (array)($decoded['permissions'] ?? $permissions);
        }

        $now = time();
        $ttl = (int)AuthConfig::TOKEN_TTL_HOURS * 3600;
        $exp = $now + $ttl;
        $payload = [
            'sub'             => (int)$identity['entity_id'],
            'sub_type'        => 'client',
            'entity_type'     => (string)$identity['entity_type'],
            'contact_id'      => $identity['contact_id'],
            'organization_id' => $identity['organization_id'],
            'role'            => $role,
            'permissions'     => $permissions,
            'iat'             => $now,
            'exp'             => $exp,
        ];
        $token = JWT::encode($payload, AuthConfig::jwtSecret());
        $expiresAt = new \DateTimeImmutable("@{$exp}");
        $this->clientSessions->create(
            $token,
            $identifier,
            (string)$identity['entity_type'],
            (int)$identity['entity_id'],
            $identity['contact_id'] !== null ? (int)$identity['contact_id'] : null,
            $identity['organization_id'] !== null ? (int)$identity['organization_id'] : null,
            $expiresAt,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        );

        return [
            'token' => $token,
            'user'  => [
                'id' => (int)$identity['entity_id'],
                'name' => (string)($identity['display_name'] ?? 'Client'),
                'email' => str_contains($identifier, '@') ? $identifier : null,
                'role' => 'client',
                'permissions' => $permissions,
                'is_active' => true,
                'can_change_password' => false,
                'entity_type' => (string)$identity['entity_type'],
                'contact_id' => $identity['contact_id'],
                'organization_id' => $identity['organization_id'],
                'available_organizations' => $identity['available_orgs'] ?? [],
            ],
        ];
    }

    private function maskPhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if ($digits === '') {
            return '***';
        }
        if (strlen($digits) <= 4) {
            return str_repeat('*', max(0, strlen($digits) - 2)) . substr($digits, -2);
        }
        return str_repeat('*', strlen($digits) - 4) . substr($digits, -4);
    }
}
