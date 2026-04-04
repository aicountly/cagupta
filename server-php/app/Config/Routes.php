<?php
declare(strict_types=1);

namespace App\Config;

/**
 * Route definitions.
 *
 * Maps HTTP METHOD + path patterns to Controller@method pairs.
 * Patterns support :id (numeric) and :slug (alphanumeric + dash) placeholders.
 *
 * Used by public/index.php to dispatch incoming requests.
 */
class Routes
{
    /**
     * Returns the complete route map.
     *
     * @return array<int, array{method: string, pattern: string, handler: string, middleware: string[]}>
     */
    public static function getRoutes(): array
    {
        return [
            // ── Auth ──────────────────────────────────────────────────────────
            [
                'method'     => 'POST',
                'pattern'    => '/api/auth/login',
                'handler'    => 'Auth\AuthController@login',
                'middleware' => [],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/auth/sso',
                'handler'    => 'Auth\AuthController@sso',
                'middleware' => [],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/auth/logout',
                'handler'    => 'Auth\AuthController@logout',
                'middleware' => ['auth'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/auth/me',
                'handler'    => 'Auth\AuthController@me',
                'middleware' => ['auth'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/auth/refresh',
                'handler'    => 'Auth\AuthController@refresh',
                'middleware' => ['auth'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/auth/verify-otp',
                'handler'    => 'Auth\AuthController@verifyOtp',
                'middleware' => [],
            ],

            // ── Admin — Users ─────────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/users',
                'handler'    => 'Admin\UserController@index',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/users',
                'handler'    => 'Admin\UserController@store',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/users/:id',
                'handler'    => 'Admin\UserController@show',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/users/:id',
                'handler'    => 'Admin\UserController@update',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/users/:id',
                'handler'    => 'Admin\UserController@destroy',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],

            // ── Admin — Roles ─────────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/roles',
                'handler'    => 'Admin\UserController@roles',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/roles/:id',
                'handler'    => 'Admin\UserController@updateRole',
                'middleware' => ['auth', 'role:super_admin'],
            ],

            // ── Admin — Contacts (clients) ────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/contacts',
                'handler'    => 'Admin\ContactController@index',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/contacts',
                'handler'    => 'Admin\ContactController@store',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/contacts/:id',
                'handler'    => 'Admin\ContactController@show',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/contacts/:id',
                'handler'    => 'Admin\ContactController@update',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/contacts/:id/status',
                'handler'    => 'Admin\ContactController@updateStatus',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/contacts/:id',
                'handler'    => 'Admin\ContactController@destroy',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],

            // ── Admin — Organizations ─────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/organizations',
                'handler'    => 'Admin\OrganizationController@index',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/organizations',
                'handler'    => 'Admin\OrganizationController@store',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/organizations/:id',
                'handler'    => 'Admin\OrganizationController@show',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/organizations/:id',
                'handler'    => 'Admin\OrganizationController@update',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/organizations/:id/status',
                'handler'    => 'Admin\OrganizationController@updateStatus',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/organizations/:id',
                'handler'    => 'Admin\OrganizationController@destroy',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
        ];
    }
}
