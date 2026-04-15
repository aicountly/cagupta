<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Auth as AuthConfig;
use App\Controllers\BaseController;
use App\Libraries\BrevoMailer;
use App\Models\AdminAuditLogModel;
use App\Models\ServiceModel;
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

    public function __construct()
    {
        $this->services = new ServiceModel();
        $this->audit    = new AdminAuditLogModel();
        $this->users    = new UserModel();
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

        $refAff = isset($body['referring_affiliate_user_id']) ? (int)$body['referring_affiliate_user_id'] : 0;

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
            'referring_affiliate_user_id' => $refAff > 0 ? $refAff : null,
            'referral_start_date'  => !empty($body['referral_start_date']) ? $body['referral_start_date'] : null,
            'commission_mode'      => $body['commission_mode'] ?? 'referral_only',
            'client_facing_restricted' => !empty($body['client_facing_restricted']),
        ]);

        $this->services->promoteBillingOpenIfEligible($newId);
        $service = $this->services->find($newId);
        $this->success($service, 'Service engagement created', 201);
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

        $this->success($updated, 'Billing closure updated');
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
            'referral_start_date', 'commission_mode', 'client_facing_restricted',
        ];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        if (array_key_exists('referring_affiliate_user_id', $body)) {
            $ra = (int)$body['referring_affiliate_user_id'];
            $data['referring_affiliate_user_id'] = $ra > 0 ? $ra : null;
        }
        if (array_key_exists('tasks', $body)) {
            $data['tasks'] = $body['tasks'];
        }

        $this->services->update($id, $data);
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
     * Body: { title, assignedTo?, dueDate?, priority? }
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

        // Decode existing tasks
        $tasks = [];
        if (!empty($service['tasks'])) {
            $decoded = json_decode((string)$service['tasks'], true);
            if (is_array($decoded)) {
                $tasks = $decoded;
            }
        }

        // Build new task
        $newTask = [
            'id'         => uniqid('task_', true),
            'title'      => $title,
            'assignedTo' => $body['assignedTo'] ?? $body['assigned_to'] ?? null,
            'dueDate'    => $body['dueDate']    ?? $body['due_date']    ?? null,
            'priority'   => $body['priority']   ?? 'medium',
            'status'     => 'pending',
        ];

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
            'status'         => $service['status'] ?? null,
            'assigned_to'    => $service['assigned_to'] ?? null,
            'due_date'       => $service['due_date'] ?? null,
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
}
