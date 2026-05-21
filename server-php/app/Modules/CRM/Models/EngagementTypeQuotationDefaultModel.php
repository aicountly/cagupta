<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * CRUD for engagement_type_quotation_defaults and listing with engagement metadata.
 */
class EngagementTypeQuotationDefaultModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * All engagement types with category/subcategory names and optional default row.
     *
     * @return array<int, array<string, mixed>>
     */
    public function listAllWithDefaults(): array
    {
        $stmt = $this->db->query(
            'SELECT et.id AS engagement_type_id,
                    et.name AS engagement_type_name,
                    c.id AS category_id,
                    c.name AS category_name,
                    sc.id AS subcategory_id,
                    sc.name AS subcategory_name,
                    et.pricing_model,
                    et.quotation_base_amount,
                    et.quotation_hourly_rate,
                    et.quotation_estimated_hours,
                    d.documents_required,
                    d.updated_at AS default_updated_at,
                    d.updated_by AS default_updated_by
             FROM engagement_types et
             INNER JOIN service_categories c ON c.id = et.category_id
             LEFT JOIN service_subcategories sc ON sc.id = et.subcategory_id
             LEFT JOIN engagement_type_quotation_defaults d ON d.engagement_type_id = et.id
             ORDER BY c.name ASC, sc.name ASC NULLS FIRST, et.name ASC'
        );
        return $stmt->fetchAll();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function findByEngagementTypeId(int $engagementTypeId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM engagement_type_quotation_defaults WHERE engagement_type_id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $engagementTypeId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * @param array<int, string> $documentsRequired
     */
    public function upsert(int $engagementTypeId, ?float $defaultPrice, array $documentsRequired, ?int $updatedBy): void
    {
        $json = json_encode(array_values($documentsRequired), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $stmt = $this->db->prepare(
            'INSERT INTO engagement_type_quotation_defaults (engagement_type_id, default_price, documents_required, updated_at, updated_by)
             VALUES (:eid, :price, CAST(:docs AS jsonb), NOW(), :uid)
             ON CONFLICT (engagement_type_id) DO UPDATE SET
                default_price = EXCLUDED.default_price,
                documents_required = EXCLUDED.documents_required,
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by'
        );
        $stmt->execute([
            ':eid'   => $engagementTypeId,
            ':price' => $defaultPrice,
            ':docs'  => $json,
            ':uid'   => $updatedBy,
        ]);
    }

    public function engagementTypeExists(int $engagementTypeId): bool
    {
        $stmt = $this->db->prepare('SELECT 1 FROM engagement_types WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $engagementTypeId]);
        return (bool)$stmt->fetchColumn();
    }

    /**
     * Count engagement types where quotation setup is incomplete:
     * missing valid pricing on engagement_types or no documents in defaults.
     */
    public function countIncompleteSetups(): int
    {
        $sql = 'SELECT COUNT(*) FROM engagement_types et
                LEFT JOIN engagement_type_quotation_defaults d ON d.engagement_type_id = et.id
                WHERE NOT (
                    (
                        (et.pricing_model = \'fixed\'
                         AND et.quotation_base_amount IS NOT NULL AND et.quotation_base_amount > 0)
                        OR (et.pricing_model = \'per_hour\'
                         AND et.quotation_hourly_rate IS NOT NULL AND et.quotation_hourly_rate > 0)
                        OR (et.pricing_model = \'fixed_plus_additional\'
                         AND et.quotation_base_amount IS NOT NULL AND et.quotation_base_amount > 0)
                    )
                    AND d.engagement_type_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements_text(COALESCE(d.documents_required, \'[]\'::jsonb)) AS t(x)
                        WHERE TRIM(t.x) <> \'\'
                    )
                )';
        return (int)$this->db->query($sql)->fetchColumn();
    }

    public function countEngagementTypes(): int
    {
        return (int)$this->db->query('SELECT COUNT(*) FROM engagement_types')->fetchColumn();
    }
}
