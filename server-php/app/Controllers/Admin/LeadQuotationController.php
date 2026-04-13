<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Auth as AuthConfig;
use App\Controllers\BaseController;
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
        if ($this->leads->find($leadId) === null) {
            $this->error('Lead not found.', 404);
        }

        $body = $this->getJsonBody();
        $eid  = isset($body['engagement_type_id']) && $body['engagement_type_id'] !== '' && $body['engagement_type_id'] !== null
            ? (int)$body['engagement_type_id'] : null;
        if ($eid !== null && !$this->defaults->engagementTypeExists($eid)) {
            $this->error('Invalid engagement_type_id.', 422);
        }

        $price = null;
        if (isset($body['price']) && $body['price'] !== null && $body['price'] !== '') {
            $price = (float)$body['price'];
        }

        $docs   = $this->normalizeDocuments($body['documents_required'] ?? []);
        $status = trim((string)($body['status'] ?? 'draft'));
        if (!in_array($status, ['draft', 'final', 'sent'], true)) {
            $this->error('status must be draft, final, or sent.', 422);
        }

        $acting = $this->authUser();
        $uid    = $acting ? (int)$acting['id'] : null;

        $newId = $this->quotations->create($leadId, $eid, $price, $docs, $status, $uid);
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

        $price = isset($existing['price']) && $existing['price'] !== null ? (float)$existing['price'] : null;
        if (array_key_exists('price', $body)) {
            if ($body['price'] === null || $body['price'] === '') {
                $price = null;
            } else {
                $price = (float)$body['price'];
            }
        }

        $docs = $this->normalizeDocumentsFromExisting($existing['documents_required'] ?? []);
        if (array_key_exists('documents_required', $body)) {
            $docs = $this->normalizeDocuments($body['documents_required']);
        }

        $status = (string)($existing['status'] ?? 'draft');
        if (array_key_exists('status', $body)) {
            $st = trim((string)$body['status']);
            if (!in_array($st, ['draft', 'final', 'sent'], true)) {
                $this->error('status must be draft, final, or sent.', 422);
            }
            $status = $st;
        }

        $this->quotations->update($quotationId, $price, $docs, $status, $eid, $touchEid);
        $row = $this->quotations->find($quotationId);
        $this->success($this->formatQuotation($row ?? []), 'Quotation updated.');
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

        return [
            'id'                   => (int)($row['id'] ?? 0),
            'lead_id'              => (int)($row['lead_id'] ?? 0),
            'engagement_type_id'   => isset($row['engagement_type_id']) && $row['engagement_type_id'] !== null
                ? (int)$row['engagement_type_id'] : null,
            'engagement_type_name' => $row['engagement_type_name'] ?? null,
            'price'                => isset($row['price']) && $row['price'] !== null ? (float)$row['price'] : null,
            'documents_required'   => $docs,
            'status'               => (string)($row['status'] ?? 'draft'),
            'created_by'           => isset($row['created_by']) ? (int)$row['created_by'] : null,
            'created_at'           => $row['created_at'] ?? null,
            'updated_at'           => $row['updated_at'] ?? null,
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
     * @param mixed $existing
     * @return array<int, string>
     */
    private function normalizeDocumentsFromExisting(mixed $existing): array
    {
        if (is_string($existing)) {
            $decoded = json_decode($existing, true);
            return is_array($decoded) ? $this->normalizeDocuments($decoded) : [];
        }
        if (is_array($existing)) {
            return $this->normalizeDocuments($existing);
        }
        return [];
    }
}
