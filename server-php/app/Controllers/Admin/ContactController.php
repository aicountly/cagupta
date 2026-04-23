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

        try {
            $referral = $this->referralFieldsFromBody($body);
            $newId = $this->clients->create(array_merge([
                'type'              => $body['type']              ?? 'individual',
                'first_name'        => $firstName  ?: null,
                'last_name'         => $lastName   ?: null,
                'organization_name' => $organizationName ?: null,
                'email'             => trim((string)($body['email']         ?? '')) ?: null,
                'secondary_email'   => trim((string)($body['secondary_email'] ?? '')) ?: null,
                'phone'             => trim((string)($body['phone']         ?? '')) ?: null,
                'secondary_phone'   => trim((string)($body['secondary_phone'] ?? '')) ?: null,
                'pan'               => strtoupper(trim((string)($body['pan'] ?? ''))) ?: null,
                'gstin'             => strtoupper(trim((string)($body['gstin'] ?? ''))) ?: null,
                'website'           => trim((string)($body['website'] ?? '')) ?: null,
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
                'contact_status'    => $body['contact_status'] ?? $body['status'] ?? null,
                'created_by'        => $actingUser ? (int)$actingUser['id'] : null,
            ], $referral));
        } catch (\Throwable $e) {
            error_log('[ContactController] Create failed: ' . $e->getMessage());
            $this->error('Failed to create contact. Please try again.', 500);
        }

        // Sync linked organizations when the client sends the key (including [] to clear)
        if (array_key_exists('linked_org_ids', $body)) {
            if (!is_array($body['linked_org_ids'])) {
                $this->error('linked_org_ids must be an array.', 422);
            }
            try {
                $this->clients->syncLinkedOrgs($newId, $body['linked_org_ids']);
            } catch (\Throwable $e) {
                error_log('[ContactController] syncLinkedOrgs failed for new contact ' . $newId . ': ' . $e->getMessage());
                $this->error(
                    'Failed to save linked organizations. On new servers, run database migration 012 (creates table contact_organization). Check the PHP error_log for the exact database error.',
                    500
                );
            }
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
        // #region agent log
        @file_put_contents('/Users/rahulgupta/cagupta/.cursor/debug-3b3d32.log', json_encode(['sessionId' => '3b3d32', 'hypothesisId' => 'H5', 'location' => 'ContactController.php:update', 'message' => 'contact update name keys', 'data' => ['id' => $id, 'has_first_name' => array_key_exists('first_name', $body), 'first_len' => strlen(trim((string)($body['first_name'] ?? ''))), 'runs_server_name_duplicate_check' => false], 'timestamp' => (int) round(microtime(true) * 1000)], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
        // #endregion
        // #region agent log
        @file_put_contents(
            '/Users/rahulgupta/cagupta/.cursor/debug-21cedb.log',
            json_encode([
                'sessionId'    => '21cedb',
                'hypothesisId' => 'H2',
                'location'     => 'ContactController.php:update',
                'message'      => 'contact update handler',
                'data'         => [
                    'id'               => $id,
                    'has_first_name'   => array_key_exists('first_name', $body),
                    'has_last_name'    => array_key_exists('last_name', $body),
                    'name_collision_chk' => false,
                ],
                'timestamp'    => (int) round(microtime(true) * 1000),
            ], JSON_UNESCAPED_UNICODE) . "\n",
            FILE_APPEND | LOCK_EX
        );
        // #endregion
        $data = [];

        $textFields = [
            'type', 'first_name', 'last_name', 'organization_name',
            'email', 'secondary_email', 'phone', 'secondary_phone', 'pan', 'gstin', 'website',
            'address_line1', 'address_line2', 'city', 'state', 'pincode', 'country',
            'notes', 'reference',
        ];
        foreach ($textFields as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        if (array_key_exists('contact_status', $body) || array_key_exists('status', $body)) {
            $raw = array_key_exists('contact_status', $body) ? $body['contact_status'] : $body['status'];
            $cs  = strtolower(trim((string)$raw));
            if (!in_array($cs, ['active', 'inactive', 'prospect'], true)) {
                $this->error('contact_status must be one of: active, inactive, prospect.', 422);
            }
            $data['contact_status'] = $cs;
        } elseif (isset($body['is_active'])) {
            $data['is_active'] = (bool)$body['is_active'];
        }
        if (array_key_exists('group_id', $body)) {
            $data['group_id'] = $body['group_id'];
        }
        if (array_key_exists('referring_affiliate_user_id', $body)) {
            $ra = (int)$body['referring_affiliate_user_id'];
            $data['referring_affiliate_user_id'] = $ra > 0 ? $ra : null;
        }
        if (array_key_exists('referral_start_date', $body)) {
            $data['referral_start_date'] = !empty($body['referral_start_date']) ? trim((string)$body['referral_start_date']) : null;
        }
        if (array_key_exists('commission_mode', $body)) {
            $m = (string)($body['commission_mode'] ?? 'referral_only');
            $data['commission_mode'] = in_array($m, ['referral_only', 'direct_interaction'], true) ? $m : 'referral_only';
        }
        if (array_key_exists('client_facing_restricted', $body)) {
            $data['client_facing_restricted'] = (bool)$body['client_facing_restricted'];
        }

        if ($data !== []) {
            try {
                $this->clients->update($id, $data);
            } catch (\Throwable $e) {
                error_log('[ContactController] Update failed for contact ' . $id . ': ' . $e->getMessage());
                $this->error('Failed to update contact. Please try again.', 500);
            }
        }

        if (array_key_exists('linked_org_ids', $body)) {
            if (!is_array($body['linked_org_ids'])) {
                $this->error('linked_org_ids must be an array.', 422);
            }
            try {
                $this->clients->syncLinkedOrgs($id, $body['linked_org_ids']);
            } catch (\Throwable $e) {
                error_log('[ContactController] syncLinkedOrgs failed for contact ' . $id . ': ' . $e->getMessage());
                $this->error(
                    'Failed to save linked organizations. On new servers, run database migration 012 (creates table contact_organization). Check the PHP error_log for the exact database error.',
                    500
                );
            }
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

        try {
            $this->clients->updateStatus($id, $isActive);
        } catch (\Throwable $e) {
            error_log('[ContactController] updateStatus failed for contact ' . $id . ': ' . $e->getMessage());
            $this->error('Failed to update contact status. Please try again.', 500);
        }
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

        try {
            $this->clients->delete($id);
        } catch (\Throwable $e) {
            error_log('[ContactController] Delete failed for contact ' . $id . ': ' . $e->getMessage());
            $this->error('Failed to delete contact. Please try again.', 500);
        }
        $this->success(null, 'Contact deleted');
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Referral master fields from JSON body (contact create).
     *
     * @param array<string, mixed> $body
     *
     * @return array<string, mixed>
     */
    private function referralFieldsFromBody(array $body): array
    {
        $refAff = isset($body['referring_affiliate_user_id']) ? (int)$body['referring_affiliate_user_id'] : 0;
        $m      = (string)($body['commission_mode'] ?? 'referral_only');
        $mode   = in_array($m, ['referral_only', 'direct_interaction'], true) ? $m : 'referral_only';

        return [
            'referring_affiliate_user_id' => $refAff > 0 ? $refAff : null,
            'referral_start_date'         => !empty($body['referral_start_date']) ? trim((string)$body['referral_start_date']) : null,
            'commission_mode'             => $mode,
            'client_facing_restricted'    => !empty($body['client_facing_restricted']),
        ];
    }

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
