<?php
declare(strict_types=1);

namespace App\Config;

/**
 * Route definitions.
 *
 * Maps HTTP METHOD + path patterns to Controller@method pairs.
 * Patterns support :id (numeric) and :slug (single path segment; no slash) placeholders.
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

            // ── Calendar OAuth callbacks (no auth — validated via signed state) ──
            [
                'method'     => 'GET',
                'pattern'    => '/api/integrations/calendar/google/callback',
                'handler'    => 'Integrations\GoogleCalendarCallbackController@handle',
                'middleware' => [],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/integrations/calendar/outlook/callback',
                'handler'    => 'Integrations\OutlookCalendarCallbackController@handle',
                'middleware' => [],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/integrations/brevo/inbound',
                'handler'    => 'Integrations\BrevoInboundController@handle',
                'middleware' => [],
            ],
            // Apple CalDAV connect (requires auth — user submits credentials via the UI)
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/integrations/calendar/apple/connect',
                'handler'    => 'Integrations\AppleCalendarConnectController@handle',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],

            // ── Admin — Users ─────────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/users',
                'handler'    => 'Admin\UserController@index',
                'middleware' => ['auth', 'staff', 'permission_any:users.manage,users.delegate'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/users',
                'handler'    => 'Admin\UserController@store',
                'middleware' => ['auth', 'staff', 'permission_any:users.manage,users.delegate'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/users/:id',
                'handler'    => 'Admin\UserController@show',
                'middleware' => ['auth', 'staff', 'permission_any:users.manage,users.delegate'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/users/:id',
                'handler'    => 'Admin\UserController@update',
                'middleware' => ['auth', 'staff', 'permission_any:users.manage,users.delegate'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/users/:id',
                'handler'    => 'Admin\UserController@destroy',
                'middleware' => ['auth', 'staff', 'permission_any:users.manage,users.delegate'],
            ],

            // ── Admin — Roles ─────────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/roles',
                'handler'    => 'Admin\UserController@roles',
                'middleware' => ['auth', 'staff', 'permission_any:users.manage,users.delegate'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/roles/:id',
                'handler'    => 'Admin\UserController@updateRole',
                'middleware' => ['auth', 'staff', 'permission:users.manage'],
            ],

            // ── Admin — Contacts (clients) ────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/contacts/search',
                'handler'    => 'Admin\ContactController@search',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/contacts/check-pan',
                'handler'    => 'Admin\ContactController@checkPan',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/contacts',
                'handler'    => 'Admin\ContactController@index',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/contacts',
                'handler'    => 'Admin\ContactController@store',
                'middleware' => ['auth', 'staff', 'permission:clients.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/contacts/:id',
                'handler'    => 'Admin\ContactController@show',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/contacts/:id/audit-log',
                'handler'    => 'Admin\ContactController@auditLog',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/contacts/:id',
                'handler'    => 'Admin\ContactController@update',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/contacts/:id/status',
                'handler'    => 'Admin\ContactController@updateStatus',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/contacts/:id/request-delete-otp',
                'handler'    => 'Admin\ContactController@requestDeleteOtp',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/contacts/:id',
                'handler'    => 'Admin\ContactController@destroy',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/contacts/:id/work-hold',
                'handler'    => 'Admin\WorkHoldController@showForContact',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/contacts/:id/work-hold',
                'handler'    => 'Admin\WorkHoldController@updateForContact',
                'middleware' => ['auth', 'staff', 'role:super_admin,accounts'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/contacts/:id/work-hold/exceptions',
                'handler'    => 'Admin\WorkHoldController@storeExceptionForContact',
                'middleware' => ['auth', 'staff', 'role:super_admin,accounts'],
            ],

            // ── Admin — Organizations ─────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/organizations/search',
                'handler'    => 'Admin\OrganizationController@search',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/organizations',
                'handler'    => 'Admin\OrganizationController@index',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/organizations',
                'handler'    => 'Admin\OrganizationController@store',
                'middleware' => ['auth', 'staff', 'permission:clients.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/organizations/:id',
                'handler'    => 'Admin\OrganizationController@show',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/organizations/:id/audit-log',
                'handler'    => 'Admin\OrganizationController@auditLog',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/organizations/:id',
                'handler'    => 'Admin\OrganizationController@update',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/organizations/:id/status',
                'handler'    => 'Admin\OrganizationController@updateStatus',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/organizations/:id/request-delete-otp',
                'handler'    => 'Admin\OrganizationController@requestDeleteOtp',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/organizations/:id/delete-eligibility',
                'handler'    => 'Admin\OrganizationController@deleteEligibility',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/organizations/:id',
                'handler'    => 'Admin\OrganizationController@destroy',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/organizations/:id/work-hold',
                'handler'    => 'Admin\WorkHoldController@showForOrganization',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/organizations/:id/work-hold',
                'handler'    => 'Admin\WorkHoldController@updateForOrganization',
                'middleware' => ['auth', 'staff', 'role:super_admin,accounts'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/organizations/:id/work-hold/exceptions',
                'handler'    => 'Admin\WorkHoldController@storeExceptionForOrganization',
                'middleware' => ['auth', 'staff', 'role:super_admin,accounts'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/work-hold/exceptions/:id',
                'handler'    => 'Admin\WorkHoldController@destroyException',
                'middleware' => ['auth', 'staff', 'role:super_admin,accounts'],
            ],

            // ── Admin — Data exception reports ─────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/reports/contact-exceptions',
                'handler'    => 'Admin\ExceptionReportController@contactExceptions',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/reports/organization-exceptions',
                'handler'    => 'Admin\ExceptionReportController@organizationExceptions',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/reports/contact-kyc-exceptions',
                'handler'    => 'Admin\ExceptionReportController@contactKycExceptions',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/reports/organization-kyc-exceptions',
                'handler'    => 'Admin\ExceptionReportController@organizationKycExceptions',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],

            // ── Admin — Service Logs (activity log per engagement) ────────────
            // NOTE: static sub-paths (pending-followups, overdue-count) must be
            // registered BEFORE :id patterns to avoid being captured as an :id.
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/pending-followups',
                'handler'    => 'Admin\ServiceLogController@pendingFollowUps',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/logs/overdue-count',
                'handler'    => 'Admin\ServiceLogController@overdueCount',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/:id/logs',
                'handler'    => 'Admin\ServiceLogController@index',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/logs',
                'handler'    => 'Admin\ServiceLogController@store',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/services/:id/logs/:id',
                'handler'    => 'Admin\ServiceLogController@update',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/services/:id/logs/:id',
                'handler'    => 'Admin\ServiceLogController@destroy',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/logs/:id/remind',
                'handler'    => 'Admin\ServiceLogController@sendReminder',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],

            // ── Admin — Services (Engagements) ────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services',
                'handler'    => 'Admin\ServiceController@index',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services',
                'handler'    => 'Admin\ServiceController@store',
                'middleware' => ['auth', 'staff', 'permission:services.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/billing-report',
                'handler'    => 'Admin\ServiceController@billingReport',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/kpi-snapshot',
                'handler'    => 'Admin\ServiceController@kpiSnapshot',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            // static sub-path: must be before /:id catch-all
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/linkable',
                'handler'    => 'Admin\ServiceController@linkableServices',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/:id/audit-log',
                'handler'    => 'Admin\ServiceController@auditLog',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/:id',
                'handler'    => 'Admin\ServiceController@show',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/:id/billing-invoices',
                'handler'    => 'Admin\ServiceController@billingInvoices',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/request-client-facing-otp',
                'handler'    => 'Admin\ServiceController@requestClientFacingOtp',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/request-delete-otp',
                'handler'    => 'Admin\ServiceController@requestDeleteOtp',
                'middleware' => ['auth', 'staff', 'permission:services.delete'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/:id/time-entries',
                'handler'    => 'Admin\TimeEntryController@indexForService',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/time-entries',
                'handler'    => 'Admin\TimeEntryController@storeForService',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/time-entries/report',
                'handler'    => 'Admin\TimeEntryController@report',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/reports/timesheets/insights',
                'handler'    => 'Admin\TimeEntryController@reportInsights',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/reports/timesheets/shift-target',
                'handler'    => 'Admin\TimeEntryController@shiftTargetReport',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/time-entries/active',
                'handler'    => 'Admin\TimeEntryController@active',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/approvals/timesheet-overflow',
                'handler'    => 'Admin\TimesheetOverflowApprovalController@index',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/approvals/timesheet-overflow/:id/approve',
                'handler'    => 'Admin\TimesheetOverflowApprovalController@approve',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/approvals/timesheet-overflow/:id/reject',
                'handler'    => 'Admin\TimesheetOverflowApprovalController@reject',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/approvals/affiliate-payout-cycle-amendments',
                'handler'    => 'Admin\AffiliatePayoutCycleAmendmentApprovalController@index',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/approvals/affiliate-payout-cycle-amendments/:id/approve',
                'handler'    => 'Admin\AffiliatePayoutCycleAmendmentApprovalController@approve',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/approvals/affiliate-payout-cycle-amendments/:id/reject',
                'handler'    => 'Admin\AffiliatePayoutCycleAmendmentApprovalController@reject',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/approvals/partner-payout-cycle-amendments',
                'handler'    => 'Admin\PartnerPayoutCycleAmendmentApprovalController@index',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/approvals/partner-payout-cycle-amendments/:id/approve',
                'handler'    => 'Admin\PartnerPayoutCycleAmendmentApprovalController@approve',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/approvals/partner-payout-cycle-amendments/:id/reject',
                'handler'    => 'Admin\PartnerPayoutCycleAmendmentApprovalController@reject',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/approvals/client-master-name-changes',
                'handler'    => 'Admin\ClientMasterNameChangeApprovalController@index',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/approvals/client-master-name-changes/:id/approve',
                'handler'    => 'Admin\ClientMasterNameChangeApprovalController@approve',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/approvals/client-master-name-changes/:id/reject',
                'handler'    => 'Admin\ClientMasterNameChangeApprovalController@reject',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/approvals/client-master-edits',
                'handler'    => 'Admin\ClientMasterEditApprovalController@index',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/approvals/client-master-edits/:id/approve',
                'handler'    => 'Admin\ClientMasterEditApprovalController@approve',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/approvals/client-master-edits/:id/reject',
                'handler'    => 'Admin\ClientMasterEditApprovalController@reject',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/approvals/ledger-txn-changes',
                'handler'    => 'Admin\LedgerTxnChangeApprovalController@index',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/approvals/ledger-txn-changes/:id/approve',
                'handler'    => 'Admin\LedgerTxnChangeApprovalController@approve',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/approvals/ledger-txn-changes/:id/reject',
                'handler'    => 'Admin\LedgerTxnChangeApprovalController@reject',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/time-entries/start',
                'handler'    => 'Admin\TimeEntryController@startForService',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/time-entries/:id/request-modify-otp',
                'handler'    => 'Admin\TimeEntryController@requestModifyOtp',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/time-entries/:id/stop',
                'handler'    => 'Admin\TimeEntryController@stopForService',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/services/:id/time-entries/:id',
                'handler'    => 'Admin\TimeEntryController@updateForService',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/services/:id/billing-closure',
                'handler'    => 'Admin\ServiceController@patchBillingClosure',
                'middleware' => ['auth', 'staff', 'permission_any:services.edit,invoices.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/billing-return-to-team',
                'handler'    => 'Admin\ServiceController@billingReturnToTeam',
                'middleware' => ['auth', 'staff', 'permission_any:services.edit,invoices.edit'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/services/:id/toggle-master',
                'handler'    => 'Admin\ServiceController@toggleMaster',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/services/:id/linked-services',
                'handler'    => 'Admin\ServiceController@linkedServices',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/link-service',
                'handler'    => 'Admin\ServiceController@linkService',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/services/:id/unlink-service/:childId',
                'handler'    => 'Admin\ServiceController@unlinkService',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/services/:id',
                'handler'    => 'Admin\ServiceController@update',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/reopen',
                'handler'    => 'Admin\ServiceController@reopen',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/services/:id',
                'handler'    => 'Admin\ServiceController@destroy',
                'middleware' => ['auth', 'staff', 'permission:services.delete'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/services/:id/tasks',
                'handler'    => 'Admin\ServiceController@addTask',
                'middleware' => ['auth', 'staff', 'permission:services.edit'],
            ],

            // ── Admin — Invoices ──────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/invoices',
                'handler'    => 'Admin\InvoiceController@index',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/invoices',
                'handler'    => 'Admin\InvoiceController@store',
                'middleware' => ['auth', 'staff', 'permission:invoices.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/invoices/:id',
                'handler'    => 'Admin\InvoiceController@show',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/invoices/:id',
                'handler'    => 'Admin\InvoiceController@update',
                'middleware' => ['auth', 'staff', 'permission:invoices.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/invoices/:id',
                'handler'    => 'Admin\InvoiceController@destroy',
                'middleware' => ['auth', 'staff', 'permission:invoices.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/invoices/ledger',
                'handler'    => 'Admin\InvoiceController@ledger',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/invoices/:id/payment',
                'handler'    => 'Admin\InvoiceController@recordPayment',
                'middleware' => ['auth', 'staff', 'permission:invoices.edit'],
            ],

            // ── Admin — Appointments (calendar events) ────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/appointments',
                'handler'    => 'Admin\AppointmentController@index',
                'middleware' => ['auth', 'staff', 'permission:calendar.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/appointments',
                'handler'    => 'Admin\AppointmentController@store',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/appointments/:id',
                'handler'    => 'Admin\AppointmentController@show',
                'middleware' => ['auth', 'staff', 'permission:calendar.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/appointments/:id',
                'handler'    => 'Admin\AppointmentController@update',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/appointments/:id',
                'handler'    => 'Admin\AppointmentController@destroy',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/appointments/:id/razorpay-order',
                'handler'    => 'Admin\AppointmentController@razorpayOrder',
                'middleware' => ['auth', 'staff', 'permission:invoices.create'],
            ],

            // ── Admin — Appointment fee rules ───────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/appointment-fee-rules',
                'handler'    => 'Admin\AppointmentFeeRuleController@index',
                'middleware' => ['auth', 'staff', 'permission:calendar.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/appointment-fee-rules',
                'handler'    => 'Admin\AppointmentFeeRuleController@store',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/appointment-fee-rules/:id',
                'handler'    => 'Admin\AppointmentFeeRuleController@show',
                'middleware' => ['auth', 'staff', 'permission:calendar.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/appointment-fee-rules/:id',
                'handler'    => 'Admin\AppointmentFeeRuleController@update',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/appointment-fee-rules/:id',
                'handler'    => 'Admin\AppointmentFeeRuleController@destroy',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],

            // ── Admin — Zoom integration ────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/integrations/zoom/authorize',
                'handler'    => 'Admin\ZoomIntegrationController@authorizeUrl',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/integrations/zoom/status',
                'handler'    => 'Admin\ZoomIntegrationController@status',
                'middleware' => ['auth', 'staff', 'permission:calendar.view'],
            ],

            // ── Admin — Calendar Sync (Google, Outlook, Apple) ───────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/integrations/calendar/google/authorize',
                'handler'    => 'Admin\CalendarSyncController@googleAuthorize',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/integrations/calendar/outlook/authorize',
                'handler'    => 'Admin\CalendarSyncController@outlookAuthorize',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/integrations/calendar/accounts',
                'handler'    => 'Admin\CalendarSyncController@accounts',
                'middleware' => ['auth', 'staff', 'permission:calendar.view'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/integrations/calendar/accounts/:id',
                'handler'    => 'Admin\CalendarSyncController@disconnect',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/integrations/calendar/accounts/:id',
                'handler'    => 'Admin\CalendarSyncController@updateAccount',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/integrations/calendar/settings',
                'handler'    => 'Admin\CalendarSyncController@getSettings',
                'middleware' => ['auth', 'staff', 'permission:calendar.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/integrations/calendar/settings',
                'handler'    => 'Admin\CalendarSyncController@updateSettings',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/integrations/calendar/sync',
                'handler'    => 'Admin\CalendarSyncController@syncNow',
                'middleware' => ['auth', 'staff', 'permission:calendar.create'],
            ],

            // ── Admin — Credentials Vault ─────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/credentials',
                'handler'    => 'Admin\CredentialController@index',
                'middleware' => ['auth', 'staff', 'permission:credentials.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/credentials',
                'handler'    => 'Admin\CredentialController@store',
                'middleware' => ['auth', 'staff', 'permission:credentials.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/credentials/:id',
                'handler'    => 'Admin\CredentialController@show',
                'middleware' => ['auth', 'staff', 'permission:credentials.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/credentials/:id',
                'handler'    => 'Admin\CredentialController@update',
                'middleware' => ['auth', 'staff', 'permission:credentials.view'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/credentials/:id',
                'handler'    => 'Admin\CredentialController@destroy',
                'middleware' => ['auth', 'staff', 'permission:credentials.view'],
            ],

            // ── Admin — Portal Types ──────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/portal-types',
                'handler'    => 'Admin\PortalTypeController@index',
                'middleware' => ['auth', 'staff', 'permission_any:credentials.view,portal_types.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/portal-types',
                'handler'    => 'Admin\PortalTypeController@store',
                'middleware' => ['auth', 'staff', 'permission:portal_types.manage'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/portal-types/:id',
                'handler'    => 'Admin\PortalTypeController@update',
                'middleware' => ['auth', 'staff', 'permission:portal_types.manage'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/portal-types/:id',
                'handler'    => 'Admin\PortalTypeController@destroy',
                'middleware' => ['auth', 'staff', 'permission:portal_types.manage'],
            ],

            // ── Admin — Leads ─────────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/leads',
                'handler'    => 'Admin\LeadController@index',
                'middleware' => ['auth', 'staff', 'permission:leads.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/leads',
                'handler'    => 'Admin\LeadController@store',
                'middleware' => ['auth', 'staff', 'permission:leads.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/leads/:id',
                'handler'    => 'Admin\LeadController@show',
                'middleware' => ['auth', 'staff', 'permission:leads.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/leads/:id',
                'handler'    => 'Admin\LeadController@update',
                'middleware' => ['auth', 'staff', 'permission:leads.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/leads/:id',
                'handler'    => 'Admin\LeadController@destroy',
                'middleware' => ['auth', 'staff', 'permission:leads.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/leads/:id/quotations',
                'handler'    => 'Admin\LeadQuotationController@index',
                'middleware' => ['auth', 'staff', 'permission:leads.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/leads/:id/quotations',
                'handler'    => 'Admin\LeadQuotationController@store',
                'middleware' => ['auth', 'staff', 'permission:quotations.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/leads/:id/quotations/:id',
                'handler'    => 'Admin\LeadQuotationController@update',
                'middleware' => ['auth', 'staff', 'permission:quotations.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/leads/:id/quotations/:id/documents',
                'handler'    => 'Admin\LeadQuotationController@updateDocuments',
                'middleware' => ['auth', 'staff', 'permission:quotations.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/leads/:id/quotations/:id/share',
                'handler'    => 'Admin\LeadQuotationController@share',
                'middleware' => ['auth', 'staff', 'permission:quotations.manage'],
            ],

            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/quotation-defaults/pending-summary',
                'handler'    => 'Admin\QuotationDefaultController@pendingSummary',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/quotation-defaults/request-change-otp',
                'handler'    => 'Admin\QuotationDefaultController@requestChangeOtp',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/quotation-defaults/by-engagement-type/:id',
                'handler'    => 'Admin\QuotationDefaultController@showByEngagementType',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/quotation-defaults/by-engagement-type/:id',
                'handler'    => 'Admin\QuotationDefaultController@updateByEngagementType',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/quotation-defaults',
                'handler'    => 'Admin\QuotationDefaultController@index',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],

            // ── Admin — Staff Leaves & Temporary Handovers ───────────────────
            // NOTE: my-charges (static) must be registered before :id patterns.
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/leaves/my-charges',
                'handler'    => 'Admin\LeaveController@myTemporaryCharges',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/leaves',
                'handler'    => 'Admin\LeaveController@index',
                'middleware' => ['auth', 'staff', 'permission:users.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/leaves',
                'handler'    => 'Admin\LeaveController@store',
                'middleware' => ['auth', 'staff', 'permission:users.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/leaves/:id',
                'handler'    => 'Admin\LeaveController@show',
                'middleware' => ['auth', 'staff', 'permission:users.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/leaves/:id',
                'handler'    => 'Admin\LeaveController@update',
                'middleware' => ['auth', 'staff', 'permission:users.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/leaves/:id/handover',
                'handler'    => 'Admin\LeaveController@handover',
                'middleware' => ['auth', 'staff', 'permission:users.manage'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/leaves/:id/assignments/:id',
                'handler'    => 'Admin\LeaveController@revokeAssignment',
                'middleware' => ['auth', 'staff', 'permission:users.manage'],
            ],

            // ── Admin — Dashboard ─────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/dashboard/stats',
                'handler'    => 'Admin\DashboardController@stats',
                'middleware' => ['auth', 'staff', 'permission:dashboard.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/notifications',
                'handler'    => 'Admin\NotificationController@index',
                'middleware' => ['auth', 'staff', 'permission:dashboard.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/notifications/mark-read',
                'handler'    => 'Admin\NotificationController@markRead',
                'middleware' => ['auth', 'staff', 'permission:dashboard.view'],
            ],

            // ── Team Chat ─────────────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/chat/conversations',
                'handler'    => 'Admin\ChatController@conversationsIndex',
                'middleware' => ['auth', 'permission:chat.use'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/chat/conversations',
                'handler'    => 'Admin\ChatController@conversationsCreate',
                'middleware' => ['auth', 'permission:chat.use'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/chat/conversations/:id',
                'handler'    => 'Admin\ChatController@conversationsShow',
                'middleware' => ['auth', 'permission:chat.use'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/chat/conversations/:id/messages',
                'handler'    => 'Admin\ChatController@messagesIndex',
                'middleware' => ['auth', 'permission:chat.use'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/chat/conversations/:id/messages',
                'handler'    => 'Admin\ChatController@messagesCreate',
                'middleware' => ['auth', 'permission:chat.use'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/chat/conversations/:id/read',
                'handler'    => 'Admin\ChatController@markRead',
                'middleware' => ['auth', 'permission:chat.use'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/chat/conversations/:id/members',
                'handler'    => 'Admin\ChatController@addMembers',
                'middleware' => ['auth', 'permission:chat.use'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/chat/conversations/:id/leave',
                'handler'    => 'Admin\ChatController@leave',
                'middleware' => ['auth', 'permission:chat.use'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/chat/contacts',
                'handler'    => 'Admin\ChatController@contacts',
                'middleware' => ['auth', 'permission:chat.use'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/chat/unread-count',
                'handler'    => 'Admin\ChatController@unreadCount',
                'middleware' => ['auth', 'permission:chat.use'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/chat/audit',
                'handler'    => 'Admin\ChatAuditController@search',
                'middleware' => ['auth', 'staff', 'permission:chat.use'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/chat/audit/conversations/:id',
                'handler'    => 'Admin\ChatAuditController@conversationThread',
                'middleware' => ['auth', 'staff', 'permission:chat.use'],
            ],

            // ── Client chat (staff desk) ──────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/client-chat/threads',
                'handler'    => 'Admin\ClientChatStaffController@threadsIndex',
                'middleware' => ['auth', 'staff', 'permission:client.chat.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/client-chat/threads/:id',
                'handler'    => 'Admin\ClientChatStaffController@threadsShow',
                'middleware' => ['auth', 'staff', 'permission:client.chat.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/client-chat/threads/:id/messages',
                'handler'    => 'Admin\ClientChatStaffController@messagesIndex',
                'middleware' => ['auth', 'staff', 'permission:client.chat.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/client-chat/threads/:id/messages',
                'handler'    => 'Admin\ClientChatStaffController@messagesCreate',
                'middleware' => ['auth', 'staff', 'permission:client.chat.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/client-chat/threads/:id/read',
                'handler'    => 'Admin\ClientChatStaffController@markRead',
                'middleware' => ['auth', 'staff', 'permission:client.chat.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/inbound-emails',
                'handler'    => 'Admin\SupportInboxController@inboundIndex',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/inbound-emails/:id',
                'handler'    => 'Admin\SupportInboxController@inboundShow',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/inbound-emails/:id',
                'handler'    => 'Admin\SupportInboxController@inboundPatch',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/support-tickets',
                'handler'    => 'Admin\SupportInboxController@ticketsIndex',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/support-tickets/:id',
                'handler'    => 'Admin\SupportInboxController@ticketsShow',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/support-tickets/:id',
                'handler'    => 'Admin\SupportInboxController@ticketsPatch',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/support-tickets/:id/pick',
                'handler'    => 'Admin\SupportInboxController@ticketsPick',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/support-tickets/:id/reply',
                'handler'    => 'Admin\SupportInboxController@ticketsReply',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/support-tickets/:id/resolve',
                'handler'    => 'Admin\SupportInboxController@ticketsResolve',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/settings/memorandum-revenue-types',
                'handler'    => 'Admin\ClientEngagementReportController@memorandumIndex',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/settings/memorandum-revenue-types',
                'handler'    => 'Admin\ClientEngagementReportController@memorandumUpdate',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/reports/client-engagement-gaps',
                'handler'    => 'Admin\ClientEngagementReportController@gaps',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],

            // ── Admin — Service Categories / Subcategories / Engagement Types ──
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/service-categories',
                'handler'    => 'Admin\ServiceCategoryController@index',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/service-categories',
                'handler'    => 'Admin\ServiceCategoryController@store',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/service-categories/:id',
                'handler'    => 'Admin\ServiceCategoryController@update',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/service-categories/:id',
                'handler'    => 'Admin\ServiceCategoryController@destroy',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/service-categories/:id/subcategories',
                'handler'    => 'Admin\ServiceCategoryController@subcategoryIndex',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/service-categories/:id/subcategories',
                'handler'    => 'Admin\ServiceCategoryController@subcategoryStore',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/service-subcategories/:id',
                'handler'    => 'Admin\ServiceCategoryController@subcategoryUpdate',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/service-subcategories/:id',
                'handler'    => 'Admin\ServiceCategoryController@subcategoryDestroy',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/service-categories/:id/engagement-types',
                'handler'    => 'Admin\ServiceCategoryController@engagementTypeIndex',
                'middleware' => ['auth', 'staff', 'permission:services.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/service-categories/:id/engagement-types',
                'handler'    => 'Admin\ServiceCategoryController@engagementTypeStore',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/engagement-types/:id',
                'handler'    => 'Admin\ServiceCategoryController@engagementTypeUpdate',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/engagement-types/:id',
                'handler'    => 'Admin\ServiceCategoryController@engagementTypeDestroy',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/service-subcategories/:id/engagement-types',
                'handler'    => 'Admin\ServiceCategoryController@engagementTypeStoreForSubcategory',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],

            // ── Admin — Billing firms (server-side; txn.billing_profile_code) ───
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/billing-firms',
                'handler'    => 'Admin\BillingFirmController@index',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/billing-firms',
                'handler'    => 'Admin\BillingFirmController@store',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/billing-firms/:slug',
                'handler'    => 'Admin\BillingFirmController@update',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/billing-firms/:slug',
                'handler'    => 'Admin\BillingFirmController@destroy',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],

            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/firm-bank-accounts',
                'handler'    => 'Admin\FirmBankAccountController@index',
                'middleware' => ['auth', 'staff', 'permission_any:invoices.view,cash_book.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/firm-bank-accounts',
                'handler'    => 'Admin\FirmBankAccountController@store',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/firm-bank-accounts/:id',
                'handler'    => 'Admin\FirmBankAccountController@update',
                'middleware' => ['auth', 'staff', 'permission_any:settings.view,invoices.edit,cash_book.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/firm-bank-accounts/:id',
                'handler'    => 'Admin\FirmBankAccountController@destroy',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],

            // ── Admin — Recovery Logs ────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/recovery-logs',
                'handler'    => 'Admin\RecoveryLogController@index',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/recovery-logs',
                'handler'    => 'Admin\RecoveryLogController@store',
                'middleware' => ['auth', 'staff', 'permission:invoices.edit'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/recovery-logs/:id',
                'handler'    => 'Admin\RecoveryLogController@update',
                'middleware' => ['auth', 'staff', 'permission:invoices.edit'],
            ],

            // ── Admin — Ledger recovery status (NPA / bad debt) ─────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/ledger-recovery-status',
                'handler'    => 'Admin\LedgerRecoveryStatusController@show',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/ledger-recovery-status/mark-npa',
                'handler'    => 'Admin\LedgerRecoveryStatusController@markNpa',
                'middleware' => ['auth', 'staff', 'permission:invoices.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/ledger-recovery-status/mark-bad-debt',
                'handler'    => 'Admin\LedgerRecoveryStatusController@markBadDebt',
                'middleware' => ['auth', 'staff', 'permission:invoices.edit'],
            ],

            // ── Admin — Opening Balances ──────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/opening-balances',
                'handler'    => 'Admin\OpeningBalanceController@index',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/opening-balances',
                'handler'    => 'Admin\OpeningBalanceController@store',
                'middleware' => ['auth', 'staff', 'permission:invoices.create'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/opening-balances',
                'handler'    => 'Admin\OpeningBalanceController@destroy',
                'middleware' => ['auth', 'staff', 'permission:invoices.edit'],
            ],

            // ── Admin — Unified Transactions (TXN) ───────────────────────────
            // NOTE: Specific sub-routes must come BEFORE the generic :id routes
            // so the router matches them first.
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/invoices/cost-analysis-preview',
                'handler'    => 'Admin\InvoiceCostVarianceController@preview',
                'middleware' => ['auth', 'staff', 'permission:invoices.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/invoices/cost-variance-report',
                'handler'    => 'Admin\InvoiceCostVarianceController@varianceReport',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/ledger',
                'handler'    => 'Admin\TxnController@ledger',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/ledger-by-group',
                'handler'    => 'Admin\TxnController@ledgerByGroup',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/ledger-reconciliation',
                'handler'    => 'Admin\TxnController@ledgerReconciliation',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/bill-settlement-report',
                'handler'    => 'Admin\TxnController@billSettlementReport',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/finance/summary',
                'handler'    => 'Admin\TxnController@financeSummary',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/recovery-by-group',
                'handler'    => 'Admin\TxnController@recoveryByGroup',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/receipts-with-unallocated',
                'handler'    => 'Admin\TxnController@receiptsWithUnallocated',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/bank-ledger',
                'handler'    => 'Admin\TxnController@bankLedger',
                'middleware' => ['auth', 'staff', 'permission_any:invoices.view,cash_book.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/firm-internal',
                'handler'    => 'Admin\TxnController@firmInternal',
                'middleware' => ['auth', 'staff', 'permission_any:invoices.view,cash_book.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/tds',
                'handler'    => 'Admin\TxnController@tdsIndex',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/receipt',
                'handler'    => 'Admin\TxnController@storeReceipt',
                'middleware' => ['auth', 'staff', 'permission:invoices.create'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/tds',
                'handler'    => 'Admin\TxnController@storeTds',
                'middleware' => ['auth', 'staff', 'permission:invoices.create'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/txn/tds/:id/finalize',
                'handler'    => 'Admin\TxnController@finalizeTds',
                'middleware' => ['auth', 'staff', 'permission:invoices.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/rebate',
                'handler'    => 'Admin\TxnController@storeRebate',
                'middleware' => ['auth', 'staff', 'permission:invoices.create'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/credit-note',
                'handler'    => 'Admin\TxnController@storeCreditNote',
                'middleware' => ['auth', 'staff', 'permission:invoices.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/opening-balance',
                'handler'    => 'Admin\TxnController@openingBalance',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/opening-balance',
                'handler'    => 'Admin\TxnController@storeOpeningBalance',
                'middleware' => ['auth', 'staff', 'permission:invoices.create'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/:id/razorpay-order',
                'handler'    => 'Admin\TxnController@razorpayOrder',
                'middleware' => ['auth', 'staff', 'permission:invoices.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn',
                'handler'    => 'Admin\TxnController@index',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn',
                'handler'    => 'Admin\TxnController@store',
                'middleware' => ['auth', 'staff', 'permission_any:invoices.create,cash_book.create'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/request-ledger-delete-otp',
                'handler'    => 'Admin\TxnController@requestLedgerDeleteOtp',
                'middleware' => ['auth', 'staff', 'permission:invoices.delete'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/bulk-delete',
                'handler'    => 'Admin\TxnController@bulkDestroy',
                'middleware' => ['auth', 'staff', 'permission:invoices.delete'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/:id/request-ledger-reversal-otp',
                'handler'    => 'Admin\TxnController@requestLedgerReversalOtp',
                'middleware' => ['auth', 'staff', 'permission:invoices.delete'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/:id/reverse',
                'handler'    => 'Admin\TxnController@reverseLedger',
                'middleware' => ['auth', 'staff', 'permission:invoices.delete'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/:id/assign-parked',
                'handler'    => 'Admin\TxnController@assignParked',
                'middleware' => ['auth', 'staff', 'permission:invoices.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/:id/cancel-reversal',
                'handler'    => 'Admin\TxnController@cancelLedgerReversal',
                'middleware' => ['auth', 'staff', 'permission:invoices.delete'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/:id/reinstate',
                'handler'    => 'Admin\TxnController@reinstate',
                'middleware' => ['auth', 'staff', 'permission:invoices.delete'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/txn/:id/request-invoice-modify-otp',
                'handler'    => 'Admin\TxnController@requestInvoiceModifyOtp',
                'middleware' => ['auth', 'staff', 'permission_any:invoices.edit,invoices.delete'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/:id/audit-log',
                'handler'    => 'Admin\TxnController@txnAuditLog',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/txn/:id',
                'handler'    => 'Admin\TxnController@show',
                'middleware' => ['auth', 'staff', 'permission:invoices.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/txn/:id',
                'handler'    => 'Admin\TxnController@update',
                'middleware' => ['auth', 'staff', 'permission_any:invoices.edit,cash_book.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/txn/:id',
                'handler'    => 'Admin\TxnController@destroy',
                'middleware' => ['auth', 'staff', 'permission_any:invoices.edit,invoices.delete,cash_book.edit'],
            ],

            // ── Admin — Client Groups ─────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/client-groups/search',
                'handler'    => 'Admin\ClientGroupController@search',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/client-groups',
                'handler'    => 'Admin\ClientGroupController@index',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/client-groups',
                'handler'    => 'Admin\ClientGroupController@store',
                'middleware' => ['auth', 'staff', 'permission:clients.create'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/client-groups/:id',
                'handler'    => 'Admin\ClientGroupController@show',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/client-groups/:id/audit-log',
                'handler'    => 'Admin\ClientGroupController@auditLog',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/client-groups/:id',
                'handler'    => 'Admin\ClientGroupController@update',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/client-groups/:id',
                'handler'    => 'Admin\ClientGroupController@destroy',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],

            // ── Admin — Affiliates & commissions ─────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/affiliates',
                'handler'    => 'Admin\AffiliateAdminController@index',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/affiliates/:id/approve',
                'handler'    => 'Admin\AffiliateAdminController@approve',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/affiliates/:id/suspend',
                'handler'    => 'Admin\AffiliateAdminController@suspend',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/commission-defaults',
                'handler'    => 'Admin\AffiliateAdminController@commissionDefaults',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/commission-defaults',
                'handler'    => 'Admin\AffiliateAdminController@updateCommissionDefaults',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/affiliates/:id/rates',
                'handler'    => 'Admin\AffiliateAdminController@ratesIndex',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/affiliates/:id/rates',
                'handler'    => 'Admin\AffiliateAdminController@ratesStore',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/affiliate-rates/:id',
                'handler'    => 'Admin\AffiliateAdminController@ratesDestroy',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/payout-requests',
                'handler'    => 'Admin\AffiliateAdminController@payoutIndex',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/payout-requests/:id',
                'handler'    => 'Admin\AffiliateAdminController@payoutUpdate',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/affiliate-payout-cycles',
                'handler'    => 'Admin\AffiliatePayoutCycleController@index',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/affiliate-payout-cycles/ensure',
                'handler'    => 'Admin\AffiliatePayoutCycleController@ensure',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/affiliate-payout-cycles/:id/preview',
                'handler'    => 'Admin\AffiliatePayoutCycleController@preview',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/affiliate-payout-cycles/:id',
                'handler'    => 'Admin\AffiliatePayoutCycleController@show',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/affiliate-payout-cycles/:id/finalise',
                'handler'    => 'Admin\AffiliatePayoutCycleController@finalise',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/affiliate-payout-cycles/:id/disburse',
                'handler'    => 'Admin\AffiliatePayoutCycleController@disburse',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/affiliate-payout-cycles/:id/amendments',
                'handler'    => 'Admin\AffiliatePayoutCycleController@submitAmendment',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/affiliate-bank/:id/verify',
                'handler'    => 'Admin\AffiliateAdminController@bankVerify',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/affiliates/:id/payout-model',
                'handler'    => 'Admin\AffiliateAdminController@setPayoutModel',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/affiliates/:id/active-fee-map',
                'handler'    => 'Admin\AffiliateAdminController@activeFeeMapIndex',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/affiliates/:id/active-fee-map',
                'handler'    => 'Admin\AffiliateAdminController@activeFeeMapStore',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/affiliate-active-fee-map/:id',
                'handler'    => 'Admin\AffiliateAdminController@activeFeeMapDestroy',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/affiliate-redemptions',
                'handler'    => 'Admin\AffiliateAdminController@redemptionsIndex',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/affiliate-redemptions/:id',
                'handler'    => 'Admin\AffiliateAdminController@redemptionsUpdate',
                'middleware' => ['auth', 'staff', 'permission:affiliates.manage'],
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
            [
                'method'     => 'GET',
                'pattern'    => '/api/affiliate/rewards',
                'handler'    => 'Affiliate\AffiliatePortalController@rewardsIndex',
                'middleware' => ['auth', 'permission:affiliate.portal'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/affiliate/rewards/redeem',
                'handler'    => 'Affiliate\AffiliatePortalController@rewardsRedeem',
                'middleware' => ['auth', 'permission:affiliate.portal'],
            ],
            // ── Admin — Partners ──────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/partners',
                'handler'    => 'Admin\PartnerAdminController@index',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/partners/create',
                'handler'    => 'Admin\PartnerAdminController@create',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/partners/:id/approve',
                'handler'    => 'Admin\PartnerAdminController@approve',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/partners/:id/suspend',
                'handler'    => 'Admin\PartnerAdminController@suspend',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/partner-assignments',
                'handler'    => 'Admin\PartnerAdminController@assignWork',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/partner-assignments',
                'handler'    => 'Admin\PartnerAdminController@assignmentsIndex',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/partner-payout-requests',
                'handler'    => 'Admin\PartnerAdminController@payoutIndex',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/partner-payout-requests/:id',
                'handler'    => 'Admin\PartnerAdminController@payoutUpdate',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/partner-payout-cycles',
                'handler'    => 'Admin\PartnerPayoutCycleController@index',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/partner-payout-cycles/ensure',
                'handler'    => 'Admin\PartnerPayoutCycleController@ensure',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/partner-payout-cycles/:id/preview',
                'handler'    => 'Admin\PartnerPayoutCycleController@preview',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/partner-payout-cycles/:id',
                'handler'    => 'Admin\PartnerPayoutCycleController@show',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/partner-payout-cycles/:id/finalise',
                'handler'    => 'Admin\PartnerPayoutCycleController@finalise',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/partner-payout-cycles/:id/disburse',
                'handler'    => 'Admin\PartnerPayoutCycleController@disburse',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/partner-payout-cycles/:id/amendments',
                'handler'    => 'Admin\PartnerPayoutCycleController@submitAmendment',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/admin/partner-bank/:id/verify',
                'handler'    => 'Admin\PartnerAdminController@bankVerify',
                'middleware' => ['auth', 'staff', 'permission:partners.manage'],
            ],

            // ── Partner portal ───────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/partner/dashboard',
                'handler'    => 'Partner\PartnerPortalController@dashboard',
                'middleware' => ['auth', 'permission:partner.portal'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/partner/assignments',
                'handler'    => 'Partner\PartnerPortalController@assignments',
                'middleware' => ['auth', 'permission:partner.portal'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/partner/assignments/:id',
                'handler'    => 'Partner\PartnerPortalController@assignmentUpdate',
                'middleware' => ['auth', 'permission:partner.assignments.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/partner/payouts',
                'handler'    => 'Partner\PartnerPortalController@payoutIndex',
                'middleware' => ['auth', 'permission:partner.payouts.request'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/partner/payouts',
                'handler'    => 'Partner\PartnerPortalController@payoutStore',
                'middleware' => ['auth', 'permission:partner.payouts.request'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/partner/payout-cycles',
                'handler'    => 'Partner\PartnerPortalController@payoutCycles',
                'middleware' => ['auth', 'permission:partner.portal'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/partner/bank',
                'handler'    => 'Partner\PartnerPortalController@bankIndex',
                'middleware' => ['auth', 'permission:partner.bank.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/partner/bank',
                'handler'    => 'Partner\PartnerPortalController@bankStore',
                'middleware' => ['auth', 'permission:partner.bank.manage'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/partner/accruals',
                'handler'    => 'Partner\PartnerPortalController@accruals',
                'middleware' => ['auth', 'permission:partner.portal'],
            ],

            // ── Admin — KYC Documents ────────────────────────────────────────
            // Static sub-routes (request-uncompressed-otp, request-delete-otp)
            // must appear BEFORE :id patterns so the router matches them first.
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/kyc-documents/request-uncompressed-otp',
                'handler'    => 'Admin\KycDocumentController@requestUncompressedOtp',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/kyc-documents/request-delete-otp',
                'handler'    => 'Admin\KycDocumentController@requestDeleteOtp',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/kyc-documents',
                'handler'    => 'Admin\KycDocumentController@index',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/kyc-documents',
                'handler'    => 'Admin\KycDocumentController@store',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/kyc-documents/:id/file',
                'handler'    => 'Admin\KycDocumentController@serveFile',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/kyc-documents/:id/audit',
                'handler'    => 'Admin\KycDocumentController@auditLog',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/kyc-documents/:id/audit',
                'handler'    => 'Admin\KycDocumentController@clearAuditLog',
                'middleware' => ['auth', 'staff', 'role:super_admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/kyc-documents/:id/new-version',
                'handler'    => 'Admin\KycDocumentController@newVersion',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/kyc-documents/:id',
                'handler'    => 'Admin\KycDocumentController@show',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/kyc-documents/:id',
                'handler'    => 'Admin\KycDocumentController@update',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/kyc-documents/:id',
                'handler'    => 'Admin\KycDocumentController@destroy',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],

            // ── Admin — Registers ────────────────────────────────────────────
            // Static sub-route /counts must appear before :id pattern.
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/registers/counts',
                'handler'    => 'Admin\RegisterController@counts',
                'middleware' => ['auth', 'staff', 'permission:registers.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/registers',
                'handler'    => 'Admin\RegisterController@index',
                'middleware' => ['auth', 'staff', 'permission:registers.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/registers',
                'handler'    => 'Admin\RegisterController@store',
                'middleware' => ['auth', 'staff', 'permission:registers.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/registers/:id',
                'handler'    => 'Admin\RegisterController@show',
                'middleware' => ['auth', 'staff', 'permission:registers.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/registers/:id',
                'handler'    => 'Admin\RegisterController@update',
                'middleware' => ['auth', 'staff', 'permission:registers.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/registers/:id',
                'handler'    => 'Admin\RegisterController@destroy',
                'middleware' => ['auth', 'staff', 'permission:registers.edit'],
            ],

            // ── Admin — Recurring Service Definitions ─────────────────────────
            // Static sub-route /:id/generate must appear before :id pattern.
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/recurring-services/:id/generate',
                'handler'    => 'Admin\RecurringServiceDefinitionController@generatePeriods',
                'middleware' => ['auth', 'staff', 'permission:registers.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/recurring-services',
                'handler'    => 'Admin\RecurringServiceDefinitionController@index',
                'middleware' => ['auth', 'staff', 'permission:registers.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/recurring-services',
                'handler'    => 'Admin\RecurringServiceDefinitionController@store',
                'middleware' => ['auth', 'staff', 'permission:registers.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/recurring-services/:id',
                'handler'    => 'Admin\RecurringServiceDefinitionController@show',
                'middleware' => ['auth', 'staff', 'permission:registers.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/recurring-services/:id',
                'handler'    => 'Admin\RecurringServiceDefinitionController@update',
                'middleware' => ['auth', 'staff', 'permission:registers.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/recurring-services/:id',
                'handler'    => 'Admin\RecurringServiceDefinitionController@destroy',
                'middleware' => ['auth', 'staff', 'permission:registers.edit'],
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
            [
                'method'     => 'GET',
                'pattern'    => '/api/client/services/:id/logs',
                'handler'    => 'Client\ServiceLogController@index',
                'middleware' => ['auth', 'permission:client.services.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/client/chat/thread',
                'handler'    => 'Client\ClientChatController@thread',
                'middleware' => ['auth', 'permission:client.chat.use'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/client/chat/messages',
                'handler'    => 'Client\ClientChatController@sendMessage',
                'middleware' => ['auth', 'permission:client.chat.use'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/client/chat/read',
                'handler'    => 'Client\ClientChatController@markRead',
                'middleware' => ['auth', 'permission:client.chat.use'],
            ],

            // ── Marketing — WA Web Session ────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/wa/session/status',
                'handler'    => 'Admin\MarketingController@waSessionStatus',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/wa/session/start',
                'handler'    => 'Admin\MarketingController@waSessionStart',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/wa/session/stop',
                'handler'    => 'Admin\MarketingController@waSessionStop',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/wa/contacts',
                'handler'    => 'Admin\MarketingController@waContacts',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/wa/groups',
                'handler'    => 'Admin\MarketingController@waGroups',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/wa/send',
                'handler'    => 'Admin\MarketingController@waSend',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/wa/channels',
                'handler'    => 'Admin\MarketingController@waChannels',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/wa/channels',
                'handler'    => 'Admin\MarketingController@waChannelAdd',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/marketing/wa/channels/{jid}',
                'handler'    => 'Admin\MarketingController@waChannelRemove',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],

            // ── Marketing — WA Native / Business API ─────────────────────────
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/wa/native/config',
                'handler'    => 'Admin\MarketingController@waNativeConfig',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/wa/native/send',
                'handler'    => 'Admin\MarketingController@waNativeSend',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],

            // ── Marketing — SMS ───────────────────────────────────────────────
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/sms/send',
                'handler'    => 'Admin\MarketingController@smsSend',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/sms/templates',
                'handler'    => 'Admin\MarketingController@smsTemplates',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/sms/templates',
                'handler'    => 'Admin\MarketingController@smsTemplateStore',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/sms/logs',
                'handler'    => 'Admin\MarketingController@smsLogs',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],

            // ── Marketing — Social Posting ────────────────────────────────────
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/social/post',
                'handler'    => 'Admin\MarketingController@socialPost',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/social/config',
                'handler'    => 'Admin\MarketingController@socialConfig',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],

            // ── Marketing — Campaigns ─────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/campaigns',
                'handler'    => 'Admin\MarketingController@campaignIndex',
                'middleware' => ['auth', 'staff', 'permission_any:leads.view,leads.create,leads.edit,quotations.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/campaigns',
                'handler'    => 'Admin\MarketingController@campaignStore',
                'middleware' => ['auth', 'staff', 'permission_any:leads.view,leads.create,leads.edit,quotations.manage'],
            ],

            // ── Marketing — Affiliate Prospects ───────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/prospects',
                'handler'    => 'Admin\MarketingController@prospectIndex',
                'middleware' => ['auth', 'staff', 'permission_any:leads.view,leads.create,leads.edit,quotations.manage'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/prospects',
                'handler'    => 'Admin\MarketingController@prospectStore',
                'middleware' => ['auth', 'staff', 'permission_any:leads.view,leads.create,leads.edit,quotations.manage'],
            ],
            [
                'method'     => 'PATCH',
                'pattern'    => '/api/marketing/prospects/:id',
                'handler'    => 'Admin\MarketingController@prospectUpdate',
                'middleware' => ['auth', 'staff', 'permission_any:leads.view,leads.create,leads.edit,quotations.manage'],
            ],

            // ── Marketing — Document Share ─────────────────────────────────────
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/documents/:id/share',
                'handler'    => 'Admin\MarketingController@documentShare',
                'middleware' => ['auth', 'staff', 'permission:documents.upload'],
            ],

            // ── Marketing — Marketing Logs ────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/logs',
                'handler'    => 'Admin\MarketingController@marketingLogs',
                'middleware' => ['auth', 'staff', 'permission:dashboard.view'],
            ],

            // ── Marketing — Blog Posts ────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/blog/posts',
                'handler'    => 'Admin\BlogController@blogIndex',
                'middleware' => ['auth', 'staff', 'permission:dashboard.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/blog/posts',
                'handler'    => 'Admin\BlogController@blogStore',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/marketing/blog/posts/:id',
                'handler'    => 'Admin\BlogController@blogUpdate',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/marketing/blog/posts/:id',
                'handler'    => 'Admin\BlogController@blogDelete',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/blog/posts/:id/publish',
                'handler'    => 'Admin\BlogController@blogPublish',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/blog/posts/:id/resend-email',
                'handler'    => 'Admin\BlogController@blogResendEmail',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/blog/posts/:id/share-wa',
                'handler'    => 'Admin\BlogController@blogShareWa',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],

            // ── Marketing — Blog AI Drafts ────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/blog/drafts',
                'handler'    => 'Admin\BlogController@draftIndex',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/marketing/blog/drafts/:id',
                'handler'    => 'Admin\BlogController@draftUpdate',
                'middleware' => ['auth', 'staff'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/blog/drafts/:id/approve',
                'handler'    => 'Admin\BlogController@draftApprove',
                'middleware' => ['auth', 'staff'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/blog/drafts/:id/reject',
                'handler'    => 'Admin\BlogController@draftReject',
                'middleware' => ['auth', 'staff'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/blog/generate-ai-drafts',
                'handler'    => 'Admin\BlogController@generateAiDrafts',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/blog/ai-settings',
                'handler'    => 'Admin\BlogController@aiSettingsIndex',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/marketing/blog/ai-settings',
                'handler'    => 'Admin\BlogController@aiSettingsUpdate',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],

            // ── Marketing — Blog Image Upload ─────────────────────────────────
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/blog/upload-image',
                'handler'    => 'Admin\BlogController@imageUpload',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],

            // ── Public Blog API (no auth — for marketing site) ────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/public/blog-covers/:slug',
                'handler'    => 'Admin\BlogController@publicBlogCover',
                'middleware' => [],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/public/blogs',
                'handler'    => 'Admin\BlogController@publicBlogs',
                'middleware' => [],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/public/blogs/:slug',
                'handler'    => 'Admin\BlogController@publicBlogPost',
                'middleware' => [],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/public/leads',
                'handler'    => 'Admin\BlogController@publicLeadSubmit',
                'middleware' => [],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/public/quotation-shares/:token',
                'handler'    => 'PublicQuotationShareController@download',
                'middleware' => [],
            ],

            // ── Marketing - Traffic Analytics & AI Insights ───────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/traffic/overview',
                'handler'    => 'Admin\TrafficAnalyticsController@overview',
                'middleware' => ['auth', 'staff', 'permission:dashboard.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/traffic/sources',
                'handler'    => 'Admin\TrafficAnalyticsController@sources',
                'middleware' => ['auth', 'staff', 'permission:dashboard.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/traffic/leads',
                'handler'    => 'Admin\TrafficAnalyticsController@leads',
                'middleware' => ['auth', 'staff', 'permission:dashboard.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/marketing/ai-insights',
                'handler'    => 'Admin\TrafficAnalyticsController@aiInsights',
                'middleware' => ['auth', 'staff', 'permission:dashboard.view'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/marketing/ai-insights/refresh',
                'handler'    => 'Admin\TrafficAnalyticsController@refreshAiInsights',
                'middleware' => ['auth', 'staff', 'permission:dashboard.view'],
            ],

            // ── Contact Verification ──────────────────────────────────────────
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/contacts/:id/verify/send-otp',
                'handler'    => 'Admin\ContactVerificationController@sendOtp',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/contacts/:id/verify/confirm',
                'handler'    => 'Admin\ContactVerificationController@confirm',
                'middleware' => ['auth', 'staff', 'permission:clients.edit'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/contacts/verification/exceptions',
                'handler'    => 'Admin\ContactVerificationController@exceptions',
                'middleware' => ['auth', 'staff', 'permission:clients.view'],
            ],

            // ── Activity Trigger Config ───────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/settings/triggers',
                'handler'    => 'Admin\ActivityTriggerController@index',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/settings/triggers/:id',
                'handler'    => 'Admin\ActivityTriggerController@update',
                'middleware' => ['auth', 'staff', 'permission:settings.edit'],
            ],

            // ── Cron Jobs Registry ────────────────────────────────────────────
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/settings/cron-jobs',
                'handler'    => 'Admin\CronJobsController@index',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/settings/cron-jobs/logs',
                'handler'    => 'Admin\CronJobLogsController@tail',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'GET',
                'pattern'    => '/api/admin/settings/office-calendar',
                'handler'    => 'Admin\OfficeCalendarController@show',
                'middleware' => ['auth', 'staff', 'permission:settings.view'],
            ],
            [
                'method'     => 'PUT',
                'pattern'    => '/api/admin/settings/office-calendar',
                'handler'    => 'Admin\OfficeCalendarController@update',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'POST',
                'pattern'    => '/api/admin/settings/office-calendar/holidays',
                'handler'    => 'Admin\OfficeCalendarController@storeHoliday',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
            [
                'method'     => 'DELETE',
                'pattern'    => '/api/admin/settings/office-calendar/holidays/:id',
                'handler'    => 'Admin\OfficeCalendarController@destroyHoliday',
                'middleware' => ['auth', 'staff', 'role:super_admin,admin'],
            ],
        ];
    }
}
