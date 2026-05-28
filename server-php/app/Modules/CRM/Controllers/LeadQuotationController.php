<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Auth as AuthConfig;
use App\Controllers\BaseController;
use App\Libraries\QuotationPricing;
use App\Libraries\QuotationShareService;
use App\Models\EngagementTypeQuotationDefaultModel;
use App\Models\LeadModel;
use App\Models\LeadQuotationModel;

/**
 * Per-lead quotations (no OTP; setup defaults are OTP-gated separately).
 */
class LeadQuotationController extends BaseController
{
    private LeadModel $leads;
    private LeadQuotationModel $quotations;
    private EngagementTypeQuotationDefaultModel $defaults;

    public function __construct()
    {
        $this->leads       = new LeadModel();
        $this->quotations  = new LeadQuotationModel();
        $this->defaults    = new EngagementTypeQuotationDefaultModel();
    }

    // ── GET /api/admin/leads/:id/quotations ───────────────────────────────────

    public function index(int $leadId): never
    {
        $this->requireQuotationManagePermission();
        if ($this->leads->find($leadId) === null) {
            $this->error('Lead not found.', 404);
        }
        $rows = $this->quotations->forLead($leadId);
        $out  = array_map(fn (array $r) => $this->formatQuotation($r), $rows);
        $this->success($out);
    }

    // ── POST /api/admin/leads/:id/quotations ──────────────────────────────────

    public function store(int $leadId): never
    {
        $this->requireQuotationManagePermission();
        $lead = $this->leads->find($leadId);
        if ($lead === null) {
            $this->error('Lead not found.', 404);
        }

        $body = $this->getJsonBody();
        $eid  = isset($body['engagement_type_id']) && $body['engagement_type_id'] !== '' && $body['engagement_type_id'] !== null
            ? (int)$body['engagement_type_id'] : null;
        if ($eid !== null && !$this->defaults->engagementTypeExists($eid)) {
            $this->error('Invalid engagement_type_id.', 422);
        }

        $legacyPrice = null;
        if (isset($body['price']) && $body['price'] !== null && $body['price'] !== '') {
            $legacyPrice = (float)$body['price'];
        }

        $snapshot = QuotationPricing::normalizeSnapshot(
            $body['pricing_snapshot'] ?? [],
            $legacyPrice
        );
        $price = QuotationPricing::computeTotal($snapshot) ?? $legacyPrice;

        $docs = $this->resolveInitialDocuments($body, $eid);
        $status = $this->normalizePricingStatus($body['status'] ?? 'draft');
        $documentsStatus = 'draft';

        $acting = $this->authUser();
        $uid    = $acting ? (int)$acting['id'] : null;

        $newId = $this->quotations->create($leadId, $eid, $price, $docs, $snapshot, $status, $documentsStatus, $uid);
        $row   = $this->quotations->find($newId);
        $this->success($this->formatQuotation($row ?? []), 'Quotation saved.', 201);
    }

    // ── PATCH /api/admin/leads/:leadId/quotations/:quotationId ────────────────

