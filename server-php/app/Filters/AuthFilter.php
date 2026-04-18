<?php
declare(strict_types=1);

namespace App\Filters;

use App\Config\Auth as AuthConfig;
use App\Libraries\JWT;
use App\Models\UserModel;
use App\Models\SessionModel;
use App\Models\ClientSessionModel;
use App\Models\RoleModel;

use function App\Helpers\api_error;

/**
 * AuthFilter — validates the Bearer token on every protected route.
 *
 * On success, populates $GLOBALS['auth_user'] with the authenticated user array
 * so controllers can access it via $this->authUser().
 *
 * Returns HTTP 401 on missing/invalid/expired token.
 */
class AuthFilter
{
    /**
     * Run the filter.  Calls api_error() (which exits) on failure.
     */
    public function handle(): void
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

        if (!str_starts_with($header, 'Bearer ')) {
            api_error('Authorization token missing.', 401);
        }

        $token = substr($header, 7);

        // 1. Verify JWT signature + expiry
        try {
            $payload = JWT::decode($token, AuthConfig::jwtSecret());
        } catch (\Throwable $e) {
            api_error('Invalid or expired token: ' . $e->getMessage(), 401);
        }

        // 2. Verify the session exists in the DB (allows server-side revocation)
        $sessionModel = new SessionModel();
        $clientSessionModel = new ClientSessionModel();
        $isClientToken = (($payload['sub_type'] ?? '') === 'client');

        if ($isClientToken) {
            $clientSession = $clientSessionModel->findByToken($token);
            if ($clientSession === null) {
                api_error('Session not found or expired. Please log in again.', 401);
            }
            $role = (new RoleModel())->findByName('client');
            $rawPerms = $role['permissions'] ?? '{"permissions": []}';
            $decoded = is_string($rawPerms) ? (json_decode($rawPerms, true) ?? []) : $rawPerms;
            $permissions = (array)($decoded['permissions'] ?? []);

            $authUser = [
                'id' => (int)($payload['sub'] ?? 0),
                'name' => 'Client',
                'email' => null,
                'is_active' => true,
                'role_name' => 'client',
                'role_permissions' => json_encode(['permissions' => $permissions]),
                'role_permissions_array' => $permissions,
                'entity_type' => $clientSession['entity_type'] ?? ($payload['entity_type'] ?? 'contact'),
                'entity_id' => (int)($clientSession['entity_id'] ?? ($payload['sub'] ?? 0)),
                'contact_id' => isset($clientSession['context_contact_id']) && $clientSession['context_contact_id'] !== null
                    ? (int)$clientSession['context_contact_id']
                    : null,
                'organization_id' => isset($clientSession['context_org_id']) && $clientSession['context_org_id'] !== null
                    ? (int)$clientSession['context_org_id']
                    : null,
            ];

            $GLOBALS['auth_user']  = $authUser;
            $GLOBALS['auth_token'] = $token;
            return;
        }

        if ($sessionModel->findByToken($token) === null) {
            api_error('Session not found or expired. Please log in again.', 401);
        }

        // 3. Load the current user from DB
        $userModel = new UserModel();
        $user      = $userModel->find((int)($payload['sub'] ?? 0));
        if ($user === null || !$user['is_active']) {
            api_error('User account not found or deactivated.', 401);
        }

        // 4. Super-admin override
        if (strtolower($user['email']) === strtolower(AuthConfig::SUPER_ADMIN_EMAIL)) {
            $user['role_name'] = 'super_admin';
        }

        // 4b. Parse role permissions into a flat array for PermissionFilter
        $rawPerms = $user['role_permissions'] ?? '{}';
        $decoded  = is_string($rawPerms) ? (json_decode($rawPerms, true) ?? []) : $rawPerms;
        $user['role_permissions_array'] = (array)($decoded['permissions'] ?? $decoded ?? []);

        // 5. Inject into globals so controllers can read it
        $GLOBALS['auth_user']  = $user;
        $GLOBALS['auth_token'] = $token;
    }
}
