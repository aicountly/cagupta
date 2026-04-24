<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Auth as AuthConfig;
use App\Controllers\BaseController;
use App\Libraries\BrevoMailer;
use App\Libraries\OtpService;
use App\Models\AdminAuditLogModel;
use App\Models\ClientModel;
use App\Models\OrganizationModel;
use App\Models\ServiceModel;
use App\Models\TimeEntryModel;
use App\Models\UserModel;

/**
 * ServiceController — CRUD for the `services` table (service engagements).
 *
 * All endpoints require Bearer token + role: super_admin or admin.
 */
class ServiceController extends BaseController
{
    private ServiceModel $services;
    private AdminAuditLogModel $audit;
    private UserModel $users;
    private TimeEntryModel $timeEntries;

    public function __construct()
    {
        $this->services   = new ServiceModel();
        $this->audit      = new AdminAuditLogModel();
        $this->users      = new UserModel();
        $this->timeEntries = new TimeEntryModel();
    }

    // ── GET /api/admin/services ──────────────────────────────────────────────

    /**
     * Return a paginated list of service engagements.
     *
     * Query params: page, per_page, search, status
     */
    public function index(): never
    {
        $page     = max(1, (int)$this->query('page', 1));
        $perPage  = min(100, max(1, (int)$this->query('per_page', 20)));
        $search   = trim((string)$this->query('search', ''));
        $status   = trim((string)$this->query('status', ''));
        $clientId = (int)$this->query('client_id', 0);
        $orgId    = (int)$this->query('organization_id', 0);

        $result = $this->services->paginate($page, $perPage, $search, $status, $clientId, $orgId);

        $this->success($result['services'], 'Services retrieved', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => (int)ceil($result['total'] / $perPage),
            ],
        ]);
    }

    // ── GET /api/admin/services/kpi-snapshot ─────────────────────────────────

    /**
     * Engagement-level KPI counts and week lines for Services & Tasks.
     * Query: as_of=YYYY-MM-DD (client local “today” so counts match the browser).
     */
    public function kpiSnapshot(): never
    {
        $asOf = trim((string)$this->query('as_of', ''));
        if ($asOf === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $asOf)) {
            $asOf = (new \DateTimeImmutable('today'))->format('Y-m-d');
        }

        try {
            $this->success($this->services->computeKpiSnapshot($asOf), 'KPI snapshot', 200);
        } catch (\InvalidArgumentException) {
            $this->error('Invalid as_of — use YYYY-MM-DD', 422);
        }
    }

    // ── POST /api/admin/services ─────────────────────────────────────────────

    /**
     * Create a new service engagement.
     *
     * Body: { client_type?, client_id?, organization_id?, client_name?,
     *         service_type, financial_year?, due_date?, status?, assigned_to?,
     *         fees?, notes?, tasks?,
     *         category_id?, category_name?, subcategory_id?, subcategory_name?,
     *         engagement_type_id?, engagement_type_name? }
     */
    public function store(): never
    {
        try {
        $body        = $this->getJsonBody();
        $serviceType = trim((string)($body['service_type'] ?? ''));

        $assignedTo = null;
        if (array_key_exists('assigned_to', $body) && $body['assigned_to'] !== null && $body['assigned_to'] !== '') {
            if (is_numeric($body['assigned_to'])) {
                $n = (int)$body['assigned_to'];
                $assignedTo = $n > 0 ? $n : null;
            }
        }

        if ($serviceType === '') {
            $this->error('service_type is required.', 422);
        }

        $actingUser = $this->authUser();

        $clientType = strtolower(trim((string)($body['client_type'] ?? 'contact')));
        $clientId   = isset($body['client_id']) ? (int)$body['client_id'] : 0;
        $orgId      = isset($body['organization_id']) ? (int)$body['organization_id'] : 0;

        $refAff         = null;
        $commissionMode = 'referral_only';
        $clientFacing   = false;

        $clients = new ClientModel();
        $orgs    = new OrganizationModel();

        if ($clientType === 'organization') {
            if ($orgId > 0) {
                $row = $orgs->find($orgId);
                if ($row === null) {
                    $this->error('Organization not found.', 404);
                }
                $r = (int)($row['referring_affiliate_user_id'] ?? 0);
                $refAff         = $r > 0 ? $r : null;
                $commissionMode = $this->normalizeCommissionMode($row['commission_mode'] ?? 'referral_only');
                $clientFacing   = !empty($row['client_facing_restricted']);
            }
        } elseif ($clientId > 0) {
            $row = $clients->find($clientId);
            if ($row === null) {
                $this->error('Contact not found.', 404);
            }
            $r = (int)($row['referring_affiliate_user_id'] ?? 0);
            $refAff         = $r > 0 ? $r : null;
            $commissionMode = $this->normalizeCommissionMode($row['commission_mode'] ?? 'referral_only');
            $clientFacing   = !empty($row['client_facing_restricted']);
        }

        $dueIn = $body['due_date'] ?? null;
        $this->assertServiceDueDateAllowed($dueIn, null);

        $assigneeListEarly = $this->normalizeAssigneeUserIdsFromBody($body);
        if ($assigneeListEarly !== null) {
            $finalAssigneesForCheck = $assigneeListEarly;
        } elseif ($assignedTo !== null && $assignedTo > 0) {
            $finalAssigneesForCheck = [$assignedTo];
        } else {
            $finalAssigneesForCheck = [];
        }

        foreach ($finalAssigneesForCheck as $uid) {
            if ($this->users->find((int)$uid) === null) {
                $this->error('Assigned staff user is not valid. Choose another assignee.', 422);
            }
        }

        $engagementTypeIdForDup = isset($body['engagement_type_id']) ? (int)$body['engagement_type_id'] : 0;
        $this->assertNoOpenEngagementDuplicateForAssignees(
            $engagementTypeIdForDup > 0 ? $engagementTypeIdForDup : null,
            $clientType,
            $clientId,
            $orgId,
            $finalAssigneesForCheck,
            null
        );

        $newId = $this->services->create([
            'client_type'          => $body['client_type']          ?? 'contact',
            'client_id'            => isset($body['client_id'])    ? (int)$body['client_id']    : null,
            'organization_id'      => isset($body['organization_id']) ? (int)$body['organization_id'] : null,
            'client_name'          => $body['client_name']          ?? null,
            'service_type'         => $serviceType,
            'financial_year'       => $body['financial_year']       ?? null,
            'due_date'             => $body['due_date']             ?? null,
            'status'               => $body['status']               ?? 'not_started',
            'assigned_to'          => $assignedTo,
            'fees'                 => isset($body['fees'])          ? (float)$body['fees'] : null,
            'notes'                => $body['notes']                ?? null,
            'tasks'                => $body['tasks']                ?? [],
            'created_by'           => $actingUser ? (int)$actingUser['id'] : null,
            'category_id'          => $body['category_id']          ?? null,
            'category_name'        => $body['category_name']        ?? null,
            'subcategory_id'       => $body['subcategory_id']       ?? null,
            'subcategory_name'     => $body['subcategory_name']     ?? null,
            'engagement_type_id'   => $body['engagement_type_id']   ?? null,
            'engagement_type_name' => $body['engagement_type_name'] ?? null,
            'referring_affiliate_user_id' => $refAff,
            'referral_start_date'  => null,
            'commission_mode'      => $commissionMode,
            'client_facing_restricted' => $clientFacing,
        ]);

        $this->services->promoteBillingOpenIfEligible($newId);

        $assigneeList = $this->normalizeAssigneeUserIdsFromBody($body);
        if ($assigneeList !== null) {
            $this->services->replaceAssignees($newId, $assigneeList);
        } elseif ($assignedTo !== null && $assignedTo > 0) {
            $this->services->replaceAssignees($newId, [$assignedTo]);
        }

        $service = $this->services->find($newId);
        $this->success($service, 'Service engagement created', 201);
        } catch (\Throwable $e) {
            // #region agent log
            $logPath = dirname(__DIR__, 4) . DIRECTORY_SEPARATOR . 'debug-441a9d.log';
            $payload = [
                'sessionId'   => '441a9d',
                'runId'       => 'post-fix',
                'timestamp'   => (int) round(microtime(true) * 1000),
                'location'    => 'ServiceController.php:store',
                'message'     => 'store() Throwable',
                'data'        => [
                    'hypothesisId'       => 'H2',
                    'exceptionClass'     => $e::class,
                    'exceptionMessage'   => $e->getMessage(),
                ],
            ];
            @file_put_contents($logPath, json_encode($payload) . "\n", FILE_APPEND | LOCK_EX);
            // #endregion
            error_log('[ServiceController] store: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
            $appCfg = new \App\Config\App();
            $public = 'Failed to create service engagement.';
            if (strtolower($appCfg->environment) === 'development') {
                $public .= ' ' . $e->getMessage();
            }
            $this->error($public, 500);
        }
    }

    // ── GET /api/admin/services/billing-report ───────────────────────────────

    /**
     * Billing queue / built / non-billable report for completed engagements.
     *
     * Query: completion=engagement|tasks|any, closure=pending|built|non_billable,
     *        page, per_page, search
     */
    public function billingReport(): never
    {
        $page       = max(1, (int)$this->query('page', 1));
        $perPage    = min(100, max(1, (int)$this->query('per_page', 20)));
        $completion = trim((string)$this->query('completion', 'any'));
        $closure    = trim((string)$this->query('closure', 'pending'));
        $search     = trim((string)$this->query('search', ''));

        $result = $this->services->billingReportPaginate($page, $perPage, $completion, $closure, $search);
        $rows   = [];
        foreach ($result['rows'] as $r) {
            $invC = (int)($r['invoice_count'] ?? 0);
            $ec   = $r['engagement_completed'] ?? false;
            $atd  = $r['all_tasks_done'] ?? false;
            $row  = array_merge($r, [
                'client_name'      => $r['display_client_name'] ?? $r['client_name'] ?? null,
                'has_invoice'      => $invC > 0,
                'completion_flags' => [
                    'engagement_completed' => $ec === true || $ec === 't' || $ec === '1',
                    'all_tasks_done'       => $atd === true || $atd === 't' || $atd === '1',
                ],
            ]);
            unset($row['display_client_name']);
            $rows[] = $row;
        }

        $this->success($rows, 'Billing report retrieved', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => $result['total'] > 0 ? (int)ceil($result['total'] / $perPage) : 1,
            ],
        ]);
    }

    // ── GET /api/admin/services/:id/billing-invoices ─────────────────────────

    /**
     * Invoice txn history for a service engagement (eye icon).
     */
    public function billingInvoices(int $id): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }
        $txns = $this->services->listBillingInvoiceTxns($id);
        $this->success($txns, 'Billing invoices retrieved');
    }

    // ── POST /api/admin/services/:id/request-client-facing-otp ───────────────

    /**
     * Send a superadmin OTP to authorize client_facing_restricted changes and/or removing tasks (PUT).
     */
    public function requestClientFacingOtp(int $id): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        $super = $this->users->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
        if ($super === null || !$super['is_active']) {
            $this->error('Super admin account is not provisioned.', 500);
        }
        $superId = (int)$super['id'];
        $email   = trim((string)($super['email'] ?? ''));
        if ($email === '') {
            $this->error('Super admin has no email.', 500);
        }

        $otp = OtpService::generate($superId);
        try {
            $htmlBody = BrevoMailer::renderTemplate('service-client-facing-otp', [
                'userName'       => (string)($super['name'] ?? $email),
                'otpCode'        => $otp,
                'expiryMinutes'  => (string)OtpService::expiryMinutes(),
                'serviceId'      => (string)$id,
            ]);
            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $email,
                    (string)($super['name'] ?? $email),
                    'Service change OTP - CA Rahul Gupta',
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[ServiceController] Client-facing OTP email failed: ' . $e->getMessage());
        }

        $this->success([
            'otp_sent'     => true,
            'masked_email' => $this->maskEmail($email),
        ], 'OTP sent.');
    }

    // ── POST /api/admin/services/:id/request-delete-otp ──────────────────────

    /**
     * Send a superadmin OTP email to authorize permanently deleting this service engagement.
     */
    public function requestDeleteOtp(int $id): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        $super = $this->users->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
        if ($super === null || !$super['is_active']) {
            $this->error('Super admin account is not provisioned.', 500);
        }
        $superId = (int)$super['id'];
        $email   = trim((string)($super['email'] ?? ''));
        if ($email === '') {
            $this->error('Super admin has no email.', 500);
        }

        $otp = OtpService::generate($superId);
        $clientName = (string)($service['client_name'] ?? 'Unknown');
        $serviceType = (string)($service['service_type'] ?? '—');
        try {
            $htmlBody = BrevoMailer::renderTemplate('service-delete-otp', [
                'userName'      => (string)($super['name'] ?? $email),
                'otpCode'       => $otp,
                'expiryMinutes' => (string)OtpService::expiryMinutes(),
                'serviceId'     => (string)$id,
                'clientName'    => $clientName,
                'serviceType'   => $serviceType,
            ]);
            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $email,
                    (string)($super['name'] ?? $email),
                    'Service delete OTP - CA Rahul Gupta',
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[ServiceController] Delete OTP email failed: ' . $e->getMessage());
        }

        $this->success([
            'otp_sent'     => true,
            'masked_email' => $this->maskEmail($email),
        ], 'OTP sent.');
    }

    // ── PATCH /api/admin/services/:id/billing-closure ────────────────────────

    /**
     * Close billing row: built (in books) or non_billable.
     *
     * Body: { closure: "built"|"non_billable", reason?: string }
     */
    public function patchBillingClosure(int $id): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        $body    = $this->getJsonBody();
        $closure = strtolower(trim((string)($body['closure'] ?? '')));
        $reason  = isset($body['reason']) ? trim((string)$body['reason']) : null;

        if (!in_array($closure, ['built', 'non_billable'], true)) {
            $this->error('closure must be "built" or "non_billable".', 422);
        }

        $updated = $this->services->applyBillingClosure($id, $closure, $reason);
        if ($updated === null) {
            $this->error('Billing closure can only be changed when billing_closure is "open".', 422);
        }

        $beforeSnap = $this->serviceAuditSnapshot($service);
        $afterSnap  = $this->serviceAuditSnapshot($updated);
        $actorId    = $this->authUser() ? (int)$this->authUser()['id'] : null;
        try {
            $this->audit->insert(
                $actorId,
                'service.billing_closure',
                'service',
                $id,
                ['closure' => $closure],
                $beforeSnap,
                $afterSnap
            );
        } catch (\Throwable $e) {
            error_log('[ServiceController] Audit log failed: ' . $e->getMessage());
        }

        $meta = [];
        if ($closure === 'built') {
            $invoiced = (float)($updated['billing_built_amount'] ?? 0);
            $meta['billing_time_metrics'] = $this->timeEntries->finalizeBillingSnapshot($id, $invoiced);
        }

        $this->success($updated, 'Billing closure updated', 200, $meta);
    }

    // ── GET /api/admin/services/:id ──────────────────────────────────────────

    /**
     * Return a single service engagement.
     */
    public function show(int $id): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }
        $this->success($service);
    }

    // ── GET /api/admin/services/:id/audit-log ────────────────────────────────

    /**
     * Paginated admin audit rows for this service engagement.
     *
     * Query: limit (default 50, max 100), offset (default 0)
     */
    public function auditLog(int $id): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        $limit  = min(100, max(1, (int)$this->query('limit', 50)));
        $offset = max(0, (int)$this->query('offset', 0));

        $rows = $this->audit->listForEntity('service', $id, $limit, $offset);
        $this->success($rows, 'Audit log retrieved');
    }

    // ── PUT /api/admin/services/:id ──────────────────────────────────────────

    /**
     * Update a service engagement.
     */
    public function update(int $id): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        $beforeSnap = $this->serviceAuditSnapshot($service);
        $body       = $this->getJsonBody();
        $data       = [];

        $allowed = [
            'status', 'assigned_to', 'due_date', 'fees', 'notes', 'priority', 'service_type', 'financial_year',
        ];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        if (array_key_exists('tasks', $body)) {
            $data['tasks'] = $body['tasks'];
        }

        $assigneeList = $this->normalizeAssigneeUserIdsFromBody($body);
        $newAssignees       = null;
        $assigneesInRequest = false;
        if ($assigneeList !== null) {
            $newAssignees       = $assigneeList;
            $assigneesInRequest = true;
        } elseif (array_key_exists('assigned_to', $body) || array_key_exists('assignedTo', $body)) {
            $raw = $body['assigned_to'] ?? $body['assignedTo'] ?? null;
            $n   = null;
            if ($raw !== null && $raw !== '' && is_numeric($raw)) {
                $t = (int)$raw;
                if ($t > 0) {
                    $n = $t;
                }
            }
            $newAssignees       = $n !== null ? [$n] : [];
            $assigneesInRequest = true;
        }

        if ($assigneesInRequest && is_array($newAssignees)) {
            foreach ($newAssignees as $uid) {
                if ($this->users->find((int)$uid) === null) {
                    $this->error('Assigned staff user is not valid. Choose another assignee.', 422);
                }
            }
            $etDup = (int)($service['engagement_type_id'] ?? 0);
            $svcClientType = strtolower(trim((string)($service['client_type'] ?? 'contact')));
            $svcClientId   = (int)($service['client_id'] ?? 0);
            $svcOrgId      = (int)($service['organization_id'] ?? 0);
            $this->assertNoOpenEngagementDuplicateForAssignees(
                $etDup > 0 ? $etDup : null,
                $svcClientType,
                $svcClientId,
                $svcOrgId,
                $newAssignees,
                $id
            );
            $this->services->replaceAssignees($id, $newAssignees);
            unset($data['assigned_to']);
        }

        $oldCfr = (bool)($service['client_facing_restricted'] ?? false);
        $newCfrIfPresent = array_key_exists('client_facing_restricted', $body)
            ? (bool)$body['client_facing_restricted']
            : $oldCfr;
        $cfrChange = array_key_exists('client_facing_restricted', $body) && $newCfrIfPresent !== $oldCfr;

        $oldTasksDecoded = $this->decodeTasksJson($service['tasks'] ?? null);
        $tasksRemoved    = false;
        if (array_key_exists('tasks', $body)) {
            $newTasksRaw = $body['tasks'];
            $newTasksArr = is_array($newTasksRaw) ? $newTasksRaw : [];
            $tasksRemoved = $this->taskListHasRemoval($oldTasksDecoded, $newTasksArr);
        }

        if ($cfrChange || $tasksRemoved) {
            $otp = $this->readSuperadminOtpFromRequest();
            if ($otp === '' || !$this->verifySuperadminOtp($otp)) {
                $this->error(
                    'Valid superadmin OTP is required for this change (client-facing restricted and/or removing tasks). Request a code first.',
                    403
                );
            }
        }

        if (array_key_exists('client_facing_restricted', $body)) {
            $newCfr = (bool)$body['client_facing_restricted'];
            if ($newCfr !== $oldCfr) {
                $data['client_facing_restricted'] = $newCfr;
            }
        }

        if (array_key_exists('due_date', $data)) {
            $this->assertServiceDueDateAllowed($data['due_date'], isset($service['due_date']) ? (string)$service['due_date'] : null);
        }

        if ($data !== []) {
            $this->services->update($id, $data);
        }
        $this->services->promoteBillingOpenIfEligible($id);
        $updated   = $this->services->find($id);
        $afterSnap = $this->serviceAuditSnapshot($updated ?? []);
        $meta      = $this->taskDiffMetadata($beforeSnap['tasks'] ?? [], $afterSnap['tasks'] ?? []);
        $actorId   = $this->authUser() ? (int)$this->authUser()['id'] : null;
        try {
            $this->audit->insert($actorId, 'service.updated', 'service', $id, $meta, $beforeSnap, $afterSnap);
        } catch (\Throwable $e) {
            error_log('[ServiceController] Audit log failed: ' . $e->getMessage());
        }
        $this->success($updated, 'Service updated');
    }

    // ── DELETE /api/admin/services/:id ───────────────────────────────────────

    /**
     * Delete a service engagement.
     */
    public function destroy(int $id): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        $otp = $this->readSuperadminOtpFromRequest();
        if ($otp === '' || !$this->verifySuperadminOtp($otp)) {
            $this->error('Valid superadmin OTP is required to delete a service engagement. Request a code first.', 403);
        }

        $beforeSnap = $this->serviceAuditSnapshot($service);
        $actorId    = $this->authUser() ? (int)$this->authUser()['id'] : null;
        $this->services->delete($id);
        try {
            $this->audit->insert($actorId, 'service.deleted', 'service', $id, [], $beforeSnap, null);
        } catch (\Throwable $e) {
            error_log('[ServiceController] Audit log failed: ' . $e->getMessage());
        }
        $this->sendServiceDeletedEmails($service, $this->authUser());
        $this->success(null, 'Service deleted');
    }

    // ── POST /api/admin/services/:id/tasks ───────────────────────────────────

    /**
     * Add a task to an existing service engagement.
     *
     * Body: { title, assignedToUserId?|assigned_to_user_id?, assignedTo?|assigned_to?, dueDate?, priority? }
     * When assignedToUserId > 0, it must be in this engagement’s service_assignees; display name is taken from users.
     * When assignedToUserId is absent/0, legacy string assignedTo|assigned_to is stored if present.
     */
    public function addTask(int $id): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        $beforeSnap = $this->serviceAuditSnapshot($service);
        $body       = $this->getJsonBody();
        $title = trim((string)($body['title'] ?? ''));

        if ($title === '') {
            $this->error('title is required.', 422);
        }

        $assigneeIds = $service['assignee_user_ids'] ?? [];
        if (!is_array($assigneeIds)) {
            $assigneeIds = [];
        }
        $assigneeIds = array_map('intval', $assigneeIds);

        $rawUid = $body['assignedToUserId'] ?? $body['assigned_to_user_id'] ?? null;
        $uid    = (is_numeric($rawUid) ? (int) $rawUid : 0);

        $legacyAssigned = $body['assignedTo'] ?? $body['assigned_to'] ?? null;
        $legacyAssigned = is_string($legacyAssigned) ? trim($legacyAssigned) : null;
        if ($legacyAssigned === '') {
            $legacyAssigned = null;
        }

        $assignedToUserId = null;
        $finalAssignedTo  = null;
        if ($uid > 0) {
            if (!in_array($uid, $assigneeIds, true)) {
                $this->error('assignedToUserId must be a user on this engagement’s team.', 422);
            }
            $u = $this->users->find($uid);
            if ($u === null) {
                $this->error('User not found.', 422);
            }
            $assignedToUserId = $uid;
            $finalAssignedTo  = isset($u['name']) && (string) $u['name'] !== ''
                ? (string) $u['name']
                : 'User #' . $uid;
        } else {
            $finalAssignedTo = $legacyAssigned;
        }

        // Decode existing tasks
        $tasks = [];
        if (!empty($service['tasks'])) {
            $decoded = json_decode((string) $service['tasks'], true);
            if (is_array($decoded)) {
                $tasks = $decoded;
            }
        }

        // Build new task
        $newTask = [
            'id'         => uniqid('task_', true),
            'title'      => $title,
            'assignedTo' => $finalAssignedTo,
            'dueDate'    => $body['dueDate'] ?? $body['due_date'] ?? null,
            'priority'   => $body['priority'] ?? 'medium',
            'status'     => 'pending',
        ];
        if ($assignedToUserId !== null) {
            $newTask['assignedToUserId'] = $assignedToUserId;
        }

        $tasks[] = $newTask;

        $this->services->update($id, ['tasks' => $tasks]);
        $this->services->promoteBillingOpenIfEligible($id);
        $updated   = $this->services->find($id);
        $afterSnap = $this->serviceAuditSnapshot($updated ?? []);
        $actorId   = $this->authUser() ? (int)$this->authUser()['id'] : null;
        try {
            $this->audit->insert(
                $actorId,
                'service.updated',
                'service',
                $id,
                ['task_added' => $newTask['title'] ?? ''],
                $beforeSnap,
                $afterSnap
            );
        } catch (\Throwable $e) {
            error_log('[ServiceController] Audit log failed: ' . $e->getMessage());
        }
        $this->success($updated, 'Task added');
    }

    /**
     * @param array<string, mixed> $service
     *
     * @return array<string, mixed>
     */
    private function serviceAuditSnapshot(array $service): array
    {
        return [
            'status'            => $service['status'] ?? null,
            'assigned_to'       => $service['assigned_to'] ?? null,
            'assignee_user_ids' => $service['assignee_user_ids'] ?? [],
            'due_date'          => $service['due_date'] ?? null,
            'fees'           => $service['fees'] ?? null,
            'notes'          => $service['notes'] ?? null,
            'service_type'   => $service['service_type'] ?? null,
            'financial_year' => $service['financial_year'] ?? null,
            'priority'       => $service['priority'] ?? null,
            'client_name'    => $service['client_name'] ?? null,
            'tasks'          => $this->normalizeTasksForAudit($service['tasks'] ?? []),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function normalizeTasksForAudit(mixed $raw): array
    {
        if (is_array($raw)) {
            return $raw;
        }
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);

            return is_array($decoded) ? $decoded : [];
        }

        return [];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function decodeTasksJson(mixed $raw): array
    {
        if ($raw === null || $raw === '') {
            return [];
        }
        if (is_array($raw)) {
            return $raw;
        }
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);

            return is_array($decoded) ? $decoded : [];
        }

        return [];
    }

    /**
     * True if any task id in $before is absent from $after (task removed).
     *
     * @param array<int, array<string, mixed>> $before
     * @param array<int, array<string, mixed>> $after
     */
    private function taskListHasRemoval(array $before, array $after): bool
    {
        $idsAfter = [];
        foreach ($after as $t) {
            if (is_array($t) && isset($t['id'])) {
                $idsAfter[(string)$t['id']] = true;
            }
        }
        foreach ($before as $t) {
            if (is_array($t) && isset($t['id'])) {
                $tid = (string)$t['id'];
                if (!isset($idsAfter[$tid])) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @param array<int, array<string, mixed>> $before
     * @param array<int, array<string, mixed>> $after
     *
     * @return array<string, mixed>
     */
    private function taskDiffMetadata(array $before, array $after): array
    {
        $idsBefore = [];
        foreach ($before as $t) {
            if (is_array($t) && isset($t['id'])) {
                $idsBefore[(string)$t['id']] = $t;
            }
        }
        $idsAfter = [];
        foreach ($after as $t) {
            if (is_array($t) && isset($t['id'])) {
                $idsAfter[(string)$t['id']] = $t;
            }
        }
        $removed = [];
        foreach ($idsBefore as $tid => $t) {
            if (!isset($idsAfter[$tid])) {
                $removed[] = [
                    'id'    => $tid,
                    'title' => (string)($t['title'] ?? ''),
                ];
            }
        }
        $meta = [];
        if ($removed !== []) {
            $meta['tasks_removed'] = $removed;
        }

        return $meta;
    }

    /**
     * @param array<string, mixed>      $service
     * @param array<string, mixed>|null $actingUser
     */
    private function sendServiceDeletedEmails(array $service, ?array $actingUser): void
    {
        $actorName  = (string)(($actingUser ?? [])['name'] ?? 'Unknown');
        $actorEmail = (string)(($actingUser ?? [])['email'] ?? 'Unknown');
        $timestamp  = date('d M Y, h:i A T');
        $serviceId  = (string)($service['id'] ?? '');
        $clientName = (string)($service['client_name'] ?? 'Unknown');
        $serviceType = (string)($service['service_type'] ?? '—');

        try {
            $htmlBody = BrevoMailer::renderTemplate('service-deleted-notify', [
                'serviceId'   => $serviceId,
                'clientName'  => $clientName,
                'serviceType' => $serviceType,
                'actorName'   => $actorName,
                'actorEmail'  => $actorEmail,
                'timestamp'   => $timestamp,
            ]);
            if ($htmlBody === '') {
                return;
            }
            $subject = 'Service engagement deleted - CA Rahul Gupta';

            $superEmail = (string)(getenv('SUPERADMIN_NOTIFY_EMAIL') ?: '');
            if ($superEmail === '') {
                $super = $this->users->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
                $superEmail = $super ? trim((string)($super['email'] ?? '')) : '';
            }
            if ($superEmail !== '') {
                BrevoMailer::send($superEmail, 'CA Rahul Gupta', $subject, $htmlBody);
            }

            $assigneeId = isset($service['assigned_to']) ? (int)$service['assigned_to'] : 0;
            if ($assigneeId > 0) {
                $assignee = $this->users->find($assigneeId);
                if ($assignee !== null && $assignee['is_active']) {
                    $aEmail = trim((string)($assignee['email'] ?? ''));
                    if ($aEmail !== '' && strtolower($aEmail) !== strtolower($superEmail)) {
                        BrevoMailer::send(
                            $aEmail,
                            (string)($assignee['name'] ?? $aEmail),
                            $subject,
                            $htmlBody
                        );
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('[ServiceController] Deletion notify email failed: ' . $e->getMessage());
        }
    }

    /**
     * Due date must be today or later on create. On update, a date before today is only allowed
     * when it matches the existing stored value (unchanged legacy engagements).
     *
     * @param mixed $incoming    Y-m-d, null, or empty
     * @param mixed $existingDue prior DB value (Y-m-d or datetime string)
     */
    private function assertServiceDueDateAllowed(mixed $incoming, mixed $existingDue = null): void
    {
        if ($incoming === null || $incoming === '') {
            return;
        }
        $s = trim((string)$incoming);
        if ($s === '') {
            return;
        }
        $d = \DateTimeImmutable::createFromFormat('Y-m-d', $s);
        if ($d === false || $d->format('Y-m-d') !== $s) {
            $this->error('due_date must be a valid calendar date (YYYY-MM-DD).', 422);
        }
        $today = new \DateTimeImmutable('today');
        if ($d >= $today) {
            return;
        }
        $exNorm = $this->normalizeServiceDueDateForCompare($existingDue !== null ? (string)$existingDue : null);
        if ($exNorm !== null && $exNorm === $s) {
            return;
        }
        $this->error('Due date cannot be in the past.', 422);
    }

    private function normalizeServiceDueDateForCompare(?string $v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        $t = trim($v);
        $d = \DateTimeImmutable::createFromFormat('Y-m-d', $t);
        if ($d !== false && $d->format('Y-m-d') === $t) {
            return $t;
        }
        $d2 = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $t);
        if ($d2 !== false) {
            return $d2->format('Y-m-d');
        }
        $parsed = date_create_immutable($t);

        return $parsed !== false ? $parsed->format('Y-m-d') : null;
    }

    private function normalizeCommissionMode(mixed $v): string
    {
        $m = (string)($v ?? 'referral_only');

        return in_array($m, ['referral_only', 'direct_interaction'], true) ? $m : 'referral_only';
    }

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
     * Block create/update when any assignee already has an open engagement for the same type and client.
     *
     * @param array<int> $assigneeUserIds
     */
    private function assertNoOpenEngagementDuplicateForAssignees(
        ?int $engagementTypeId,
        string $clientType,
        int $clientId,
        int $orgId,
        array $assigneeUserIds,
        ?int $excludeServiceId
    ): void {
        $etid = $engagementTypeId !== null ? (int)$engagementTypeId : 0;
        if ($etid <= 0) {
            return;
        }

        $seen = [];
        foreach ($assigneeUserIds as $uid) {
            $u = (int)$uid;
            if ($u <= 0 || isset($seen[$u])) {
                continue;
            }
            $seen[$u] = true;

            $conflict = $this->services->findOpenEngagementConflictForAssignee(
                $etid,
                $clientType,
                $clientId > 0 ? $clientId : null,
                $orgId > 0 ? $orgId : null,
                $u,
                $excludeServiceId
            );
            if ($conflict !== null) {
                $this->error(
                    'An open service engagement already exists for this engagement type, client, and assignee. Complete or cancel it before creating another.',
                    409,
                    [],
                    ['code' => 'engagement_open_duplicate', 'existing' => $conflict]
                );
            }
        }
    }

    /**
     * @return array<int>|null Null if the body did not include an assignee list field.
     */
    private function normalizeAssigneeUserIdsFromBody(array $body): ?array
    {
        if (array_key_exists('assignee_user_ids', $body)) {
            return $this->normalizeAssigneeUserIds($body['assignee_user_ids']);
        }
        if (array_key_exists('assigneeUserIds', $body)) {
            return $this->normalizeAssigneeUserIds($body['assigneeUserIds']);
        }

        return null;
    }

    /**
     * @param mixed $raw
     *
     * @return array<int>
     */
    private function normalizeAssigneeUserIds(mixed $raw): array
    {
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $v) {
            if (is_numeric($v)) {
                $n = (int)$v;
                if ($n > 0) {
                    $out[] = $n;
                }
            }
        }

        return array_values(array_unique($out, SORT_REGULAR));
    }
}
