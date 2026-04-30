<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\RegisterModel;

/**
 * RegisterController — CRUD for the `registers` compliance table.
 *
 * GET    /api/admin/registers           → index  (paginated list with filters)
 * GET    /api/admin/registers/counts    → counts (status counts per category)
 * POST   /api/admin/registers           → store  (manual entry)
 * GET    /api/admin/registers/:id       → show
 * PUT    /api/admin/registers/:id       → update (ack number, error, filed_date …)
 * DELETE /api/admin/registers/:id       → destroy
 */
class RegisterController extends BaseController
{
    private RegisterModel $registers;

    public function __construct()
    {
        $this->registers = new RegisterModel();
    }

    // ── GET /api/admin/registers ──────────────────────────────────────────────

    public function index(): never
    {
        $page    = max(1, (int)$this->query('page', 1));
        $perPage = min(200, max(1, (int)$this->query('per_page', 50)));

        $filters = [
            'register_category'  => trim((string)$this->query('register_category', '')),
            'status'             => trim((string)$this->query('status', '')),
            'client_id'          => (int)$this->query('client_id', 0)  ?: null,
            'organization_id'    => (int)$this->query('organization_id', 0) ?: null,
            'engagement_type_id' => (int)$this->query('engagement_type_id', 0) ?: null,
            'period_label'       => trim((string)$this->query('period_label', '')),
            'date_from'          => trim((string)$this->query('date_from', '')),
            'date_to'            => trim((string)$this->query('date_to', '')),
            'search'             => trim((string)$this->query('search', '')),
        ];
        // Remove empty-string / null filters
        $filters = array_filter($filters, fn($v) => $v !== null && $v !== '' && $v !== 0);

        $result = $this->registers->paginate($filters, $page, $perPage);

        $this->success($result['rows'], 'Registers retrieved', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => (int)ceil($result['total'] / max(1, $perPage)),
            ],
        ]);
    }

    // ── GET /api/admin/registers/counts ───────────────────────────────────────

    public function counts(): never
    {
        $counts = $this->registers->countsByCategory();
        $this->success($counts, 'Register counts retrieved');
    }

    // ── GET /api/admin/registers/:id ─────────────────────────────────────────

    public function show(int $id): never
    {
        $row = $this->registers->find($id);
        if ($row === null) {
            $this->error('Register entry not found.', 404);
        }
        $this->success($row);
    }

    // ── POST /api/admin/registers ─────────────────────────────────────────────

    public function store(): never
    {
        $body = $this->getJsonBody();
        $actor = $this->authUser();

        if (empty($body['register_category'])) {
            $this->error('register_category is required.', 422);
        }
        if (empty($body['client_id']) && empty($body['organization_id'])) {
            $this->error('Either client_id or organization_id is required.', 422);
        }

        $data = [
            'register_type'          => $body['register_category'] ?? 'general',
            'client_id'              => isset($body['client_id'])       ? (int)$body['client_id']       : null,
            'organization_id'        => isset($body['organization_id']) ? (int)$body['organization_id'] : null,
            'engagement_type_id'     => isset($body['engagement_type_id']) ? (int)$body['engagement_type_id'] : null,
            'register_category'      => $body['register_category'] ?? null,
            'return_type'            => $body['return_type']            ?? null,
            'period_label'           => $body['period_label']           ?? null,
            'period_start'           => $body['period_start']           ?? null,
            'period_end'             => $body['period_end']             ?? null,
            'due_date'               => $body['due_date']               ?? null,
            'filed_date'             => $body['filed_date']             ?? null,
            'status'                 => $body['status']                 ?? 'pending',
            'acknowledgment_number'  => $body['acknowledgment_number']  ?? null,
            'error_number'           => $body['error_number']           ?? null,
            'late_fee'               => isset($body['late_fee'])        ? (float)$body['late_fee'] : null,
            'notes'                  => $body['notes']                  ?? null,
            'reference_number'       => $body['reference_number']       ?? null,
            'recurring_definition_id'=> isset($body['recurring_definition_id']) ? (int)$body['recurring_definition_id'] : null,
            'created_by'             => $actor ? (int)$actor['id'] : null,
        ];

        $id  = $this->registers->create($data);
        $row = $this->registers->find($id);
        $this->success($row, 'Register entry created', 201);
    }

    // ── PUT /api/admin/registers/:id ─────────────────────────────────────────

    public function update(int $id): never
    {
        $row = $this->registers->find($id);
        if ($row === null) {
            $this->error('Register entry not found.', 404);
        }

        $body = $this->getJsonBody();
        $data = [];

        $allowed = [
            'status', 'filed_date', 'filed_by', 'acknowledgment_number',
            'error_number', 'late_fee', 'notes', 'service_id',
            'reference_number', 'due_date', 'period_label',
        ];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field] === '' ? null : $body[$field];
            }
        }
        if (isset($data['filed_by'])) {
            $data['filed_by'] = $data['filed_by'] !== null ? (int)$data['filed_by'] : null;
        }
        if (isset($data['late_fee'])) {
            $data['late_fee'] = $data['late_fee'] !== null ? (float)$data['late_fee'] : null;
        }

        if ($data !== []) {
            $this->registers->update($id, $data);
        }

        $updated = $this->registers->find($id);
        $this->success($updated, 'Register entry updated');
    }

    // ── DELETE /api/admin/registers/:id ──────────────────────────────────────

    public function destroy(int $id): never
    {
        $row = $this->registers->find($id);
        if ($row === null) {
            $this->error('Register entry not found.', 404);
        }
        $this->registers->delete($id);
        $this->success(null, 'Register entry deleted');
    }
}
