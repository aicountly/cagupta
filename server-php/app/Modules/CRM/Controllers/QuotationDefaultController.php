<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Auth as AuthConfig;
use App\Controllers\BaseController;
use App\Libraries\BrevoMailer;
use App\Libraries\OtpService;
use App\Models\EngagementTypeQuotationDefaultModel;
use App\Models\LeadQuotationModel;
use App\Models\UserModel;

/**
 * Quotation defaults per engagement type — OTP-gated updates.
 */
class QuotationDefaultController extends BaseController
{
    private EngagementTypeQuotationDefaultModel $defaults;
    private LeadQuotationModel $leadQuotations;
    private UserModel $users;

    public function __construct()
    {
        $this->defaults       = new EngagementTypeQuotationDefaultModel();
        $this->leadQuotations = new LeadQuotationModel();
        $this->users          = new UserModel();
    }

    // ── GET /api/admin/quotation-defaults ─────────────────────────────────────

    public function index(): never
    {
        $rows = $this->defaults->listAllWithDefaults();
        $out  = [];
        foreach ($rows as $row) {
            $out[] = $this->formatListRow($row);
        }
        $this->success($out);
    }

    // ── GET /api/admin/quotation-defaults/pending-summary ───────────────────

    public function pendingSummary(): never
    {
        $incompleteTypes = $this->defaults->countIncompleteSetups();
        $totalTypes      = $this->defaults->countEngagementTypes();
        $leadsPending    = $this->leadQuotations->countLeadsNeedingQuotation();
        $leadIds         = $this->leadQuotations->leadIdsNeedingQuotation(200);

        $this->success([
            'engagement_types_incomplete' => $incompleteTypes,
            'engagement_types_total'        => $totalTypes,
            'engagement_types_complete'     => max(0, $totalTypes - $incompleteTypes),
            'leads_needing_final_quotation' => $leadsPending,
            'sample_lead_ids_needing_quotation' => $leadIds,
            'lead_ids_needing_quotation'        => $leadIds,
        ]);
    }

    // ── GET /api/admin/quotation-defaults/by-engagement-type/:id ─────────────

    public function showByEngagementType(int $engagementTypeId): never
    {
        if (!$this->defaults->engagementTypeExists($engagementTypeId)) {
            $this->error('Engagement type not found.', 404);
        }
        $row = $this->defaults->findByEngagementTypeId($engagementTypeId);
        $this->success($this->formatDefaultRow($engagementTypeId, $row));
    }

    // ── POST /api/admin/quotation-defaults/request-change-otp ────────────────

    public function requestChangeOtp(): never
    {
        $this->requireQuotationSetupPermission();

        $body        = $this->getJsonBody();
        $passphrase  = (string)($body['passphrase'] ?? '');
        $configured  = (string)(getenv('QUOTATION_SETUP_PASSPHRASE') ?: '');
        if ($configured === '') {
            $this->error('Quotation setup passphrase is not configured on the server.', 503);
        }
        if (!hash_equals($configured, $passphrase)) {
            $this->error('Invalid passphrase.', 403);
        }

        $acting  = $this->authUser();
        $recipient = trim((string)($body['otp_recipient'] ?? 'super_admin'));
        $otpUserId = $this->resolveOtpUserId($acting, $recipient);
        $otpUser   = $this->users->find($otpUserId);
        if ($otpUser === null || !$otpUser['is_active']) {
            $this->error('OTP recipient user not found.', 500);
        }

        $otp = OtpService::generate($otpUserId);
        $email = (string)($otpUser['email'] ?? '');
        if ($email === '') {
            $this->error('OTP recipient has no email.', 500);
        }

        try {
            $htmlBody = BrevoMailer::renderTemplate('quotation-setup-otp', [
                'userName'      => (string)($otpUser['name'] ?? $email),
                'otpCode'       => $otp,
                'expiryMinutes' => (string)OtpService::expiryMinutes(),
            ]);
            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $email,
                    (string)($otpUser['name'] ?? $email),
                    'Quotation setup OTP - CA Rahul Gupta',
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[QuotationDefaultController] OTP email failed: ' . $e->getMessage());
        }

        $this->success([
            'otp_sent'       => true,
            'masked_email'   => $this->maskEmail($email),
            'otp_recipient'  => $recipient,
        ], 'OTP sent.');
    }

