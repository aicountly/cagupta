<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * RecoveryLogModel — CRUD for the `recovery_logs` table.
 *
 * Each row is one follow-up event for a client or organization.
 * Multiple logs per entity are supported; the most-recent row
 * drives the "Due Date" shown in the Recovery List.
 */
class RecoveryLogModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Return all logs for an entity, newest first.
     *
     * @return list<array<string, mixed>>
     */
    public function listByEntity(string $entityType, int $entityId): array
    {
        $stmt = $this->db->prepare(
            'SELECT rl.*, u.full_name AS created_by_name
             FROM recovery_logs rl
             LEFT JOIN users u ON u.id = rl.created_by
             WHERE rl.entity_type = :entity_type
               AND rl.entity_id   = :entity_id
             ORDER BY rl.created_at DESC, rl.id DESC'
        );
        $stmt->execute([
            ':entity_type' => $entityType,
            ':entity_id'   => $entityId,
        ]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * Insert a new recovery log row and return it.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function create(array $data): array
    {
        $stmt = $this->db->prepare(
            'INSERT INTO recovery_logs
                (entity_type, entity_id, log_date, followup_details, client_response,
                 next_followup_date, next_followup_details, revised_due_date, created_by)
             VALUES
                (:entity_type, :entity_id, :log_date, :followup_details, :client_response,
                 :next_followup_date, :next_followup_details, :revised_due_date, :created_by)
             RETURNING *'
        );
        $stmt->execute([
            ':entity_type'          => $data['entity_type'],
            ':entity_id'            => (int)$data['entity_id'],
            ':log_date'             => $data['log_date'] ?? date('Y-m-d'),
            ':followup_details'     => $data['followup_details'] ?? null,
            ':client_response'      => $data['client_response'] ?? null,
            ':next_followup_date'   => $data['next_followup_date'] ?? null,
            ':next_followup_details'=> $data['next_followup_details'] ?? null,
            ':revised_due_date'     => $data['revised_due_date'] ?? null,
            ':created_by'           => isset($data['created_by']) ? (int)$data['created_by'] : null,
        ]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * Update an existing log row and return it.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>|null
     */
    public function update(int $id, array $data): ?array
    {
        $allowed = [
            'log_date', 'followup_details', 'client_response',
            'next_followup_date', 'next_followup_details', 'revised_due_date',
        ];

        $setClauses = [];
        $params     = [':id' => $id];

        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $setClauses[] = "{$field} = :{$field}";
                $params[":{$field}"] = $data[$field] === '' ? null : $data[$field];
            }
        }

        if ($setClauses === []) {
            return null;
        }

        $setClauses[] = 'updated_at = NOW()';
        $sql = 'UPDATE recovery_logs SET ' . implode(', ', $setClauses)
             . ' WHERE id = :id RETURNING *';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    /**
     * Bulk-fetch the latest log per entity for use in the recovery report.
     *
     * $entityPairs example: [['client', 1], ['organization', 5], ...]
     *
     * Returns a map keyed by "client:1" / "organization:5" etc.
     * Each value: { id, revised_due_date, next_followup_date, log_date }
     *
     * @param list<array{0: string, 1: int}> $entityPairs
     * @return array<string, array<string, mixed>>
     */
    public function latestPerEntity(array $entityPairs): array
    {
        if ($entityPairs === []) {
            return [];
        }

        // Build a VALUES list: (entity_type, entity_id)
        $valueParts = [];
        $params     = [];
        foreach ($entityPairs as $i => [$et, $eid]) {
            $tk = ':et' . $i;
            $ek = ':eid' . $i;
            $valueParts[] = "({$tk}, {$ek})";
            $params[$tk]  = $et;
            $params[$ek]  = $eid;
        }

        $valuesClause = implode(',', $valueParts);

        $sql = "
            SELECT DISTINCT ON (rl.entity_type, rl.entity_id)
                   rl.id, rl.entity_type, rl.entity_id,
                   rl.revised_due_date, rl.next_followup_date, rl.log_date
            FROM   recovery_logs rl
            JOIN  (VALUES {$valuesClause}) AS pairs(et, eid)
                ON rl.entity_type = pairs.et AND rl.entity_id = pairs.eid::integer
            ORDER BY rl.entity_type, rl.entity_id, rl.created_at DESC, rl.id DESC
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $out = [];
        foreach ($rows as $row) {
            $key        = $row['entity_type'] . ':' . $row['entity_id'];
            $out[$key]  = [
                'id'                 => (int)$row['id'],
                'revised_due_date'   => $row['revised_due_date'],
                'next_followup_date' => $row['next_followup_date'],
                'log_date'           => $row['log_date'],
            ];
        }

        return $out;
    }
}
