<?php
declare(strict_types=1);

namespace App\Filters;

use App\Config\Auth as AuthConfig;

use function App\Helpers\api_error;

/**
 * Passes if the user has any one of the listed permissions (or wildcard *).
 * Super-admin email always passes. Does not grant access by role name alone.
 */
class PermissionAnyFilter
{
    /** @param string[] $anyOf */
    public function __construct(private array $anyOf)
    {
    }

    public function handle(): void
    {
        $user = $GLOBALS['auth_user'] ?? null;
        if ($user === null) {
            api_error('Not authenticated.', 401);
        }

        if (strtolower($user['email']) === strtolower(AuthConfig::SUPER_ADMIN_EMAIL)) {
            return;
        }

        $permissions = $user['role_permissions_array'] ?? [];
        if (in_array('*', $permissions, true)) {
            return;
        }

        foreach ($this->anyOf as $perm) {
            if (in_array($perm, $permissions, true)) {
                return;
            }
        }

        api_error('Access denied. Required one of: ' . implode(', ', $this->anyOf) . '.', 403);
    }
}
