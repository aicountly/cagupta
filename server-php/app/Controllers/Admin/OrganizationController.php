<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\OrganizationModel;
use App\Libraries\BrevoMailer;

/**
 * OrganizationController — CRUD for the `organizations` table.
 *
 * Sends an alert email to the Superadmin on every create, update,
 * or status-change operation (best-effort; failures do not block the response).
 *
 * All endpoints require Bearer token + role: super_admin or admin
 * (enforced by RoleFilter in Routes.php).
 */
class OrganizationController extends BaseController
{
    private OrganizationModel $orgs;

    public function __construct()
    {
        $this->orgs = new OrganizationModel();
    }

    // ── GET /api/admin/organizations/search ──────────────────────────────────

    /**
     * Fast type-ahead search for organizations.
     *
     * Query params: q, limit
     */
    public function search(): never
    {
        $q     = trim((string)$this->query('q', ''));
        $limit = min(50, max(1, (int)$this->query('limit', 20)));

        if ($q === '') {
            $this->success([], 'No query provided');
        }

        $results = $this->orgs->search($q, $limit);
        $this->success($results, 'Organizations found');
    }

    // ── GET /api/admin/organizations ─────────────────────────────────────────

    /**
     * Return a paginated list of organizations.
     *
     * Query params: page, per_page, search, status
     */
    public function index(): never
    {
        $page    = max(1, (int)$this->query('page', 1));
        $perPage = min(100, max(1, (int)$this->query('per_page', 20)));
        $search  = trim((string)$this->query('search', ''));
        $status  = trim((string)$this->query('status', ''));

        $result = $this->orgs->paginate($page, $perPage, $search, $status);

        $this->success($result['organizations'], 'Organizations retrieved', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => (int)ceil($result['total'] / $perPage),
            ],
        ]);
    }

    // ── POST /api/admin/organizations ────────────────────────────────────────

    /**
     * Create a new organization.
     *
     * Body: { name, type?, gstin?, pan?, email?, phone?,
     *         address?, city?, state?, pincode?, website?, notes?, is_active? }
     */
    public function store(): never
    {
        $body = $this->getJsonBody();
        $name = trim((string)($body['name'] ?? ''));

        if ($name === '') {
            $this->error('Organization name is required.', 422);
        }

        $actingUser = $this->authUser();

        $newId = $this->orgs->create([
            'name'               => $name,
            'type'               => $body['type']    ?? null,
            'gstin'              => strtoupper(trim((string)($body['gstin'] ?? ''))) ?: null,
            'pan'                => strtoupper(trim((string)($body['pan']   ?? ''))) ?: null,
            'email'              => trim((string)($body['email']   ?? '')) ?: null,
            'phone'              => trim((string)($body['phone']   ?? '')) ?: null,
            'address'            => $body['address']  ?? null,
            'city'               => $body['city']     ?? null,
            'state'              => $body['state']    ?? null,
            'pincode'            => $body['pincode']  ?? null,
            'website'            => $body['website']  ?? null,
            'notes'              => $body['notes']    ?? null,
            'reference'          => $body['reference'] ?? null,
            'group_id'           => $body['group_id']  ?? null,
            'primary_contact_id' => $body['primary_contact_id'] ?? null,
            'is_active'          => $body['is_active'] ?? true,
            'created_by'         => $actingUser ? (int)$actingUser['id'] : null,
        ]);

        $org = $this->orgs->find($newId);

        // ── Superadmin alert (best-effort) ────────────────────────────────────
        $this->sendSuperadminAlert('Created', $org, $actingUser);

        $this->success($org, 'Organization created', 201);
    }

    // ── GET /api/admin/organizations/:id ─────────────────────────────────────

    /**
     * Return a single organization.
     */
    public function show(int $id): never
    {
        $org = $this->orgs->find($id);
        if ($org === null) {
            $this->error('Organization not found.', 404);
        }
        $this->success($org);
    }

    // ── PUT /api/admin/organizations/:id ─────────────────────────────────────

    /**
     * Update an organization.
     *
     * Body: any subset of the organization fields.
     */
    public function update(int $id): never
    {
        $org = $this->orgs->find($id);
        if ($org === null) {
            $this->error('Organization not found.', 404);
        }

        $body = $this->getJsonBody();
        $data = [];

        $textFields = [
            'name', 'type', 'gstin', 'pan', 'email', 'phone',
            'address', 'city', 'state', 'pincode', 'website', 'notes', 'reference',
        ];
        foreach ($textFields as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        if (isset($body['is_active'])) {
            $data['is_active'] = (bool)$body['is_active'];
        }
        if (array_key_exists('group_id', $body)) {
            $data['group_id'] = $body['group_id'];
        }
        if (array_key_exists('primary_contact_id', $body)) {
            $data['primary_contact_id'] = $body['primary_contact_id'] ? (int)$body['primary_contact_id'] : null;
        }

        $this->orgs->update($id, $data);
        $updated    = $this->orgs->find($id);
        $actingUser = $this->authUser();

        // ── Superadmin alert (best-effort) ────────────────────────────────────
        $this->sendSuperadminAlert('Updated', $updated, $actingUser);

        $this->success($updated, 'Organization updated');
    }

    // ── PATCH /api/admin/organizations/:id/status ────────────────────────────

    /**
     * Toggle an organization's active/inactive status.
     *
     * Body: { is_active: bool }
     */
    public function updateStatus(int $id): never
    {
        $org = $this->orgs->find($id);
        if ($org === null) {
            $this->error('Organization not found.', 404);
        }

        $body     = $this->getJsonBody();
        $isActive = isset($body['is_active']) ? (bool)$body['is_active'] : !(bool)$org['is_active'];

        $this->orgs->updateStatus($id, $isActive);
        $updated    = $this->orgs->find($id);
        $actingUser = $this->authUser();

        // ── Superadmin alert (best-effort) ────────────────────────────────────
        $statusLabel = $isActive ? 'Activated' : 'Deactivated';
        $this->sendSuperadminAlert("Status Changed ({$statusLabel})", $updated, $actingUser);

        $this->success($updated, 'Organization status updated');
    }

    // ── DELETE /api/admin/organizations/:id ──────────────────────────────────

    /**
     * Permanently delete an organization.
     */
    public function destroy(int $id): never
    {
        $org = $this->orgs->find($id);
        if ($org === null) {
            $this->error('Organization not found.', 404);
        }

        $this->orgs->delete($id);
        $this->success(null, 'Organization deleted');
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Send an alert email to the Superadmin (fire-and-forget).
     *
     * @param string                     $action     Human-readable action label.
     * @param array<string, mixed>|null  $org        The affected organization row.
     * @param array<string, mixed>|null  $actingUser The user who performed the action.
     */
    private function sendSuperadminAlert(string $action, ?array $org, ?array $actingUser): void
    {
        try {
            $superadminEmail = (string)(getenv('SUPERADMIN_NOTIFY_EMAIL') ?: 'office@carahulgupta.in');
            $orgName         = $org['name'] ?? 'Unknown';
            $actorName       = $actingUser['name']  ?? 'Unknown';
            $actorEmail      = $actingUser['email'] ?? 'Unknown';
            $timestamp       = date('d M Y, h:i A T');
            $status          = $org ? (((bool)$org['is_active']) ? 'Active' : 'Inactive') : 'Unknown';

            $htmlBody = BrevoMailer::renderTemplate('organization-activity', [
                'action'    => $action,
                'orgName'   => $orgName,
                'actorName' => $actorName,
                'actorEmail' => $actorEmail,
                'timestamp' => $timestamp,
                'status'    => $status,
            ]);

            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $superadminEmail,
                    'CA Rahul Gupta',
                    "Organization {$action} Alert - CA Rahul Gupta",
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[OrganizationController] Superadmin alert failed: ' . $e->getMessage());
        }
    }
}
