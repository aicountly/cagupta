<?php
declare(strict_types=1);

namespace App\Filters;

use App\Config\Auth as AuthConfig;

use function App\Helpers\api_error;

/**
 * PermissionFilter — checks that the authenticated user holds a specific permission.
 *
 * Reads `role_permissions_array` from $GLOBALS['auth_user'] (populated by AuthFilter).
 * Super-admin and admin roles always pass for backwards compatibility.
 * Returns HTTP 403 when the required permission is not found.
 */
class PermissionFilter
{
    private string $requiredPermission;

    public function __construct(string $requiredPermission)
    {
        $this->requiredPermission = $requiredPermission;
    }

    /**
     * Run the filter.  Calls api_error() (which exits) on failure.
     */
    public function handle(): void
    {
        $user = $GLOBALS['auth_user'] ?? null;
        if ($user === null) {
            api_error('Not authenticated.', 401);
        }

        // Super admin always passes
        if (strtolower($user['email']) === strtolower(AuthConfig::SUPER_ADMIN_EMAIL)) {
            return;
        }

        // role:super_admin and role:admin always pass (backwards compat)
        $role = $user['role_name'] ?? '';
        if (in_array($role, ['super_admin', 'admin'], true)) {
            return;
        }

        // Check permission from the role's permissions array
        $permissions = $user['role_permissions_array'] ?? [];
        if (in_array('*', $permissions, true)) {
            return;
        }

        if (!in_array($this->requiredPermission, $permissions, true)) {
            api_error("Access denied. Required permission: {$this->requiredPermission}.", 403);
        }
    }
}
