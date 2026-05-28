<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * CRUD for lead_quotations.
 */
class LeadQuotationModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function forLead(int $leadId): array
    {
        $stmt = $this->db->prepare(
            'SELECT q.*, et.name AS engagement_type_name
             FROM lead_quotations q
             LEFT JOIN engagement_types et ON et.id = q.engagement_type_id
             WHERE q.lead_id = :lid
             ORDER BY q.updated_at DESC, q.id DESC'
        );
        $stmt->execute([':lid' => $leadId]);
        return $stmt->fetchAll();
    }

    /**
     * Primary quotation row for a lead (latest updated).
     *
     * @return array<string, mixed>|null
     */
    public function primaryForLead(int $leadId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT q.*, et.name AS engagement_type_name
             FROM lead_quotations q
             LEFT JOIN engagement_types et ON et.id = q.engagement_type_id
             WHERE q.lead_id = :lid
             ORDER BY q.updated_at DESC, q.id DESC
             LIMIT 1'
        );
        $stmt->execute([':lid' => $leadId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT q.*, et.name AS engagement_type_name
             FROM lead_quotations q
             LEFT JOIN engagement_types et ON et.id = q.engagement_type_id
             WHERE q.id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * @param array<int, string> $documentsRequired
     * @param array<string, mixed> $pricingSnapshot
     */
    public function create(
        int $leadId,
        ?int $engagementTypeId,
        ?float $price,
        array $documentsRequired,
        array $pricingSnapshot,
        string $status,
        string $documentsStatus,
        ?int $createdBy
    ): int {
        $json     = json_encode(array_values($documentsRequired), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $snapJson = json_encode($pricingSnapshot, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $stmt = $this->db->prepare(
            'INSERT INTO lead_quotations
                (lead_id, engagement_type_id, price, documents_required, pricing_snapshot,
                 status, documents_status, created_by, created_at, updated_at)
             VALUES
                (:lid, :eid, :price, CAST(:docs AS jsonb), CAST(:snap AS jsonb),
                 :st, :dst, :uid, NOW(), NOW())
             RETURNING id'
        );
        $stmt->execute([
            ':lid'  => $leadId,
            ':eid'  => $engagementTypeId,
            ':price'=> $price,
            ':docs' => $json,
            ':snap' => $snapJson,
            ':st'   => $status,
            ':dst'  => $documentsStatus,
            ':uid'  => $createdBy,
        ]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Update pricing fields only (does not change documents_required).
     *
     * @param array<string, mixed> $pricingSnapshot
     */
    public function updatePricing(
        int $id,
        ?float $price,
        array $pricingSnapshot,
        string $status,
        ?int $engagementTypeId,
        bool $setEngagementTypeId
    ): bool {
        $snapJson = json_encode($pricingSnapshot, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        if ($setEngagementTypeId) {
            $stmt = $this->db->prepare(
                'UPDATE lead_quotations SET
                    engagement_type_id = :eid,
                    price = :price,
                    pricing_snapshot = CAST(:snap AS jsonb),
                    status = :st,
                    updated_at = NOW()
                 WHERE id = :id'
            );
            return $stmt->execute([
                ':id'    => $id,
                ':eid'   => $engagementTypeId,
                ':price' => $price,
                ':snap'  => $snapJson,
                ':st'    => $status,
            ]);
        }
        $stmt = $this->db->prepare(
            'UPDATE lead_quotations SET
                price = :price,
                pricing_snapshot = CAST(:snap AS jsonb),
                status = :st,
                updated_at = NOW()
             WHERE id = :id'
        );
        return $stmt->execute([
            ':id'    => $id,
            ':price' => $price,
            ':snap'  => $snapJson,
            ':st'    => $status,
        ]);
    }

    /**
     * @param array<int, string> $documentsRequired
     */
    public function updateDocuments(int $id, array $documentsRequired, string $documentsStatus): bool
    {
        $json = json_encode(array_values($documentsRequired), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $stmt = $this->db->prepare(
            'UPDATE lead_quotations SET
                documents_required = CAST(:docs AS jsonb),
                documents_status = :dst,
                updated_at = NOW()
             WHERE id = :id'
        );
        return $stmt->execute([
            ':id'   => $id,
            ':docs' => $json,
            ':dst'  => $documentsStatus,
        ]);
    }

    public function markSent(int $id): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE lead_quotations SET status = \'sent\', updated_at = NOW() WHERE id = :id'
        );
        return $stmt->execute([':id' => $id]);
    }

    /**
     * True if lead has at least one quotation with status final (or sent).
     */
    public function leadHasFinalQuotation(int $leadId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT 1 FROM lead_quotations WHERE lead_id = :lid AND status IN (\'final\', \'sent\') LIMIT 1'
        );
        $stmt->execute([':lid' => $leadId]);
        return (bool)$stmt->fetchColumn();
    }

    /**
     * True when quotation pricing and documents are both finalized.
     */
    public function isShareable(array $row): bool
    {
        $status = (string)($row['status'] ?? 'draft');
        $docSt  = (string)($row['documents_status'] ?? 'draft');
        if (!in_array($status, ['final', 'sent'], true) || $docSt !== 'final') {
            return false;
        }
        $docs = $row['documents_required'] ?? [];
        if (is_string($docs)) {
            $docs = json_decode($docs, true) ?? [];
        }
        if (!is_array($docs)) {
            return false;
        }
        foreach ($docs as $d) {
            if (trim((string)$d) !== '') {
                return true;
            }
        }
        return false;
    }

    public function countLeadsNeedingQuotation(): int
    {
        $sql = "SELECT COUNT(*) FROM leads l
                WHERE l.status IN ('qualified', 'proposal_sent')
                  AND NOT EXISTS (
                      SELECT 1 FROM lead_quotations q
                      WHERE q.lead_id = l.id AND q.status IN ('final', 'sent')
                  )";
        return (int)$this->db->query($sql)->fetchColumn();
    }

    /**
     * @return array<int, int> lead ids
     */
    public function leadIdsNeedingQuotation(int $limit = 50): array
    {
        $lim = max(1, min(200, $limit));
        $sql = "SELECT l.id FROM leads l
                WHERE l.status IN ('qualified', 'proposal_sent')
                  AND NOT EXISTS (
                      SELECT 1 FROM lead_quotations q
                      WHERE q.lead_id = l.id AND q.status IN ('final', 'sent')
                  )
                ORDER BY l.updated_at DESC
                LIMIT {$lim}";
        $stmt = $this->db->query($sql);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
}