    // ── PUT /api/admin/quotation-defaults/by-engagement-type/:id ─────────────

    public function updateByEngagementType(int $engagementTypeId): never
    {
        $this->requireQuotationSetupPermission();

        if (!$this->defaults->engagementTypeExists($engagementTypeId)) {
            $this->error('Engagement type not found.', 404);
        }

        $body = $this->getJsonBody();
        $otp  = trim((string)($body['otp'] ?? ''));
        if ($otp === '') {
            $this->error('otp is required.', 422);
        }

        $acting    = $this->authUser();
        $recipient = trim((string)($body['otp_recipient'] ?? 'super_admin'));
        $otpUserId = $this->resolveOtpUserId($acting, $recipient);

        if (!OtpService::verify($otpUserId, $otp)) {
            $this->error('Invalid or expired OTP.', 403);
        }

        $docs = $this->normalizeDocuments($body['documents_required'] ?? []);
        $price = null;
        if (array_key_exists('default_price', $body) && $body['default_price'] !== null && $body['default_price'] !== '') {
            $price = (float)$body['default_price'];
        }

        $before = $this->defaults->findByEngagementTypeId($engagementTypeId);
        $actorId = $acting ? (int)$acting['id'] : null;

        $this->defaults->upsert($engagementTypeId, $price, $docs, $actorId);

        $after = $this->defaults->findByEngagementTypeId($engagementTypeId);
        $this->sendSuperadminSuccessAlert($before, $after, $engagementTypeId, $acting);

        $this->success($this->formatDefaultRow($engagementTypeId, $after), 'Quotation default saved.');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function requireQuotationSetupPermission(): void
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Not authenticated.', 401);
        }
        if (strtolower((string)($user['email'] ?? '')) === strtolower(AuthConfig::SUPER_ADMIN_EMAIL)) {
            return;
        }
        $perms = $user['role_permissions_array'] ?? [];
        if (in_array('*', $perms, true)) {
            return;
        }
        if (!in_array('quotations.setup', $perms, true)) {
            $this->error('Access denied. Required permission: quotations.setup.', 403);
        }
    }

    /**
     * @param array<string, mixed>|null $acting
     */
    private function resolveOtpUserId(?array $acting, string $otpRecipient): int
    {
        $super = $this->users->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
        if ($super === null) {
            $this->error('Super admin account is not provisioned.', 500);
        }
        $superId = (int)$super['id'];

        if ($otpRecipient === 'acting_admin' && $acting !== null) {
            $role = (string)($acting['role_name'] ?? '');
            if ($role === 'admin' && strtolower((string)$acting['email']) !== strtolower(AuthConfig::SUPER_ADMIN_EMAIL)) {
                return (int)$acting['id'];
            }
        }

        return $superId;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function formatListRow(array $row): array
    {
        $docs = $row['documents_required'] ?? null;
        if (is_string($docs)) {
            $docs = json_decode($docs, true) ?? [];
        }
        if (!is_array($docs)) {
            $docs = [];
        }

        $setupComplete = $row['default_price'] !== null
            || $this->docsHaveContent($docs);

        return [
            'engagement_type_id'   => (int)$row['engagement_type_id'],
            'engagement_type_name' => (string)$row['engagement_type_name'],
            'category_id'          => (int)$row['category_id'],
            'category_name'        => (string)$row['category_name'],
            'subcategory_id'       => $row['subcategory_id'] !== null ? (int)$row['subcategory_id'] : null,
            'subcategory_name'     => $row['subcategory_name'] !== null ? (string)$row['subcategory_name'] : null,
            'default_price'        => $row['default_price'] !== null ? (float)$row['default_price'] : null,
            'documents_required'   => $docs,
            'setup_complete'       => $setupComplete,
            'updated_at'           => $row['default_updated_at'],
            'updated_by'           => $row['default_updated_by'] !== null ? (int)$row['default_updated_by'] : null,
        ];
    }

    /**
     * @param array<string, mixed>|null $row
     * @return array<string, mixed>
     */
    private function formatDefaultRow(int $engagementTypeId, ?array $row): array
    {
        if ($row === null) {
            return [
                'engagement_type_id'   => $engagementTypeId,
                'default_price'        => null,
                'documents_required'   => [],
                'setup_complete'       => false,
                'updated_at'           => null,
                'updated_by'           => null,
            ];
        }
        $docs = $row['documents_required'] ?? [];
        if (is_string($docs)) {
            $docs = json_decode($docs, true) ?? [];
        }
        if (!is_array($docs)) {
            $docs = [];
        }
        $setupComplete = $row['default_price'] !== null || $this->docsHaveContent($docs);

        return [
            'engagement_type_id'   => (int)$row['engagement_type_id'],
            'default_price'        => $row['default_price'] !== null ? (float)$row['default_price'] : null,
            'documents_required'   => $docs,
            'setup_complete'       => $setupComplete,
            'updated_at'           => $row['updated_at'] ?? null,
            'updated_by'           => isset($row['updated_by']) ? (int)$row['updated_by'] : null,
        ];
    }

    /**
     * @param mixed $raw
     * @return array<int, string>
     */
    private function normalizeDocuments(mixed $raw): array
    {
        if (is_string($raw)) {
            $lines = preg_split('/\r\n|\r|\n/', $raw) ?: [];
            $raw   = $lines;
        }
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $item) {
            $s = trim((string)$item);
            if ($s !== '') {
                $out[] = $s;
            }
        }
        return $out;
    }

    /**
     * @param array<int|string, mixed> $docs
     */
    private function docsHaveContent(array $docs): bool
    {
        foreach ($docs as $line) {
            if (trim((string)$line) !== '') {
                return true;
            }
        }
        return false;
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
     * @param array<string, mixed>|null $before
     * @param array<string, mixed>|null $after
     * @param array<string, mixed>|null $acting
     */
    private function sendSuperadminSuccessAlert(?array $before, ?array $after, int $engagementTypeId, ?array $acting): void
    {
        try {
            $superadminEmail = (string)(getenv('SUPERADMIN_NOTIFY_EMAIL') ?: 'office@carahulgupta.in');
            $actorName       = $acting['name']  ?? 'Unknown';
            $actorEmail      = $acting['email'] ?? 'Unknown';
            $timestamp       = date('d M Y, h:i A T');

            $bp = $before['default_price'] ?? '—';
            $ap = $after['default_price'] ?? '—';
            $bd = $before['documents_required'] ?? '[]';
            $ad = $after['documents_required'] ?? '[]';
            if (is_array($bd)) {
                $bd = json_encode($bd, JSON_UNESCAPED_UNICODE);
            }
            if (is_array($ad)) {
                $ad = json_encode($ad, JSON_UNESCAPED_UNICODE);
            }

            $htmlBody = BrevoMailer::renderTemplate('quotation-setup-activity', [
                'engagementTypeId' => (string)$engagementTypeId,
                'actorName'        => (string)$actorName,
                'actorEmail'       => (string)$actorEmail,
                'timestamp'        => $timestamp,
                'beforePrice'      => (string)$bp,
                'afterPrice'       => (string)$ap,
                'beforeDocs'       => (string)$bd,
                'afterDocs'        => (string)$ad,
            ]);

            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $superadminEmail,
                    'CA Rahul Gupta',
                    'Quotation default updated - CA Rahul Gupta',
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[QuotationDefaultController] Superadmin alert failed: ' . $e->getMessage());
        }
    }
}
