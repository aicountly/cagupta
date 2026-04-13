<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\ServiceModel;

/**
 * ServiceController — CRUD for the `services` table (service engagements).
 *
 * All endpoints require Bearer token + role: super_admin or admin.
 */
class ServiceController extends BaseController
{
    private ServiceModel $services;

    public function __construct()
    {
        $this->services = new ServiceModel();
    }

    // ── GET /api/admin/services ──────────────────────────────────────────────

    /**
     * Return a paginated list of service engagements.
     *
     * Query params: page, per_page, search, status
     */
    public function index(): never
    {
        $page    = max(1, (int)$this->query('page', 1));
        $perPage = min(100, max(1, (int)$this->query('per_page', 20)));
        $search  = trim((string)$this->query('search', ''));
        $status  = trim((string)$this->query('status', ''));

        $result = $this->services->paginate($page, $perPage, $search, $status);

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

        // #region agent log
        file_put_contents(
            dirname(__DIR__, 4) . DIRECTORY_SEPARATOR . 'debug-634b1d.log',
            json_encode([
                'sessionId'    => '634b1d',
                'hypothesisId' => 'B',
                'location'     => 'ServiceController.php:store:beforeCreate',
                'message'      => 'incoming org/contact fields',
                'data'         => [
                    'client_type'       => $body['client_type']       ?? null,
                    'client_id'         => $body['client_id']         ?? null,
                    'organization_id'   => $body['organization_id']   ?? null,
                    'client_name_body'  => $body['client_name']       ?? null,
                ],
                'timestamp'    => (int) round(microtime(true) * 1000),
            ], JSON_UNESCAPED_UNICODE) . "\n",
            FILE_APPEND | LOCK_EX
        );
        // #endregion

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
        ]);

        $service = $this->services->find($newId);

        // #region agent log
        file_put_contents(
            dirname(__DIR__, 4) . DIRECTORY_SEPARATOR . 'debug-634b1d.log',
            json_encode([
                'sessionId'    => '634b1d',
                'hypothesisId' => 'A',
                'location'     => 'ServiceController.php:store:afterFind',
                'message'      => 'find() row client_name vs ids',
                'data'         => [
                    'client_type'     => $service['client_type']     ?? null,
                    'client_id'       => $service['client_id']       ?? null,
                    'organization_id' => $service['organization_id'] ?? null,
                    'client_name'     => $service['client_name']     ?? null,
                ],
                'timestamp'    => (int) round(microtime(true) * 1000),
            ], JSON_UNESCAPED_UNICODE) . "\n",
            FILE_APPEND | LOCK_EX
        );
        // #endregion

        $this->success($service, 'Service engagement created', 201);
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

        $body = $this->getJsonBody();
        $data = [];

        $allowed = ['status', 'assigned_to', 'due_date', 'fees', 'notes', 'priority', 'service_type', 'financial_year'];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        if (array_key_exists('tasks', $body)) {
            $data['tasks'] = $body['tasks'];
        }

        $this->services->update($id, $data);
        $updated = $this->services->find($id);
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

        $this->services->delete($id);
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

        $body  = $this->getJsonBody();
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
        $updated = $this->services->find($id);
        $this->success($updated, 'Task added');
    }
}
