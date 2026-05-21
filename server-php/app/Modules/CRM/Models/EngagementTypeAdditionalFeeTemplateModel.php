<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * CRUD for engagement_type_additional_fee_templates.
 */
class EngagementTypeAdditionalFeeTemplateModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function forEngagementType(int $engagementTypeId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM engagement_type_additional_fee_templates
             WHERE engagement_type_id = :eid
             ORDER BY sort_order ASC, id ASC'
        );
        $stmt->execute([':eid' => $engagementTypeId]);
        return $stmt->fetchAll();
    }

    /**
     * @param array<int, int> $engagementTypeIds
     * @return array<int, array<int, array<string, mixed>>>
     */
    public function forEngagementTypeIds(array $engagementTypeIds): array
    {
        if ($engagementTypeIds === []) {
            return [];
        }
        $ids = array_values(array_unique(array_map('intval', $engagementTypeIds)));
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db->prepare(
            "SELECT * FROM engagement_type_additional_fee_templates
             WHERE engagement_type_id IN ({$placeholders})
             ORDER BY engagement_type_id ASC, sort_order ASC, id ASC"
        );
        $stmt->execute($ids);
        $rows = $stmt->fetchAll();
        $out  = [];
        foreach ($rows as $row) {
            $eid = (int)$row['engagement_type_id'];
            $out[$eid][] = $row;
        }
        return $out;
    }

    /**
     * Replace all templates for an engagement type.
     *
     * @param array<int, array<string, mixed>> $templates
     */
    public function replaceForEngagementType(int $engagementTypeId, array $templates): void
    {
        $del = $this->db->prepare(
            'DELETE FROM engagement_type_additional_fee_templates WHERE engagement_type_id = :eid'
        );
        $del->execute([':eid' => $engagementTypeId]);

        if ($templates === []) {
            return;
        }

        $ins = $this->db->prepare(
            'INSERT INTO engagement_type_additional_fee_templates
                (engagement_type_id, label, fee_type, fixed_amount, hourly_rate, sort_order)
             VALUES (:eid, :label, :fee_type, :fixed, :rate, :sort)'
        );

        foreach ($templates as $i => $t) {
            $ins->execute([
                ':eid'      => $engagementTypeId,
                ':label'    => trim((string)($t['label'] ?? '')),
                ':fee_type' => (string)($t['fee_type'] ?? 'fixed_per_event'),
                ':fixed'    => isset($t['fixed_amount']) && $t['fixed_amount'] !== '' && $t['fixed_amount'] !== null
                    ? round((float)$t['fixed_amount'], 2) : null,
                ':rate'     => isset($t['hourly_rate']) && $t['hourly_rate'] !== '' && $t['hourly_rate'] !== null
                    ? round((float)$t['hourly_rate'], 2) : null,
                ':sort'     => (int)($t['sort_order'] ?? $i),
            ]);
        }
    }
}
