<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\RecoveryLogModel;

/**
 * RecoveryLogController — CRUD for receivable follow-up logs.
 *
 * All endpoints require Bearer token + permission:invoices.view / invoices.edit.
 *
 * GET  /api/admin/recovery-logs?entity_type=client&entity_id=1
 * POST /api/admin/recovery-logs
 * PUT  /api/admin/recovery-logs/:id
 */
class RecoveryLogController extends BaseController
{
    private RecoveryLogModel $model;

    public function __construct()
    {
        $this->model = new RecoveryLogModel();
    }

    // ── GET /api/admin/recovery-logs ─────────────────────────────────────────

    /**
     * Return all logs for an entity, newest-first.
     *
     * Query params: entity_type (client|organization), entity_id (int)
     */
    public function index(): never
    {
        $entityType = trim((string)$this->query('entity_type', ''));
        $entityId   = (int)$this->query('entity_id', 0);

        if (!in_array($entityType, ['client', 'organization'], true)) {
            $this->error('entity_type must be client or organization.', 422);
        }
        if ($entityId <= 0) {
            $this->error('entity_id is required.', 422);
        }

        $rows = $this->model->listByEntity($entityType, $entityId);
        $this->success($rows, 'Recovery logs retrieved');
    }

    // ── POST /api/admin/recovery-logs ────────────────────────────────────────

    /**
     * Create a new recovery log entry.
     *
     * Body (JSON):
     *   entity_type           string  client|organization  required
     *   entity_id             int                          required
     *   log_date              string  YYYY-MM-DD           optional (default today)
     *   followup_details      string                       optional
     *   client_response       string                       optional
     *   next_followup_date    string  YYYY-MM-DD           optional
     *   next_followup_details string                       optional
     *   revised_due_date      string  YYYY-MM-DD           optional
     */
    public function store(): never
    {
        $body       = $this->getJsonBody();
        $entityType = trim((string)($body['entity_type'] ?? ''));
        $entityId   = (int)($body['entity_id'] ?? 0);

        $errors = [];
        if (!in_array($entityType, ['client', 'organization'], true)) {
            $errors['entity_type'][] = 'entity_type must be client or organization.';
        }
        if ($entityId <= 0) {
            $errors['entity_id'][] = 'entity_id is required.';
        }

        if (!empty($errors)) {
            $this->error('Validation failed.', 422, $errors);
        }

        $authUser = $this->authUser();

        $row = $this->model->create([
            'entity_type'           => $entityType,
            'entity_id'             => $entityId,
            'log_date'              => $body['log_date'] ?? date('Y-m-d'),
            'followup_details'      => $body['followup_details'] ?? null,
            'client_response'       => $body['client_response'] ?? null,
            'next_followup_date'    => $body['next_followup_date'] ?? null,
            'next_followup_details' => $body['next_followup_details'] ?? null,
            'revised_due_date'      => $body['revised_due_date'] ?? null,
            'created_by'            => $authUser ? (int)$authUser['id'] : null,
        ]);

        $this->success($row, 'Recovery log created', 201);
    }

    // ── PUT /api/admin/recovery-logs/:id ─────────────────────────────────────

    /**
     * Update an existing recovery log entry.
     *
     * Path param: :id
     * Body (JSON): any subset of the writable fields (same as store, minus entity_type/entity_id)
     */
    public function update(int $id): never
    {
        if ($id <= 0) {
            $this->error('id is required.', 422);
        }

        $body = $this->getJsonBody();
        $row  = $this->model->update($id, $body);

        if ($row === null) {
            $this->error('Recovery log not found or no fields to update.', 404);
        }

        $this->success($row, 'Recovery log updated');
    }
}
