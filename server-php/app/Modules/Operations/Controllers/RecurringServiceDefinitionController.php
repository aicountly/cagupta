<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\ClientModel;
use App\Models\EngagementTypeModel;
use App\Models\OrganizationModel;
use App\Models\RecurringServiceDefinitionModel;

/**
 * RecurringServiceDefinitionController
 *
 * GET    /api/admin/recurring-services           → index
 * POST   /api/admin/recurring-services           → store
 * GET    /api/admin/recurring-services/:id       → show
 * PUT    /api/admin/recurring-services/:id       → update
 * DELETE /api/admin/recurring-services/:id       → destroy
 * POST   /api/admin/recurring-services/:id/generate → generatePeriods
 */
class RecurringServiceDefinitionController extends BaseController
{
    private RecurringServiceDefinitionModel $rsd;
    private EngagementTypeModel $engagementTypes;

    public function __construct()
    {
        $this->rsd             = new RecurringServiceDefinitionModel();
        $this->engagementTypes = new EngagementTypeModel();
    }

    // ── GET /api/admin/recurring-services ─────────────────────────────────────

    public function index(): never
    {
        $page    = max(1, (int)$this->query('page', 1));
        $perPage = min(200, max(1, (int)$this->query('per_page', 50)));

        $rawIsActive = $this->query('is_active', null);
        $isActive    = $rawIsActive !== null ? filter_var($rawIsActive, FILTER_VALIDATE_BOOLEAN) : null;

        $filters = array_filter([
            'is_active'          => $isActive,
            'client_id'          => (int)$this->query('client_id', 0) ?: null,
            'organization_id'    => (int)$this->query('organization_id', 0) ?: null,
            'engagement_type_id' => (int)$this->query('engagement_type_id', 0) ?: null,
            'frequency'          => trim((string)$this->query('frequency', '')),
            'register_category'  => trim((string)$this->query('register_category', '')),
            'search'             => trim((string)$this->query('search', '')),
        ], fn($v) => $v !== null && $v !== '' && $v !== 0);

        $result = $this->rsd->paginate($filters, $page, $perPage);

        $this->success($result['rows'], 'Recurring service definitions retrieved', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => (int)ceil($result['total'] / max(1, $perPage)),
            ],
        ]);
    }

    // ── GET /api/admin/recurring-services/:id ─────────────────────────────────

    public function show(int $id): never
    {
        $def = $this->rsd->find($id);
        if ($def === null) {
            $this->error('Recurring service definition not found.', 404);
        }
        $this->success($def);
    }

    // ── POST /api/admin/recurring-services ────────────────────────────────────

    public function store(): never
    {
        $body  = $this->getJsonBody();
        $actor = $this->authUser();

        $etId = (int)($body['engagement_type_id'] ?? 0);
        if ($etId === 0) {
            $this->error('engagement_type_id is required.', 422);
        }
        if ($this->engagementTypes->find($etId) === null) {
            $this->error('Engagement type not found.', 422);
        }
        if (empty($body['start_date'])) {
            $this->error('start_date is required.', 422);
        }
        if (!in_array($body['frequency'] ?? '', ['monthly', 'quarterly', 'half_yearly', 'annual'], true)) {
            $this->error('frequency must be one of: monthly, quarterly, half_yearly, annual.', 422);
        }

        $clientId = array_key_exists('client_id', $body)
            ? self::normalizeForeignKey($body['client_id'])
            : null;
        $orgId = array_key_exists('organization_id', $body)
            ? self::normalizeForeignKey($body['organization_id'])
            : null;

        if (($clientId === null && $orgId === null) || ($clientId !== null && $orgId !== null)) {
            $this->error('Exactly one of client_id or organization_id must be provided.', 422);
        }

        if ($clientId !== null && (new ClientModel())->find($clientId) === null) {
            $this->error('Client not found.', 422);
        }
        if ($orgId !== null && (new OrganizationModel())->find($orgId) === null) {
            $this->error('Organization not found.', 422);
        }

        $createdBy = $actor ? (int)($actor['id'] ?? 0) : null;
        if ($createdBy !== null && $createdBy <= 0) {
            $createdBy = null;
        }

        try {
            $id = $this->rsd->create([
                'client_id'           => $clientId,
                'organization_id'     => $orgId,
                'engagement_type_id'  => $etId,
                'frequency'           => $body['frequency'],
                'due_day'             => isset($body['due_day']) ? (int)$body['due_day'] : 20,
                'due_offset_months'   => isset($body['due_offset_months']) ? (int)$body['due_offset_months'] : 0,
                'return_type'         => $body['return_type'] ?? '',
                'start_date'          => $body['start_date'],
                'end_date'            => $body['end_date'] ?? null,
                'is_active'           => isset($body['is_active']) ? (bool)$body['is_active'] : true,
                'notes'               => $body['notes'] ?? null,
                'created_by'          => $createdBy,
            ]);
        } catch (\PDOException $e) {
            error_log('[RecurringServiceDefinitionController] create failed: ' . $e->getMessage());
            $msg   = $e->getMessage();
            $ei    = $e->errorInfo ?? null;
            $state = is_array($ei) ? (string)($ei[0] ?? '') : '';
            if (str_contains($msg, 'foreign key') || str_contains($msg, '23503') || $state === '23503') {
                $this->error(
                    'Could not create recurring service. Check that the client or organization and engagement type exist, and that database migrations are up to date.',
                    422
                );
            }
            if (str_contains($msg, 'does not exist') || $state === '42P01') {
                $this->error(
                    'Recurring services are not set up on the server yet. Run database migration 044_registers_recurring.sql.',
                    500
                );
            }
            $this->error('Could not create recurring service definition.', 500);
        }

        $def = $this->rsd->find($id);
        if ($def === null) {
            $this->error('Recurring service definition was created but could not be loaded.', 500);
        }
        $this->success($def, 'Recurring service definition created', 201);
    }

    // ── PUT /api/admin/recurring-services/:id ─────────────────────────────────

    public function update(int $id): never
    {
        $def = $this->rsd->find($id);
        if ($def === null) {
            $this->error('Recurring service definition not found.', 404);
        }

        $body = $this->getJsonBody();

        $data = [];

        $allowedScalar = [
            'frequency', 'due_day', 'due_offset_months', 'return_type',
            'start_date', 'end_date', 'is_active', 'notes',
        ];
        foreach ($allowedScalar as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        if (isset($data['frequency']) && !in_array($data['frequency'], ['monthly', 'quarterly', 'half_yearly', 'annual'], true)) {
            $this->error('frequency must be one of: monthly, quarterly, half_yearly, annual.', 422);
        }

        if (array_key_exists('engagement_type_id', $body)) {
            $etId = (int)($body['engagement_type_id'] ?? 0);
            if ($etId <= 0) {
                $this->error('engagement_type_id must be positive.', 422);
            }
            if ($this->engagementTypes->find($etId) === null) {
                $this->error('Engagement type not found.', 422);
            }
            $data['engagement_type_id'] = $etId;
        }

        if (array_key_exists('client_id', $body) || array_key_exists('organization_id', $body)) {
            $clientId = array_key_exists('client_id', $body)
                ? self::normalizeForeignKey($body['client_id'] ?? null)
                : self::normalizeForeignKey($def['client_id'] ?? null);
            $orgId = array_key_exists('organization_id', $body)
                ? self::normalizeForeignKey($body['organization_id'] ?? null)
                : self::normalizeForeignKey($def['organization_id'] ?? null);

            if (($clientId === null && $orgId === null) || ($clientId !== null && $orgId !== null)) {
                $this->error('Exactly one of client_id or organization_id must be provided.', 422);
            }

            $data['client_id']       = $clientId;
            $data['organization_id'] = $orgId;
        }

        if ($data !== []) {
            $this->rsd->update($id, $data);
        }

        $updated = $this->rsd->find($id);
        $this->success($updated, 'Recurring service definition updated');
    }

    // ── DELETE /api/admin/recurring-services/:id ──────────────────────────────

    public function destroy(int $id): never
    {
        $def = $this->rsd->find($id);
        if ($def === null) {
            $this->error('Recurring service definition not found.', 404);
        }
        $this->rsd->delete($id);
        $this->success(null, 'Recurring service definition deleted');
    }

    // ── POST /api/admin/recurring-services/:id/generate ───────────────────────

    /**
     * Generate (bulk-insert) pending register rows for all periods up to
     * the given up_to_date (default: one year from today).
     *
     * Body (optional): { up_to_date: "YYYY-MM-DD" }
     */
    public function generatePeriods(int $id): never
    {
        $def = $this->rsd->find($id);
        if ($def === null) {
            $this->error('Recurring service definition not found.', 404);
        }

        $body     = $this->getJsonBody();
        $upToDate = trim((string)($body['up_to_date'] ?? ''));
        if ($upToDate === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $upToDate)) {
            // Default: generate 1 full year ahead from today
            $upToDate = (new \DateTimeImmutable('today'))->modify('+1 year')->format('Y-m-d');
        }

        $inserted = $this->rsd->generatePeriods($id, $upToDate);

        $this->success([
            'inserted'   => $inserted,
            'up_to_date' => $upToDate,
        ], "{$inserted} register period(s) created.");
    }

    /**
     * Normalize optional FK ids from JSON (null, "", 0 → null; positive int kept).
     */
    private static function normalizeForeignKey(mixed $val): ?int
    {
        if ($val === null || $val === '') {
            return null;
        }

        return (int)$val > 0 ? (int)$val : null;
    }
}
