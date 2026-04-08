<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\ClientModel;
use App\Libraries\BrevoMailer;

/**
 * ContactController — CRUD for the `clients` table.
 *
 * Sends an alert email to the Superadmin on every create, update,
 * or status-change operation (best-effort; failures do not block the response).
 *
 * All endpoints require Bearer token + role: super_admin or admin
 * (enforced by RoleFilter in Routes.php).
 */
class ContactController extends BaseController
{
    private ClientModel $clients;

    public function __construct()
    {
        $this->clients = new ClientModel();
    }

    // ── GET /api/admin/contacts/search ──────────────────────────────────────

    /**
     * Fast type-ahead search for clients.
     *
     * Query params:
     *   q      — search term (partial match on name, email, PAN)
     *   limit  — max results (default 20, max 50)
     */
    public function search(): never
    {
        $q     = trim((string)$this->query('q', ''));
        $limit = min(50, max(1, (int)$this->query('limit', 20)));

        if ($q === '') {
            $this->success([], 'No query provided');
        }

        $results = $this->clients->search($q, $limit);
        $this->success($results, 'Clients found');
    }

    // ── GET /api/admin/contacts ──────────────────────────────────────────────

    /**
     * Return a paginated list of contacts (clients).
     *
     * Query params: page, per_page, search, status
     */
    public function index(): never
    {
        $page    = max(1, (int)$this->query('page', 1));
        $perPage = min(100, max(1, (int)$this->query('per_page', 20)));
        $search  = trim((string)$this->query('search', ''));
        $status  = trim((string)$this->query('status', ''));

        $result = $this->clients->paginate($page, $perPage, $search, $status);

        $this->success($result['clients'], 'Contacts retrieved', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => (int)ceil($result['total'] / $perPage),
            ],
        ]);
    }

    // ── POST /api/admin/contacts ─────────────────────────────────────────────

    /**
     * Create a new contact.
     *
     * Body: { type?, first_name?, last_name?, organization_name?,
     *         email?, phone?, pan?, gstin?, address_line1?, address_line2?,
     *         city?, state?, pincode?, country?, notes?, is_active? }
     */
    public function store(): never
    {
        $body = $this->getJsonBody();

        // At least a name is required
        $firstName        = trim((string)($body['first_name']        ?? ''));
        $lastName         = trim((string)($body['last_name']         ?? ''));
        $organizationName = trim((string)($body['organization_name'] ?? ''));

        if ($firstName === '' && $lastName === '' && $organizationName === '') {
            $this->error('At least one of first_name, last_name, or organization_name is required.', 422);
        }

        $actingUser = $this->authUser();

        $newId = $this->clients->create([
            'type'              => $body['type']              ?? 'individual',
            'first_name'        => $firstName  ?: null,
            'last_name'         => $lastName   ?: null,
            'organization_name' => $organizationName ?: null,
            'email'             => trim((string)($body['email']         ?? '')) ?: null,
            'phone'             => trim((string)($body['phone']         ?? '')) ?: null,
            'pan'               => strtoupper(trim((string)($body['pan'] ?? ''))) ?: null,
            'gstin'             => strtoupper(trim((string)($body['gstin'] ?? ''))) ?: null,
            'address_line1'     => $body['address_line1'] ?? null,
            'address_line2'     => $body['address_line2'] ?? null,
            'city'              => $body['city']     ?? null,
            'state'             => $body['state']    ?? null,
            'pincode'           => $body['pincode']  ?? null,
            'country'           => $body['country']  ?? 'India',
            'notes'             => $body['notes']    ?? null,
            'reference'         => $body['reference'] ?? null,
            'group_id'          => $body['group_id']  ?? null,
            'is_active'         => $body['is_active'] ?? true,
            'created_by'        => $actingUser ? (int)$actingUser['id'] : null,
        ]);

        // Sync linked organizations if provided
        if (isset($body['linked_org_ids']) && is_array($body['linked_org_ids'])) {
            $this->clients->syncLinkedOrgs($newId, $body['linked_org_ids']);
        }

        $contact = $this->clients->find($newId);

        // ── Superadmin alert (best-effort) ────────────────────────────────────
        $this->sendSuperadminAlert('Created', $contact, $actingUser);

        $this->success($contact, 'Contact created', 201);
    }

    // ── GET /api/admin/contacts/:id ──────────────────────────────────────────

    /**
     * Return a single contact.
     */
    public function show(int $id): never
    {
        $contact = $this->clients->find($id);
        if ($contact === null) {
            $this->error('Contact not found.', 404);
        }
        $this->success($contact);
    }

    // ── PUT /api/admin/contacts/:id ──────────────────────────────────────────

    /**
     * Update a contact.
     *
     * Body: any subset of the contact fields.
     */
    public function update(int $id): never
    {
        $contact = $this->clients->find($id);
        if ($contact === null) {
            $this->error('Contact not found.', 404);
        }

        $body = $this->getJsonBody();
        $data = [];

        $textFields = [
            'type', 'first_name', 'last_name', 'organization_name',
            'email', 'phone', 'pan', 'gstin',
            'address_line1', 'address_line2', 'city', 'state', 'pincode', 'country',
            'notes', 'reference',
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

        $this->clients->update($id, $data);

        // Sync linked organizations if provided
        if (isset($body['linked_org_ids']) && is_array($body['linked_org_ids'])) {
            $this->clients->syncLinkedOrgs($id, $body['linked_org_ids']);
        }

        $updated    = $this->clients->find($id);
        $actingUser = $this->authUser();

        // ── Superadmin alert (best-effort) ────────────────────────────────────
        $this->sendSuperadminAlert('Updated', $updated, $actingUser);

        $this->success($updated, 'Contact updated');
    }

    // ── PATCH /api/admin/contacts/:id/status ────────────────────────────────

    /**
     * Toggle a contact's active/inactive status.
     *
     * Body: { is_active: bool }
     */
    public function updateStatus(int $id): never
    {
        $contact = $this->clients->find($id);
        if ($contact === null) {
            $this->error('Contact not found.', 404);
        }

        $body     = $this->getJsonBody();
        $isActive = isset($body['is_active']) ? (bool)$body['is_active'] : !(bool)$contact['is_active'];

        $this->clients->updateStatus($id, $isActive);
        $updated    = $this->clients->find($id);
        $actingUser = $this->authUser();

        // ── Superadmin alert (best-effort) ────────────────────────────────────
        $statusLabel = $isActive ? 'Activated' : 'Deactivated';
        $this->sendSuperadminAlert("Status Changed ({$statusLabel})", $updated, $actingUser);

        $this->success($updated, 'Contact status updated');
    }

    // ── DELETE /api/admin/contacts/:id ───────────────────────────────────────

    /**
     * Permanently delete a contact.
     */
    public function destroy(int $id): never
    {
        $contact = $this->clients->find($id);
        if ($contact === null) {
            $this->error('Contact not found.', 404);
        }

        $this->clients->delete($id);
        $this->success(null, 'Contact deleted');
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Send an alert email to the Superadmin (fire-and-forget).
     *
     * @param string                     $action     Human-readable action label.
     * @param array<string, mixed>|null  $contact    The affected contact row.
     * @param array<string, mixed>|null  $actingUser The user who performed the action.
     */
    private function sendSuperadminAlert(string $action, ?array $contact, ?array $actingUser): void
    {
        try {
            $superadminEmail = (string)(getenv('SUPERADMIN_NOTIFY_EMAIL') ?: 'office@carahulgupta.in');
            $contactName     = $contact ? ClientModel::displayName($contact) : 'Unknown';
            $actorName       = $actingUser['name']  ?? 'Unknown';
            $actorEmail      = $actingUser['email'] ?? 'Unknown';
            $timestamp       = date('d M Y, h:i A T');
            $status          = $contact ? (((bool)$contact['is_active']) ? 'Active' : 'Inactive') : 'Unknown';

            $htmlBody = BrevoMailer::renderTemplate('contact-activity', [
                'action'      => $action,
                'contactName' => $contactName,
                'actorName'   => $actorName,
                'actorEmail'  => $actorEmail,
                'timestamp'   => $timestamp,
                'status'      => $status,
            ]);

            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $superadminEmail,
                    'CA Rahul Gupta',
                    "Contact {$action} Alert - CA Rahul Gupta",
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[ContactController] Superadmin alert failed: ' . $e->getMessage());
        }
    }
}
