<?php
declare(strict_types=1);

namespace App\Filters;

use App\Config\Auth as AuthConfig;

use function App\Helpers\api_error;

/**
 * RoleFilter — asserts the authenticated user holds one of the required roles.
 *
 * Expects AuthFilter to have already populated $GLOBALS['auth_user'].
 * Returns HTTP 403 when the role requirement is not met.
 * Super-admin (`rahul@cagupta.in`) always passes regardless of role list.
 */
class RoleFilter
{
    /** @param string[] $allowedRoles */
    private array $allowedRoles;

    /** @param string[] $allowedRoles */
    public function __construct(array $allowedRoles)
    {
        $this->allowedRoles = $allowedRoles;
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

        $role = $user['role_name'] ?? '';
        if (!in_array($role, $this->allowedRoles, true)) {
            api_error(
                "Access denied. Required role: " . implode(' or ', $this->allowedRoles) . ".",
                403
            );
        }
    }
}
