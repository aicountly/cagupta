<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Auth as AuthConfig;
use App\Controllers\BaseController;
use App\Libraries\BrevoMailer;
use App\Libraries\ClientMasterAudit;
use App\Libraries\ClientMasterNameChangeService;
use App\Libraries\DigestQueue;
use App\Libraries\OtpService;
use App\Models\AdminAuditLogModel;
use App\Models\BillingFirmModel;
use App\Models\ClientModel;
use App\Models\UserModel;

/**
 * ContactController — CRUD for the `clients` table.
 *
 * Queues an activity event in `superadmin_digest_queue` on every create,
 * update, or status-change so that the Superadmin receives one consolidated
 * daily digest instead of a separate email per operation.
 *
 * All endpoints require Bearer token + role: super_admin or admin
 * (enforced by RoleFilter in Routes.php).
 */
class ContactController extends BaseController
{
    private ClientModel $clients;
    private UserModel $users;
    private AdminAuditLogModel $audit;

    public function __construct()
    {
        $this->clients = new ClientModel();
        $this->users   = new UserModel();
        $this->audit   = new AdminAuditLogModel();
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

    // ── GET /api/admin/contacts/check-pan ───────────────────────────────────

    /**
     * Return whether another contact already uses this PAN (normalized).
     *
     * Query: pan (required for lookup), exclude_id (optional, when editing).
     */
    public function checkPan(): never
    {
        $pan        = strtoupper(trim((string)$this->query('pan', '')));
        $excludeRaw = $this->query('exclude_id', null);
        $excludeId  = ($excludeRaw !== null && $excludeRaw !== '') ? (int)$excludeRaw : null;
        if ($excludeId !== null && $excludeId <= 0) {
            $excludeId = null;
        }

        if ($pan === '') {
            $this->success(['conflict' => null], 'No PAN provided');
        }

        $other = $this->clients->findOtherByPan($pan, $excludeId);
        if ($other === null) {
            $this->success(['conflict' => null], 'PAN available');
        }

        $this->success([
            'conflict' => $this->panConflictArray($other),
        ], 'PAN already in use');
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

        $pan = strtoupper(trim((string)($body['pan'] ?? ''))) ?: null;
        if ($pan !== null && $pan !== '') {
            $other = $this->clients->findOtherByPan($pan, null);
            if ($other !== null) {
                $this->error(
                    'A contact with this PAN already exists.',
                    422,
                    [],
                    ['conflict' => $this->panConflictArray($other)]
                );
            }
        }

        $actingUser = $this->authUser();

        try {
            $referral = $this->referralFieldsFromBody($body);
            $billingDefault = $this->defaultBillingFieldsFromBody($body);
            $newId = $this->clients->create(array_merge([
                'type'              => $body['type']              ?? 'individual',
                'first_name'        => $firstName  ?: null,
                'last_name'         => $lastName   ?: null,
                'organization_name' => $organizationName ?: null,
                'email'             => trim((string)($body['email']         ?? '')) ?: null,
                'secondary_email'   => trim((string)($body['secondary_email'] ?? '')) ?: null,
                'phone'             => trim((string)($body['phone']         ?? '')) ?: null,
                'secondary_phone'   => trim((string)($body['secondary_phone'] ?? '')) ?: null,
                'pan'               => $pan,
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
                'group_id'          => $this->normalizeOptionalPositiveInt($body['group_id'] ?? null),
                'is_active'         => $body['is_active'] ?? true,
                'contact_status'    => $body['contact_status'] ?? $body['status'] ?? null,
                'created_by'        => $actingUser ? (int)$actingUser['id'] : null,
            ], $referral, $billingDefault ?? []));
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

        $actorId = $actingUser ? (int)$actingUser['id'] : null;
        try {
            $this->audit->insert(
                $actorId,
                'contact.created',
                'contact',
                $newId,
                [],
                null,
                ClientMasterAudit::contactSnapshot($contact ?? [])
            );
        } catch (\Throwable $e) {
            error_log('[ContactController] Audit log failed: ' . $e->getMessage());
        }

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
        ClientMasterNameChangeService::attachPendingToRow('contact', $id, $contact);
        $this->success($contact);
    }

    // ── GET /api/admin/contacts/:id/audit-log ────────────────────────────────

    public function auditLog(int $id): never
    {
        $contact = $this->clients->find($id);
        if ($contact === null) {
            $this->error('Contact not found.', 404);
        }

        $limit  = min(100, max(1, (int)$this->query('limit', 50)));
        $offset = max(0, (int)$this->query('offset', 0));

        $rows = $this->audit->listForEntity('contact', $id, $limit, $offset);
        $this->success($rows, 'Audit log retrieved');
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
            $data['group_id'] = $this->normalizeOptionalPositiveInt($body['group_id'] ?? null);
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
        $billingDefault = $this->defaultBillingFieldsFromBody($body);
        if ($billingDefault !== null) {
            $data = array_merge($data, $billingDefault);
        }

        if (array_key_exists('pan', $data)) {
            $rawPan = $data['pan'];
            $norm   = is_string($rawPan) ? strtoupper(trim($rawPan)) : '';
            if ($norm !== '') {
                $other = $this->clients->findOtherByPan($norm, $id);
                if ($other !== null) {
                    $this->error(
                        'A contact with this PAN already exists.',
                        422,
                        [],
                        ['conflict' => $this->panConflictArray($other)]
                    );
                }
            }
            $data['pan'] = $norm !== '' ? $norm : null;
        }

        $actingUser   = $this->authUser();
        $isSuperAdmin = $this->isSuperAdminActor($actingUser);
        $beforeSnap   = ClientMasterAudit::contactSnapshot($contact);
        $pendingMeta  = null;

        $intercept = ClientMasterNameChangeService::interceptNameChange(
            'contact',
            $id,
            $contact,
            $data,
            $actingUser,
            $isSuperAdmin
        );
        if ($intercept !== null) {
            if ($intercept['type'] === 'blocked') {
                $this->error(
                    'A name change is already pending Super Admin approval (Approval #'
                    . (int)$intercept['summary']['approval_id'] . ').',
                    422,
                    [],
                    ['pending_name_change' => $intercept['summary']]
                );
            }
            $pendingMeta = $intercept['summary'];
        }

        if ($data !== []) {
            try {
                $this->clients->update($id, $data);
            } catch (\PDOException $e) {
                error_log('[ContactController] Update failed for contact ' . $id . ': ' . $e->getMessage());
                $msg = $e->getMessage();
                if (str_contains($msg, 'foreign key') || str_contains($msg, '23503')) {
                    $this->error('Invalid link: choose a valid client group or linked organizations.', 422);
                }
                $this->error('Failed to update contact. Please try again.', 500);
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

        $updated = $this->clients->find($id);

        // ── Superadmin alert (best-effort) ────────────────────────────────────
        $this->sendSuperadminAlert('Updated', $updated, $actingUser);

        $afterSnap = ClientMasterAudit::contactSnapshot($updated ?? []);
        $actorId   = $actingUser ? (int)$actingUser['id'] : null;
        try {
            $this->audit->insert($actorId, 'contact.updated', 'contact', $id, [], $beforeSnap, $afterSnap);
        } catch (\Throwable $e) {
            error_log('[ContactController] Audit log failed: ' . $e->getMessage());
        }

        $message = 'Contact updated';
        $meta    = [];
        if ($pendingMeta !== null) {
            $message = 'Contact updated. Name change submitted for Super Admin approval (Approval #'
                . (int)$pendingMeta['approval_id'] . ').';
            $meta['pending_name_change'] = $pendingMeta;
        }

        $this->success($updated, $message, 200, $meta);
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
        $actorId    = $actingUser ? (int)$actingUser['id'] : null;

        // ── Superadmin alert (best-effort) ────────────────────────────────────
        $statusLabel = $isActive ? 'Activated' : 'Deactivated';
        $this->sendSuperadminAlert("Status Changed ({$statusLabel})", $updated, $actingUser);

        try {
            $this->audit->insert(
                $actorId,
                'contact.status_changed',
                'contact',
                $id,
                ['is_active' => $isActive],
                ClientMasterAudit::contactSnapshot($contact),
                ClientMasterAudit::contactSnapshot($updated ?? [])
            );
        } catch (\Throwable $e) {
            error_log('[ContactController] Audit log failed: ' . $e->getMessage());
        }

        $this->success($updated, 'Contact status updated');
    }

    // ── POST /api/admin/contacts/:id/request-delete-otp ──────────────────────

    /**
     * Send a superadmin OTP email to authorize permanently deleting this contact.
     */
    public function requestDeleteOtp(int $id): never
    {
        $contact = $this->clients->find($id);
        if ($contact === null) {
            $this->error('Contact not found.', 404);
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

        $otp         = OtpService::generate($superId);
        $contactName = ClientModel::displayName($contact);
        try {
            $htmlBody = BrevoMailer::renderTemplate('contact-delete-otp', [
                'userName'      => (string)($super['name'] ?? $email),
                'otpCode'       => $otp,
                'expiryMinutes' => (string)OtpService::expiryMinutes(),
                'contactId'     => (string)$id,
                'contactName'   => $contactName,
            ]);
            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $email,
                    (string)($super['name'] ?? $email),
                    'Contact delete OTP - CA Rahul Gupta',
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[ContactController] Delete OTP email failed: ' . $e->getMessage());
        }

        $this->success([
            'otp_sent'     => true,
            'masked_email' => $this->maskEmail($email),
        ], 'OTP sent.');
    }

    // ── DELETE /api/admin/contacts/:id ───────────────────────────────────────

    /**
     * Permanently delete a contact (requires valid X-Superadmin-Otp).
     */
    public function destroy(int $id): never
    {
        $contact = $this->clients->find($id);
        if ($contact === null) {
            $this->error('Contact not found.', 404);
        }

        $otp = $this->readSuperadminOtpFromRequest();
        if ($otp === '' || !$this->verifySuperadminOtp($otp)) {
            $this->error('Valid superadmin OTP is required to delete a contact. Request a code first.', 403);
        }

        $actingUser = $this->authUser();
        $beforeSnap = ClientMasterAudit::contactSnapshot($contact);
        $this->sendSuperadminAlert('Deleted', $contact, $actingUser);

        try {
            $this->clients->delete($id);
        } catch (\Throwable $e) {
            error_log('[ContactController] Delete failed for contact ' . $id . ': ' . $e->getMessage());
            $this->error('Failed to delete contact. Please try again.', 500);
        }

        $actorId = $actingUser ? (int)$actingUser['id'] : null;
        try {
            $this->audit->insert($actorId, 'contact.deleted', 'contact', $id, [], $beforeSnap, null);
        } catch (\Throwable $e) {
            error_log('[ContactController] Audit log failed: ' . $e->getMessage());
        }

        $this->success(null, 'Contact deleted');
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * @param array<string, mixed> $row Row from findOtherByPan
     *
     * @return array{id: int, display_name: string, pan: string, email: string, phone: string}
     */
    private function panConflictArray(array $row): array
    {
        return [
            'id'           => (int)$row['id'],
            'display_name' => ClientModel::displayName($row),
            'pan'          => (string)($row['pan'] ?? ''),
            'email'        => (string)($row['email'] ?? ''),
            'phone'        => (string)($row['phone'] ?? ''),
        ];
    }

    /**
     * @param mixed $v Raw JSON (may be 0, "0", "", null).
     */
    private function normalizeOptionalPositiveInt(mixed $v): ?int
    {
        if ($v === null || $v === '' || $v === false) {
            return null;
        }
        $n = (int)$v;

        return $n > 0 ? $n : null;
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
     * Optional default billing firm for Raise Invoice pre-fill.
     *
     * @param array<string, mixed> $body
     *
     * @return array{default_billing_profile_code: ?string}|null  null when key not sent
     */
    private function defaultBillingFieldsFromBody(array $body): ?array
    {
        if (!array_key_exists('default_billing_profile_code', $body)
            && !array_key_exists('defaultBillingProfileCode', $body)) {
            return null;
        }
        $raw  = $body['default_billing_profile_code'] ?? $body['defaultBillingProfileCode'] ?? '';
        $code = strtoupper(trim((string)$raw));
        if ($code === '') {
            return ['default_billing_profile_code' => null];
        }
        if ((new BillingFirmModel())->findByCode($code) === null) {
            $this->error('Unknown billing firm code for default billing profile.', 422);
        }

        return ['default_billing_profile_code' => $code];
    }

    /**
     * Queue a contact activity event in the superadmin digest (fire-and-forget).
     *
     * The event is stored in `superadmin_digest_queue` and batched into a
     * single consolidated email sent by the nightly cron (cli/send-digest.php).
     *
     * @param string                     $action     Human-readable action label.
     * @param array<string, mixed>|null  $contact    The affected contact row.
     * @param array<string, mixed>|null  $actingUser The user who performed the action.
     */
    private function sendSuperadminAlert(string $action, ?array $contact, ?array $actingUser): void
    {
        $contactName = $contact ? ClientModel::displayName($contact) : 'Unknown';
        $actorName   = $actingUser['name']  ?? 'Unknown';
        $actorEmail  = $actingUser['email'] ?? 'Unknown';
        $status      = $contact ? (((bool)$contact['is_active']) ? 'Active' : 'Inactive') : 'Unknown';
        $entityId    = (int)($contact['id'] ?? 0);

        DigestQueue::enqueue(
            entityType:  'contact',
            bucket:      'contact',
            entityId:    $entityId,
            displayName: $contactName,
            actionLabel: $action,
            status:      $status,
            actorName:   $actorName,
            actorEmail:  $actorEmail,
        );
    }

    /** @param array<string, mixed>|null $actor */
    private function isSuperAdminActor(?array $actor): bool
    {
        if ($actor === null) {
            return false;
        }
        if ($this->isSuperAdminEmail((string)($actor['email'] ?? ''))) {
            return true;
        }

        return ($actor['role_name'] ?? '') === 'super_admin';
    }
}
