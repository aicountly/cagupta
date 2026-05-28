<?php
declare(strict_types=1);

namespace App\Filters;

use App\Config\Auth as AuthConfig;

use function App\Helpers\api_error;

/**
 * StaffOnlyFilter — blocks portal roles (associate, partner, client) from staff APIs.
 *
 * Expects AuthFilter to have already populated $GLOBALS['auth_user'].
 * Super-admin always passes.
 */
class StaffOnlyFilter
{
    private const PORTAL_ROLES = ['associate', 'partner', 'client'];

    public function handle(): void
    {
        $user = $GLOBALS['auth_user'] ?? null;
        if ($user === null) {
            api_error('Not authenticated.', 401);
        }

        if (AuthConfig::isSuperAdminEmail((string)($user['email'] ?? ''))) {
            return;
        }

        $role = $user['role_name'] ?? '';
        if (in_array($role, self::PORTAL_ROLES, true)) {
            api_error('Access denied. Staff portal required.', 403);
        }
    }
}