    public function update(int $leadId, int $quotationId): never
    {
        $this->requireQuotationManagePermission();
        if ($this->leads->find($leadId) === null) {
            $this->error('Lead not found.', 404);
        }
        $existing = $this->quotations->find($quotationId);
        if ($existing === null || (int)$existing['lead_id'] !== $leadId) {
            $this->error('Quotation not found.', 404);
        }

        $body = $this->getJsonBody();

        $touchEid = false;
        $eid      = null;
        if (array_key_exists('engagement_type_id', $body)) {
            $touchEid = true;
            $v        = $body['engagement_type_id'];
            if ($v === null || $v === '') {
                $eid = null;
            } else {
                $eid = (int)$v;
                if (!$this->defaults->engagementTypeExists($eid)) {
                    $this->error('Invalid engagement_type_id.', 422);
                }
            }
        }

        $legacyPrice = isset($existing['price']) && $existing['price'] !== null
            ? (float)$existing['price'] : null;
        if (array_key_exists('price', $body)) {
            if ($body['price'] === null || $body['price'] === '') {
                $legacyPrice = null;
            } else {
                $legacyPrice = (float)$body['price'];
            }
        }

        $existingSnapRaw = $existing['pricing_snapshot'] ?? [];
        if (is_string($existingSnapRaw)) {
            $existingSnapRaw = json_decode($existingSnapRaw, true) ?? [];
        }

        if (array_key_exists('pricing_snapshot', $body)) {
            $snapshot = QuotationPricing::normalizeSnapshot($body['pricing_snapshot'], $legacyPrice);
        } else {
            $snapshot = QuotationPricing::normalizeSnapshot($existingSnapRaw, $legacyPrice);
        }

        $price = QuotationPricing::computeTotal($snapshot) ?? $legacyPrice;

        $status = (string)($existing['status'] ?? 'draft');
        if (array_key_exists('status', $body)) {
            $status = $this->normalizePricingStatus($body['status']);
        }

        $this->quotations->updatePricing($quotationId, $price, $snapshot, $status, $eid, $touchEid);
        $row = $this->quotations->find($quotationId);
        $this->success($this->formatQuotation($row ?? []), 'Quotation updated.');
    }

    // ── PATCH /api/admin/leads/:leadId/quotations/:quotationId/documents ─────

    public function updateDocuments(int $leadId, int $quotationId): never
    {
        $this->requireQuotationManagePermission();
        if ($this->leads->find($leadId) === null) {
            $this->error('Lead not found.', 404);
        }
        $existing = $this->quotations->find($quotationId);
        if ($existing === null || (int)$existing['lead_id'] !== $leadId) {
            $this->error('Quotation not found.', 404);
        }

        $body = $this->getJsonBody();
        if (!array_key_exists('documents_required', $body)) {
            $this->error('documents_required is required.', 422);
        }

        $docs = $this->normalizeDocuments($body['documents_required']);
        $documentsStatus = $this->normalizeDocumentsStatus($body['documents_status'] ?? 'draft');

        // Re-editing documents after share resets document finalize state unless explicitly final again
        if ((string)($existing['status'] ?? '') === 'sent' && $documentsStatus === 'draft') {
            // allow draft save after sent
        }

        $this->quotations->updateDocuments($quotationId, $docs, $documentsStatus);
        $row = $this->quotations->find($quotationId);
        $this->success($this->formatQuotation($row ?? []), 'Document list saved.');
    }

    // ── POST /api/admin/leads/:leadId/quotations/:quotationId/share ──────────

    public function share(int $leadId, int $quotationId): never
    {
        $this->requireQuotationManagePermission();
        $lead = $this->leads->find($leadId);
        if ($lead === null) {
            $this->error('Lead not found.', 404);
        }
        $existing = $this->quotations->find($quotationId);
        if ($existing === null || (int)$existing['lead_id'] !== $leadId) {
            $this->error('Quotation not found.', 404);
        }

        if (!$this->quotations->isShareable($existing)) {
            $this->error('Quotation and document list must both be finalized before sharing.', 422);
        }

        if (!isset($_FILES['pdf']) || $_FILES['pdf']['error'] !== UPLOAD_ERR_OK) {
            $this->error('PDF file upload is required.', 422);
        }

        $mime = (string)($_FILES['pdf']['type'] ?? '');
        if ($mime !== '' && $mime !== 'application/pdf') {
            $this->error('Uploaded file must be a PDF.', 422);
        }

        $pdfBinary = (string)file_get_contents((string)$_FILES['pdf']['tmp_name']);
        if ($pdfBinary === '') {
            $this->error('Empty PDF upload.', 422);
        }

        $channel = strtolower(trim((string)($_POST['channel'] ?? '')));
        if (!in_array($channel, ['email', 'sms', 'wa_web', 'wa_api'], true)) {
            $this->error('channel must be email, sms, wa_web, or wa_api.', 422);
        }

        $recipientName   = trim((string)($_POST['recipient_name'] ?? ''));
        $recipientEmail  = trim((string)($_POST['recipient_email'] ?? ''));
        $recipientMobile = trim((string)($_POST['recipient_mobile'] ?? ''));

        if ($channel === 'email' && $recipientEmail === '') {
            $recipientEmail = trim((string)($lead['email'] ?? ''));
        }
        if (in_array($channel, ['sms', 'wa_web', 'wa_api'], true) && $recipientMobile === '') {
            $recipientMobile = trim((string)($lead['phone'] ?? ''));
        }
        if ($recipientName === '') {
            $recipientName = trim((string)($lead['name'] ?? ''));
        }

        $acting = $this->authUser();
        $uid    = $acting ? (int)$acting['id'] : null;

        try {
            $result = (new QuotationShareService())->storeAndDispatch(
                $existing,
                $leadId,
                $recipientName ?: 'Client',
                isset($existing['engagement_type_name']) ? (string)$existing['engagement_type_name'] : null,
                $channel,
                $recipientName ?: null,
                $recipientEmail ?: null,
                $recipientMobile ?: null,
                $pdfBinary,
                $uid
            );
        } catch (\Throwable $e) {
            $this->error($e->getMessage(), 502);
        }

        $this->quotations->markSent($quotationId);
        $this->success($result, 'Quotation shared successfully.');
    }

