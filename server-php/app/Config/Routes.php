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
                'method'     => 'PATCH',
                'pattern'    => '/api/auth/me',
                'handler'    => 'Auth\AuthController@updateMe',
                'middleware' => ['auth'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/auth/change-password',
                'handler'    => 'Auth\AuthController@changePassword',
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
            [
                'method'     => 'POST',
                'pattern'    => '/api/webhooks/razorpay',
                'handler'    => 'Webhooks\RazorpayWebhookController@handle',
                'middleware' => [],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/integrations/zoom/callback',
                'handler'    => 'Integrations\ZoomCallbackController@handle',
                'middleware' => [],
            ],

            // ── Admin — Users ─────────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/users',
                'handler'    => 'Admin\UserController@index',
                'middleware' => ['auth', 'permission_any:users.manage,users.delegate'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/users',
                'handler'    => 'Admin\UserController@store',
                'middleware' => ['auth', 'permission_any:users.manage,users.delegate'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/users/:id',
                'handler'    => 'Admin\UserController@show',
                'middleware' => ['auth', 'permission_any:users.manage,users.delegate'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/users/:id',
                'handler'    => 'Admin\UserController@update',
                'middleware' => ['auth', 'permission_any:users.manage,users.delegate'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/users/:id',
                'handler'    => 'Admin\UserController@destroy',
                'middleware' => ['auth', 'permission_any:users.manage,users.delegate'],
            ],

            // ── Admin — Roles ─────────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/roles',
                'handler'    => 'Admin\UserController@roles',
                'middleware' => ['auth', 'permission_any:users.manage,users.delegate'],
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
                'method'     => 'POST',
                'pattern'    => '/api/admin/organizations/:id/request-delete-otp',
                'handler'    => 'Admin\OrganizationController@requestDeleteOtp',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/organizations/:id',
                'handler'    => 'Admin\OrganizationController@destroy',
                'middleware' => ['auth', 'role:super_admin,admin'],
            ],

            // ── Admin — Data exception reports ─────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/reports/contact-exceptions',
                'handler'    => 'Admin\ExceptionReportController@contactExceptions',
                'middleware' => ['auth', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/reports/organization-exceptions',
                'handler'    => 'Admin\ExceptionReportController@organizationExceptions',
                'middleware' => ['auth', 'permission:clients.view'],
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
                'pattern'    => '/api/admin/services/billing-report',
                'handler'    => 'Admin\ServiceController@billingReport',
                'middleware' => ['auth', 'permission:invoices.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/:id/audit-log',
                'handler'    => 'Admin\ServiceController@auditLog',
                'middleware' => ['auth', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/:id',
                'handler'    => 'Admin\ServiceController@show',
                'middleware' => ['auth', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/:id/billing-invoices',
                'handler'    => 'Admin\ServiceController@billingInvoices',
                'middleware' => ['auth', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/request-client-facing-otp',
                'handler'    => 'Admin\ServiceController@requestClientFacingOtp',
                'middleware' => ['auth', 'permission:services.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/:id/time-entries',
                'handler'    => 'Admin\TimeEntryController@indexForService',
                'middleware' => ['auth', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/time-entries',
                'handler'    => 'Admin\TimeEntryController@storeForService',
                'middleware' => ['auth', 'permission:services.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/time-entries/report',
                'handler'    => 'Admin\TimeEntryController@report',
                'middleware' => ['auth', 'permission:services.view'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/services/:id/billing-closure',
                'handler'    => 'Admin\ServiceController@patchBillingClosure',
                'middleware' => ['auth', 'permission_any:services.edit,invoices.edit'],
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
                'middleware' => ['auth', 'permission:services.delete'],
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
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/appointments/:id/razorpay-order',
                'handler'    => 'Admin\AppointmentController@razorpayOrder',
                'middleware' => ['auth', 'permission:invoices.create'],
            ],

            // ── Admin — Appointment fee rules ───────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/appointment-fee-rules',
                'handler'    => 'Admin\AppointmentFeeRuleController@index',
                'middleware' => ['auth', 'permission:calendar.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/appointment-fee-rules',
                'handler'    => 'Admin\AppointmentFeeRuleController@store',
                'middleware' => ['auth', 'permission:calendar.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/appointment-fee-rules/:id',
                'handler'    => 'Admin\AppointmentFeeRuleController@show',
                'middleware' => ['auth', 'permission:calendar.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/appointment-fee-rules/:id',
                'handler'    => 'Admin\AppointmentFeeRuleController@update',
                'middleware' => ['auth', 'permission:calendar.create'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/appointment-fee-rules/:id',
                'handler'    => 'Admin\AppointmentFeeRuleController@destroy',
                'middleware' => ['auth', 'permission:calendar.create'],
            ],

            // ── Admin — Zoom integration ────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/integrations/zoom/authorize',
                'handler'    => 'Admin\ZoomIntegrationController@authorizeUrl',
                'middleware' => ['auth', 'permission:calendar.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/integrations/zoom/status',
                'handler'    => 'Admin\ZoomIntegrationController@status',
                'middleware' => ['auth', 'permission:calendar.view'],
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
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/leads/:id/quotations',
                'handler'    => 'Admin\LeadQuotationController@index',
                'middleware' => ['auth', 'permission:leads.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/leads/:id/quotations',
                'handler'    => 'Admin\LeadQuotationController@store',
                'middleware' => ['auth', 'permission:quotations.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/leads/:id/quotations/:id',
                'handler'    => 'Admin\LeadQuotationController@update',
                'middleware' => ['auth', 'permission:quotations.manage'],
            ],

            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/quotation-defaults/pending-summary',
                'handler'    => 'Admin\QuotationDefaultController@pendingSummary',
                'middleware' => ['auth', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/quotation-defaults/request-change-otp',
                'handler'    => 'Admin\QuotationDefaultController@requestChangeOtp',
                'middleware' => ['auth', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/quotation-defaults/by-engagement-type/:id',
                'handler'    => 'Admin\QuotationDefaultController@showByEngagementType',
                'middleware' => ['auth', 'permission:services.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/quotation-defaults/by-engagement-type/:id',
                'handler'    => 'Admin\QuotationDefaultController@updateByEngagementType',
                'middleware' => ['auth', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/quotation-defaults',
                'handler'    => 'Admin\QuotationDefaultController@index',
                'middleware' => ['auth', 'permission:services.view'],
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
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/:id/razorpay-order',
                'handler'    => 'Admin\TxnController@razorpayOrder',
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
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/:id/request-invoice-modify-otp',
                'handler'    => 'Admin\TxnController@requestInvoiceModifyOtp',
                'middleware' => ['auth', 'permission_any:invoices.edit,invoices.delete'],
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
                'middleware' => ['auth', 'permission_any:invoices.edit,invoices.delete'],
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

            // ── Admin — Affiliates & commissions ─────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/affiliates',
                'handler'    => 'Admin\AffiliateAdminController@index',
                'middleware' => ['auth', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/affiliates/:id/approve',
                'handler'    => 'Admin\AffiliateAdminController@approve',
                'middleware' => ['auth', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/affiliates/:id/suspend',
                'handler'    => 'Admin\AffiliateAdminController@suspend',
                'middleware' => ['auth', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/commission-defaults',
                'handler'    => 'Admin\AffiliateAdminController@commissionDefaults',
                'middleware' => ['auth', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/commission-defaults',
                'handler'    => 'Admin\AffiliateAdminController@updateCommissionDefaults',
                'middleware' => ['auth', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/affiliates/:id/rates',
                'handler'    => 'Admin\AffiliateAdminController@ratesIndex',
                'middleware' => ['auth', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/affiliates/:id/rates',
                'handler'    => 'Admin\AffiliateAdminController@ratesStore',
                'middleware' => ['auth', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/affiliate-rates/:id',
                'handler'    => 'Admin\AffiliateAdminController@ratesDestroy',
                'middleware' => ['auth', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/payout-requests',
                'handler'    => 'Admin\AffiliateAdminController@payoutIndex',
                'middleware' => ['auth', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/payout-requests/:id',
                'handler'    => 'Admin\AffiliateAdminController@payoutUpdate',
                'middleware' => ['auth', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/affiliate-bank/:id/verify',
                'handler'    => 'Admin\AffiliateAdminController@bankVerify',
                'middleware' => ['auth', 'permission:affiliates.manage'],
            ],

            // ── Affiliate portal ─────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/affiliate/dashboard',
                'handler'    => 'Affiliate\AffiliatePortalController@dashboard',
                'middleware' => ['auth', 'permission:affiliate.portal'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/affiliate/services',
                'handler'    => 'Affiliate\AffiliatePortalController@services',
                'middleware' => ['auth', 'permission:affiliate.portal'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/affiliate/commissions',
                'handler'    => 'Affiliate\AffiliatePortalController@commissions',
                'middleware' => ['auth', 'permission:affiliate.portal'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/affiliate/statement',
                'handler'    => 'Affiliate\AffiliatePortalController@statement',
                'middleware' => ['auth', 'permission:affiliate.portal'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/affiliate/bank',
                'handler'    => 'Affiliate\AffiliatePortalController@bankIndex',
                'middleware' => ['auth', 'permission:affiliate.bank.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/affiliate/bank',
                'handler'    => 'Affiliate\AffiliatePortalController@bankStore',
                'middleware' => ['auth', 'permission:affiliate.bank.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/affiliate/payout-requests',
                'handler'    => 'Affiliate\AffiliatePortalController@payoutIndex',
                'middleware' => ['auth', 'permission:affiliate.payouts.request'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/affiliate/payout-requests',
                'handler'    => 'Affiliate\AffiliatePortalController@payoutStore',
                'middleware' => ['auth', 'permission:affiliate.payouts.request'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/affiliate/sub-affiliates',
                'handler'    => 'Affiliate\AffiliatePortalController@subAffiliateStore',
                'middleware' => ['auth', 'permission:affiliate.sub_affiliates.create'],
            ],
            // ── Client portal ────────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/client/me',
                'handler'    => 'Client\ClientPortalController@me',
                'middleware' => ['auth', 'permission:client.portal'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/client/services',
                'handler'    => 'Client\ClientPortalController@services',
                'middleware' => ['auth', 'permission:client.services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/client/services/:id',
                'handler'    => 'Client\ClientPortalController@serviceShow',
                'middleware' => ['auth', 'permission:client.services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/client/ledger',
                'handler'    => 'Client\ClientPortalController@ledger',
                'middleware' => ['auth', 'permission:client.ledger.view'],
            ],
        ];
    }
}
