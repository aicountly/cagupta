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
            [
                'method'     => 'POST',
                'pattern'    => '/api/auth/request-otp',
                'handler'    => 'Auth\AuthController@requestOtp',
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
                'pattern'    => '/api/admin/contacts/search',
                'handler'    => 'Admin\ContactController@search',
                'middleware' => ['auth', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/contacts',
                'handler'    => 'Admin\ContactController@index',
                'middleware' => ['auth', 'permission:clients.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/contacts',
                'handler'    => 'Admin\ContactController@store',
                'middleware' => ['auth', 'permission:clients.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/contacts/:id',
                'handler'    => 'Admin\ContactController@show',
                'middleware' => ['auth', 'permission:clients.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/contacts/:id',
                'handler'    => 'Admin\ContactController@update',
                'middleware' => ['auth', 'permission:clients.edit'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/contacts/:id/status',
                'handler'    => 'Admin\ContactController@updateStatus',
                'middleware' => ['auth', 'permission:clients.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/contacts/:id',
                'handler'    => 'Admin\ContactController@destroy',
                'middleware' => ['auth', 'permission:clients.edit'],
            ],

            // ── Admin — Organizations ─────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/organizations/search',
                'handler'    => 'Admin\OrganizationController@search',
                'middleware' => ['auth', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/organizations',
                'handler'    => 'Admin\OrganizationController@index',
                'middleware' => ['auth', 'permission:clients.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/organizations',
                'handler'    => 'Admin\OrganizationController@store',
                'middleware' => ['auth', 'permission:clients.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/organizations/:id',
                'handler'    => 'Admin\OrganizationController@show',
                'middleware' => ['auth', 'permission:clients.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/organizations/:id',
                'handler'    => 'Admin\OrganizationController@update',
                'middleware' => ['auth', 'permission:clients.edit'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/organizations/:id/status',
                'handler'    => 'Admin\OrganizationController@updateStatus',
                'middleware' => ['auth', 'permission:clients.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/organizations/:id',
                'handler'    => 'Admin\OrganizationController@destroy',
                'middleware' => ['auth', 'permission:clients.edit'],
            ],

            // ── Admin — Services (Engagements) ────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services',
                'handler'    => 'Admin\ServiceController@index',
                'middleware' => ['auth', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services',
                'handler'    => 'Admin\ServiceController@store',
                'middleware' => ['auth', 'permission:services.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/:id',
                'handler'    => 'Admin\ServiceController@show',
                'middleware' => ['auth', 'permission:services.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/services/:id',
                'handler'    => 'Admin\ServiceController@update',
                'middleware' => ['auth', 'permission:services.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/services/:id',
                'handler'    => 'Admin\ServiceController@destroy',
                'middleware' => ['auth', 'permission:services.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/tasks',
                'handler'    => 'Admin\ServiceController@addTask',
                'middleware' => ['auth', 'permission:services.edit'],
            ],

            // ── Admin — Invoices ──────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/invoices',
                'handler'    => 'Admin\InvoiceController@index',
                'middleware' => ['auth', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/invoices',
                'handler'    => 'Admin\InvoiceController@store',
                'middleware' => ['auth', 'permission:invoices.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/invoices/:id',
                'handler'    => 'Admin\InvoiceController@show',
                'middleware' => ['auth', 'permission:invoices.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/invoices/:id',
                'handler'    => 'Admin\InvoiceController@update',
                'middleware' => ['auth', 'permission:invoices.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/invoices/:id',
                'handler'    => 'Admin\InvoiceController@destroy',
                'middleware' => ['auth', 'permission:invoices.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/invoices/ledger',
                'handler'    => 'Admin\InvoiceController@ledger',
                'middleware' => ['auth', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/invoices/:id/payment',
                'handler'    => 'Admin\InvoiceController@recordPayment',
                'middleware' => ['auth', 'permission:invoices.edit'],
            ],

            // ── Admin — Appointments (calendar events) ────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/appointments',
                'handler'    => 'Admin\AppointmentController@index',
                'middleware' => ['auth', 'permission:calendar.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/appointments',
                'handler'    => 'Admin\AppointmentController@store',
                'middleware' => ['auth', 'permission:calendar.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/appointments/:id',
                'handler'    => 'Admin\AppointmentController@show',
                'middleware' => ['auth', 'permission:calendar.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/appointments/:id',
                'handler'    => 'Admin\AppointmentController@update',
                'middleware' => ['auth', 'permission:calendar.create'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/appointments/:id',
                'handler'    => 'Admin\AppointmentController@destroy',
                'middleware' => ['auth', 'permission:calendar.create'],
            ],

            // ── Admin — Credentials Vault ─────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/credentials',
                'handler'    => 'Admin\CredentialController@index',
                'middleware' => ['auth', 'permission:credentials.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/credentials',
                'handler'    => 'Admin\CredentialController@store',
                'middleware' => ['auth', 'permission:credentials.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/credentials/:id',
                'handler'    => 'Admin\CredentialController@show',
                'middleware' => ['auth', 'permission:credentials.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/credentials/:id',
                'handler'    => 'Admin\CredentialController@update',
                'middleware' => ['auth', 'permission:credentials.view'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/credentials/:id',
                'handler'    => 'Admin\CredentialController@destroy',
                'middleware' => ['auth', 'permission:credentials.view'],
            ],

            // ── Admin — Portal Types ──────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/portal-types',
                'handler'    => 'Admin\PortalTypeController@index',
                'middleware' => ['auth', 'permission:credentials.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/portal-types',
                'handler'    => 'Admin\PortalTypeController@store',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/portal-types/:id',
                'handler'    => 'Admin\PortalTypeController@destroy',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],

            // ── Admin — Leads ─────────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/leads',
                'handler'    => 'Admin\LeadController@index',
                'middleware' => ['auth', 'permission:leads.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/leads',
                'handler'    => 'Admin\LeadController@store',
                'middleware' => ['auth', 'permission:leads.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/leads/:id',
                'handler'    => 'Admin\LeadController@show',
                'middleware' => ['auth', 'permission:leads.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/leads/:id',
                'handler'    => 'Admin\LeadController@update',
                'middleware' => ['auth', 'permission:leads.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/leads/:id',
                'handler'    => 'Admin\LeadController@destroy',
                'middleware' => ['auth', 'permission:leads.edit'],
            ],

            // ── Admin — Dashboard ─────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/dashboard/stats',
                'handler'    => 'Admin\DashboardController@stats',
                'middleware' => ['auth', 'permission:dashboard.view'],
            ],

            // ── Admin — Service Categories / Subcategories / Engagement Types ──
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/service-categories',
                'handler'    => 'Admin\ServiceCategoryController@index',
                'middleware' => ['auth', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/service-categories',
                'handler'    => 'Admin\ServiceCategoryController@store',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/service-categories/:id',
                'handler'    => 'Admin\ServiceCategoryController@destroy',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/service-categories/:id/subcategories',
                'handler'    => 'Admin\ServiceCategoryController@subcategoryIndex',
                'middleware' => ['auth', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/service-categories/:id/subcategories',
                'handler'    => 'Admin\ServiceCategoryController@subcategoryStore',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/service-subcategories/:id',
                'handler'    => 'Admin\ServiceCategoryController@subcategoryDestroy',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/service-categories/:id/engagement-types',
                'handler'    => 'Admin\ServiceCategoryController@engagementTypeIndex',
                'middleware' => ['auth', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/service-categories/:id/engagement-types',
                'handler'    => 'Admin\ServiceCategoryController@engagementTypeStore',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/engagement-types/:id',
                'handler'    => 'Admin\ServiceCategoryController@engagementTypeDestroy',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/service-subcategories/:id/engagement-types',
                'handler'    => 'Admin\ServiceCategoryController@engagementTypeStoreForSubcategory',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],

            // ── Admin — Opening Balances ──────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/opening-balances',
                'handler'    => 'Admin\OpeningBalanceController@index',
                'middleware' => ['auth', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/opening-balances',
                'handler'    => 'Admin\OpeningBalanceController@store',
                'middleware' => ['auth', 'permission:invoices.create'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/opening-balances',
                'handler'    => 'Admin\OpeningBalanceController@destroy',
                'middleware' => ['auth', 'permission:invoices.edit'],
            ],

            // ── Admin — Unified Transactions (TXN) ───────────────────────────
            // NOTE: Specific sub-routes must come BEFORE the generic :id routes
            // so the router matches them first.
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/ledger',
                'handler'    => 'Admin\TxnController@ledger',
                'middleware' => ['auth', 'permission:invoices.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/tds',
                'handler'    => 'Admin\TxnController@tdsIndex',
                'middleware' => ['auth', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/receipt',
                'handler'    => 'Admin\TxnController@storeReceipt',
                'middleware' => ['auth', 'permission:invoices.create'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/tds',
                'handler'    => 'Admin\TxnController@storeTds',
                'middleware' => ['auth', 'permission:invoices.create'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/txn/tds/:id/finalize',
                'handler'    => 'Admin\TxnController@finalizeTds',
                'middleware' => ['auth', 'permission:invoices.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/rebate',
                'handler'    => 'Admin\TxnController@storeRebate',
                'middleware' => ['auth', 'permission:invoices.create'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/credit-note',
                'handler'    => 'Admin\TxnController@storeCreditNote',
                'middleware' => ['auth', 'permission:invoices.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/opening-balance',
                'handler'    => 'Admin\TxnController@openingBalance',
                'middleware' => ['auth', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/opening-balance',
                'handler'    => 'Admin\TxnController@storeOpeningBalance',
                'middleware' => ['auth', 'permission:invoices.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn',
                'handler'    => 'Admin\TxnController@index',
                'middleware' => ['auth', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn',
                'handler'    => 'Admin\TxnController@store',
                'middleware' => ['auth', 'permission:invoices.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/:id',
                'handler'    => 'Admin\TxnController@show',
                'middleware' => ['auth', 'permission:invoices.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/txn/:id',
                'handler'    => 'Admin\TxnController@update',
                'middleware' => ['auth', 'permission:invoices.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/txn/:id',
                'handler'    => 'Admin\TxnController@destroy',
                'middleware' => ['auth', 'permission:invoices.edit'],
            ],

            // ── Admin — Client Groups ─────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/client-groups',
                'handler'    => 'Admin\ClientGroupController@index',
                'middleware' => ['auth', 'permission:clients.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/client-groups',
                'handler'    => 'Admin\ClientGroupController@store',
                'middleware' => ['auth', 'permission:clients.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/client-groups/:id',
                'handler'    => 'Admin\ClientGroupController@show',
                'middleware' => ['auth', 'permission:clients.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/client-groups/:id',
                'handler'    => 'Admin\ClientGroupController@update',
                'middleware' => ['auth', 'permission:clients.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/client-groups/:id',
                'handler'    => 'Admin\ClientGroupController@destroy',
                'middleware' => ['auth', 'permission:clients.edit'],
            ],
        ];
    }
}