    private function requireQuotationManagePermission(): void
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
        if (!in_array('quotations.manage', $perms, true)) {
            $this->error('Access denied. Required permission: quotations.manage.', 403);
        }
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function formatQuotation(array $row): array
    {
        $docs = $row['documents_required'] ?? [];
        if (is_string($docs)) {
            $docs = json_decode($docs, true) ?? [];
        }
        if (!is_array($docs)) {
            $docs = [];
        }

        $legacyPrice = isset($row['price']) && $row['price'] !== null ? (float)$row['price'] : null;
        $snapRaw     = $row['pricing_snapshot'] ?? [];
        if (is_string($snapRaw)) {
            $snapRaw = json_decode($snapRaw, true) ?? [];
        }
        $snapshot = QuotationPricing::normalizeSnapshot($snapRaw, $legacyPrice);

        $formatted = [
            'id'                   => (int)($row['id'] ?? 0),
            'lead_id'              => (int)($row['lead_id'] ?? 0),
            'engagement_type_id'   => isset($row['engagement_type_id']) && $row['engagement_type_id'] !== null
                ? (int)$row['engagement_type_id'] : null,
            'engagement_type_name' => $row['engagement_type_name'] ?? null,
            'price'                => $legacyPrice,
            'pricing_snapshot'     => $snapshot,
            'documents_required'   => $docs,
            'status'               => (string)($row['status'] ?? 'draft'),
            'documents_status'     => (string)($row['documents_status'] ?? 'draft'),
            'shareable'            => $this->quotations->isShareable($row),
            'created_by'           => isset($row['created_by']) ? (int)$row['created_by'] : null,
            'created_at'           => $row['created_at'] ?? null,
            'updated_at'           => $row['updated_at'] ?? null,
        ];

        return $formatted;
    }

    /**
     * @param array<string, mixed> $body
     * @return array<int, string>
     */
    private function resolveInitialDocuments(array $body, ?int $engagementTypeId): array
    {
        if (array_key_exists('documents_required', $body)) {
            return $this->normalizeDocuments($body['documents_required']);
        }
        if ($engagementTypeId !== null) {
            $def = $this->defaults->findByEngagementTypeId($engagementTypeId);
            if ($def !== null) {
                $raw = $def['documents_required'] ?? [];
                if (is_string($raw)) {
                    $raw = json_decode($raw, true) ?? [];
                }
                return $this->normalizeDocuments(is_array($raw) ? $raw : []);
            }
        }
        return [];
    }

    private function normalizePricingStatus(mixed $raw): string
    {
        $st = trim((string)$raw);
        if (!in_array($st, ['draft', 'final', 'sent'], true)) {
            $this->error('status must be draft, final, or sent.', 422);
        }
        return $st;
    }

    private function normalizeDocumentsStatus(mixed $raw): string
    {
        $st = trim((string)$raw);
        if (!in_array($st, ['draft', 'final'], true)) {
            $this->error('documents_status must be draft or final.', 422);
        }
        return $st;
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
}
