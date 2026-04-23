<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Auth as AuthConfig;
use App\Controllers\BaseController;
use App\Libraries\BrevoMailer;
use App\Libraries\OtpService;
use App\Models\OrganizationModel;
use App\Models\UserModel;

/**
 * OrganizationController — CRUD for the `organizations` table.
 *
 * Sends an alert email to the Superadmin on every create, update,
 * or status-change operation (best-effort; failures do not block the response).
 *
 * Most routes use permission-based middleware (e.g. clients.view / clients.edit).
 * Permanent delete and delete-OTP request require role super_admin or admin
 * plus a valid superadmin OTP on DELETE (see Routes.php).
 */
class OrganizationController extends BaseController
{
    private OrganizationModel $orgs;
    private UserModel $users;

    public function __construct()
    {
        $this->orgs   = new OrganizationModel();
        $this->users = new UserModel();
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
     * Body: { name, type?, gstin?, pan?, cin?, email?, phone?,
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

        $panNorm   = $this->normalizeTaxId($body['pan'] ?? '');
        $gstinNorm = $this->normalizeTaxId($body['gstin'] ?? '');
        $cinNorm   = $this->normalizeTaxId($body['cin'] ?? '');

        $conflictRow = $this->orgs->findConflictingByIdentifiers($panNorm, $gstinNorm, $cinNorm, null);
        if ($conflictRow !== null) {
            $fields = $this->matchedIdentifiers($panNorm, $gstinNorm, $cinNorm, $conflictRow);
            $this->error(
                'An organization already uses this PAN, GSTIN, or CIN.',
                409,
                [],
                ['fields' => $fields, 'existing' => $this->organizationConflictPayload($conflictRow)]
            );
        }

        $referral = $this->referralFieldsFromBody($body);
        $newId = $this->orgs->create(array_merge([
            'name'               => $name,
            'type'               => $body['type']    ?? null,
            'gstin'              => $gstinNorm === '' ? null : $gstinNorm,
            'pan'                => $panNorm === '' ? null : $panNorm,
            'cin'                => $cinNorm === '' ? null : $cinNorm,
            'email'              => trim((string)($body['email']   ?? '')) ?: null,
            'secondary_email'    => trim((string)($body['secondary_email'] ?? '')) ?: null,
            'phone'              => trim((string)($body['phone']   ?? '')) ?: null,
            'secondary_phone'    => trim((string)($body['secondary_phone'] ?? '')) ?: null,
            'address'            => $body['address']  ?? null,
            'city'               => $body['city']     ?? null,
            'state'              => $body['state']    ?? null,
            'country'            => trim((string)($body['country'] ?? '')) ?: 'India',
            'pincode'            => $body['pincode']  ?? null,
            'website'            => $body['website']  ?? null,
            'notes'              => $body['notes']    ?? null,
            'reference'          => $body['reference'] ?? null,
            'group_id'           => $body['group_id']  ?? null,
            'primary_contact_id' => $body['primary_contact_id'] ?? null,
            'is_active'          => $body['is_active'] ?? true,
            'created_by'         => $actingUser ? (int)$actingUser['id'] : null,
        ], $referral));

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
            'name', 'type', 'gstin', 'pan', 'cin', 'email', 'secondary_email', 'phone', 'secondary_phone',
            'address', 'city', 'state', 'country', 'pincode', 'website', 'notes', 'reference',
        ];
        foreach ($textFields as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        foreach (['gstin', 'pan', 'cin'] as $taxField) {
            if (array_key_exists($taxField, $data)) {
                $n = $this->normalizeTaxId($data[$taxField]);
                $data[$taxField] = $n === '' ? null : $n;
            }
        }
        if (array_key_exists('country', $data)) {
            $data['country'] = trim((string)$data['country']) ?: 'India';
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

        $effPan = array_key_exists('pan', $data)
            ? $this->normalizeTaxId($data['pan'])
            : $this->normalizeTaxId($org['pan'] ?? '');
        $effGstin = array_key_exists('gstin', $data)
            ? $this->normalizeTaxId($data['gstin'])
            : $this->normalizeTaxId($org['gstin'] ?? '');
        $effCin = array_key_exists('cin', $data)
            ? $this->normalizeTaxId($data['cin'])
            : $this->normalizeTaxId($org['cin'] ?? '');

        if ($effPan !== '' || $effGstin !== '' || $effCin !== '') {
            $conflictRow = $this->orgs->findConflictingByIdentifiers($effPan, $effGstin, $effCin, $id);
            if ($conflictRow !== null) {
                $fields = $this->matchedIdentifiers($effPan, $effGstin, $effCin, $conflictRow);
                $this->error(
                    'An organization already uses this PAN, GSTIN, or CIN.',
                    409,
                    [],
                    ['fields' => $fields, 'existing' => $this->organizationConflictPayload($conflictRow)]
                );
            }
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

    // ── POST /api/admin/organizations/:id/request-delete-otp ─────────────────

    /**
     * Send a superadmin OTP email to authorize deleting this organization.
     */
    public function requestDeleteOtp(int $id): never
    {
        $org = $this->orgs->find($id);
        if ($org === null) {
            $this->error('Organization not found.', 404);
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
        $orgName = (string)($org['name'] ?? 'Unknown');
        try {
            $htmlBody = BrevoMailer::renderTemplate('organization-delete-otp', [
                'userName'      => (string)($super['name'] ?? $email),
                'otpCode'       => $otp,
                'expiryMinutes' => (string)OtpService::expiryMinutes(),
                'orgId'         => (string)$id,
                'orgName'       => $orgName,
            ]);
            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $email,
                    (string)($super['name'] ?? $email),
                    'Organization delete OTP - CA Rahul Gupta',
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[OrganizationController] Delete OTP email failed: ' . $e->getMessage());
        }

        $this->success([
            'otp_sent'     => true,
            'masked_email' => $this->maskEmail($email),
        ], 'OTP sent.');
    }

    // ── DELETE /api/admin/organizations/:id ──────────────────────────────────

    /**
     * Permanently delete an organization (requires valid X-Superadmin-Otp).
     */
    public function destroy(int $id): never
    {
        $org = $this->orgs->find($id);
        if ($org === null) {
            $this->error('Organization not found.', 404);
        }

        $otp = $this->readSuperadminOtpFromRequest();
        if ($otp === '' || !$this->verifySuperadminOtp($otp)) {
            $this->error('Valid superadmin OTP is required to delete an organization. Request a code first.', 403);
        }

        $actingUser = $this->authUser();
        $this->sendSuperadminAlert('Deleted', $org, $actingUser);

        $this->orgs->delete($id);
        $this->success(null, 'Organization deleted');
    }

    // ── Private helpers ──────────────────────────────────────────────────────

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

    private function normalizeTaxId(mixed $v): string
    {
        return strtoupper(trim((string)($v ?? '')));
    }

    /**
     * @param array<string, mixed> $row Database row (pan / gstin / cin may be null).
     * @return list<string>
     */
    private function matchedIdentifiers(string $pan, string $gstin, string $cin, array $row): array
    {
        $fields = [];
        if ($pan !== '' && $this->normalizeTaxId($row['pan'] ?? '') === $pan) {
            $fields[] = 'pan';
        }
        if ($gstin !== '' && $this->normalizeTaxId($row['gstin'] ?? '') === $gstin) {
            $fields[] = 'gstin';
        }
        if ($cin !== '' && $this->normalizeTaxId($row['cin'] ?? '') === $cin) {
            $fields[] = 'cin';
        }

        return $fields;
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function organizationConflictPayload(array $row): array
    {
        return [
            'id'    => (int)($row['id'] ?? 0),
            'name'  => (string)($row['name'] ?? ''),
            'pan'   => isset($row['pan']) && $row['pan'] !== null && $row['pan'] !== '' ? (string)$row['pan'] : null,
            'gstin' => isset($row['gstin']) && $row['gstin'] !== null && $row['gstin'] !== '' ? (string)$row['gstin'] : null,
            'cin'   => isset($row['cin']) && $row['cin'] !== null && $row['cin'] !== '' ? (string)$row['cin'] : null,
            'city'  => isset($row['city']) && $row['city'] !== null && $row['city'] !== '' ? (string)$row['city'] : null,
            'state' => isset($row['state']) && $row['state'] !== null && $row['state'] !== '' ? (string)$row['state'] : null,
        ];
    }

    /**
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
