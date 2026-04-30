<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * RegisterModel — CRUD + queries for the `registers` compliance table.
 *
 * Each register row represents one expected/actual return filing for a
 * client/organisation in a given period.  Rows are created either by the
 * RecurringServiceDefinitionModel::generatePeriods() bulk-insert, manually
 * through the admin UI, or automatically when a service engagement is
 * marked "completed" (ServiceController completion hook).
 */
class RegisterModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    // ── READ ─────────────────────────────────────────────────────────────────

    /**
     * Fetch a single register row with joined names.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $sql = $this->baseSelect() . ' WHERE r.id = :id LIMIT 1';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Paginated list with optional filters.
     *
     * @param array<string, mixed> $filters
     * @return array{rows: array<int, array<string, mixed>>, total: int}
     */
    public function paginate(array $filters = [], int $page = 1, int $perPage = 50): array
    {
        $where  = [];
        $params = [];

        if (!empty($filters['register_category'])) {
            $where[]  = 'r.register_category = :reg_cat';
            $params[':reg_cat'] = $filters['register_category'];
        }

        if (!empty($filters['status'])) {
            if ($filters['status'] === 'overdue') {
                $where[]  = "(r.status = 'pending' AND r.due_date < CURRENT_DATE)";
            } else {
                $where[]  = 'r.status = :status';
                $params[':status'] = $filters['status'];
            }
        }

        if (!empty($filters['client_id'])) {
            $where[]  = 'r.client_id = :client_id';
            $params[':client_id'] = (int)$filters['client_id'];
        }

        if (!empty($filters['organization_id'])) {
            $where[]  = 'r.organization_id = :org_id';
            $params[':org_id'] = (int)$filters['organization_id'];
        }

        if (!empty($filters['engagement_type_id'])) {
            $where[]  = 'r.engagement_type_id = :et_id';
            $params[':et_id'] = (int)$filters['engagement_type_id'];
        }

        if (!empty($filters['period_label'])) {
            $where[]  = 'r.period_label ILIKE :period';
            $params[':period'] = '%' . $filters['period_label'] . '%';
        }

        if (!empty($filters['date_from'])) {
            $where[]  = 'r.due_date >= :date_from';
            $params[':date_from'] = $filters['date_from'];
        }

        if (!empty($filters['date_to'])) {
            $where[]  = 'r.due_date <= :date_to';
            $params[':date_to'] = $filters['date_to'];
        }

        if (!empty($filters['search'])) {
            $where[]  = "(c.name ILIKE :search OR o.name ILIKE :search OR r.return_type ILIKE :search OR r.period_label ILIKE :search OR r.acknowledgment_number ILIKE :search)";
            $params[':search'] = '%' . $filters['search'] . '%';
        }

        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        $offset      = ($page - 1) * $perPage;

        $countSql = "
            SELECT COUNT(*) FROM registers r
            LEFT JOIN clients       c  ON c.id  = r.client_id
            LEFT JOIN organizations o  ON o.id  = r.organization_id
            {$whereClause}
        ";
        $countStmt = $this->db->prepare($countSql);
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $sql = $this->baseSelect() . " {$whereClause}
            ORDER BY r.due_date ASC, r.id ASC
            LIMIT :limit OFFSET :offset";

        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit',  $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset,  PDO::PARAM_INT);
        $stmt->execute();

        return [
            'rows'  => $stmt->fetchAll(),
            'total' => $total,
        ];
    }

    /**
     * Count pending, overdue, and filed rows per register_category.
     * Used to build status summary counts.
     *
     * @return array<string, array{pending: int, overdue: int, filed: int, total: int}>
     */
    public function countsByCategory(): array
    {
        $sql = "
            SELECT
                register_category,
                COUNT(*) FILTER (WHERE status = 'filed')                            AS filed,
                COUNT(*) FILTER (WHERE status = 'pending' AND due_date >= CURRENT_DATE) AS pending,
                COUNT(*) FILTER (WHERE status = 'pending' AND due_date <  CURRENT_DATE) AS overdue,
                COUNT(*) AS total
            FROM registers
            WHERE register_category IS NOT NULL
            GROUP BY register_category
        ";
        $stmt = $this->db->query($sql);
        $rows = $stmt->fetchAll();
        $out = [];
        foreach ($rows as $row) {
            $cat = (string)$row['register_category'];
            $out[$cat] = [
                'filed'   => (int)$row['filed'],
                'pending' => (int)$row['pending'],
                'overdue' => (int)$row['overdue'],
                'total'   => (int)$row['total'],
            ];
        }
        return $out;
    }

    // ── WRITE ────────────────────────────────────────────────────────────────

    /**
     * Create a new register entry manually.
     *
     * @param array<string, mixed> $data
     */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare("
            INSERT INTO registers (
                register_type, client_id, organization_id, engagement_type_id,
                register_category, return_type, period_label, period_start, period_end,
                due_date, filed_date, status, reference_number, acknowledgment_number,
                error_number, late_fee, notes, service_id, recurring_definition_id,
                filed_by, created_by
            ) VALUES (
                :register_type, :client_id, :organization_id, :engagement_type_id,
                :register_category, :return_type, :period_label, :period_start, :period_end,
                :due_date, :filed_date, :status, :reference_number, :acknowledgment_number,
                :error_number, :late_fee, :notes, :service_id, :recurring_definition_id,
                :filed_by, :created_by
            ) RETURNING id
        ");

        $stmt->execute([
            ':register_type'         => $data['register_type']         ?? ($data['register_category'] ?? 'general'),
            ':client_id'             => $data['client_id']             ?? null,
            ':organization_id'       => $data['organization_id']       ?? null,
            ':engagement_type_id'    => $data['engagement_type_id']    ?? null,
            ':register_category'     => $data['register_category']     ?? null,
            ':return_type'           => $data['return_type']           ?? null,
            ':period_label'          => $data['period_label']          ?? null,
            ':period_start'          => $data['period_start']          ?? null,
            ':period_end'            => $data['period_end']            ?? null,
            ':due_date'              => $data['due_date']              ?? null,
            ':filed_date'            => $data['filed_date']            ?? null,
            ':status'                => $data['status']                ?? 'pending',
            ':reference_number'      => $data['reference_number']      ?? null,
            ':acknowledgment_number' => $data['acknowledgment_number'] ?? null,
            ':error_number'          => $data['error_number']          ?? null,
            ':late_fee'              => $data['late_fee']              ?? null,
            ':notes'                 => $data['notes']                 ?? null,
            ':service_id'            => $data['service_id']            ?? null,
            ':recurring_definition_id' => $data['recurring_definition_id'] ?? null,
            ':filed_by'              => $data['filed_by']              ?? null,
            ':created_by'            => $data['created_by']            ?? null,
        ]);

        return (int)$stmt->fetchColumn();
    }

    /**
     * Update an existing register row (partial update — only provided keys).
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $allowed = [
            'status', 'filed_date', 'filed_by', 'acknowledgment_number',
            'error_number', 'late_fee', 'notes', 'service_id',
            'reference_number', 'due_date', 'period_label',
        ];
        $sets   = [];
        $params = [':id' => $id];

        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $sets[]          = "{$field} = :{$field}";
                $params[":{$field}"] = $data[$field];
            }
        }

        if ($sets === []) {
            return false;
        }

        $sets[] = 'updated_at = NOW()';
        $sql    = 'UPDATE registers SET ' . implode(', ', $sets) . ' WHERE id = :id';
        $stmt   = $this->db->prepare($sql);
        return $stmt->execute($params);
    }

    /**
     * Delete a register row.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM registers WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }

    /**
     * Find an existing row matching client/org + engagement_type + period_start,
     * or create a new one if none exists. Returns the row id.
     *
     * Used by the ServiceController completion hook and by generatePeriods().
     *
     * @param array<string, mixed> $data
     */
    public function findOrCreateForPeriod(array $data): int
    {
        $clientId  = isset($data['client_id'])  ? (int)$data['client_id']  : null;
        $orgId     = isset($data['organization_id']) ? (int)$data['organization_id'] : null;
        $etId      = (int)($data['engagement_type_id'] ?? 0);
        $periodStart = $data['period_start'] ?? null;

        if ($etId === 0 || $periodStart === null) {
            return $this->create($data);
        }

        // Try to find existing
        if ($clientId !== null) {
            $stmt = $this->db->prepare("
                SELECT id FROM registers
                WHERE client_id = :cid AND engagement_type_id = :et AND period_start = :ps
                LIMIT 1
            ");
            $stmt->execute([':cid' => $clientId, ':et' => $etId, ':ps' => $periodStart]);
        } else {
            $stmt = $this->db->prepare("
                SELECT id FROM registers
                WHERE organization_id = :oid AND engagement_type_id = :et AND period_start = :ps
                LIMIT 1
            ");
            $stmt->execute([':oid' => $orgId, ':et' => $etId, ':ps' => $periodStart]);
        }

        $existing = $stmt->fetchColumn();
        if ($existing !== false) {
            $existingId = (int)$existing;
            // Update the existing row with the new data (filing info)
            $updateData = array_filter([
                'status'                => $data['status']                ?? null,
                'filed_date'            => $data['filed_date']            ?? null,
                'filed_by'              => $data['filed_by']              ?? null,
                'service_id'            => $data['service_id']            ?? null,
                'acknowledgment_number' => $data['acknowledgment_number'] ?? null,
                'error_number'          => $data['error_number']          ?? null,
            ], fn($v) => $v !== null);
            if ($updateData !== []) {
                $this->update($existingId, $updateData);
            }
            return $existingId;
        }

        return $this->create($data);
    }

    // ── PRIVATE ───────────────────────────────────────────────────────────────

    private function baseSelect(): string
    {
        return "
            SELECT
                r.*,
                COALESCE(c.name, o.name)        AS client_name,
                c.pan                            AS client_pan,
                c.gstin                          AS client_gstin,
                o.gstin                          AS org_gstin,
                o.cin                            AS org_cin,
                et.name                          AS engagement_type_name,
                u_filed.name                     AS filed_by_name,
                u_created.name                   AS created_by_name
            FROM registers r
            LEFT JOIN clients       c         ON c.id  = r.client_id
            LEFT JOIN organizations o         ON o.id  = r.organization_id
            LEFT JOIN engagement_types et     ON et.id = r.engagement_type_id
            LEFT JOIN users         u_filed   ON u_filed.id   = r.filed_by
            LEFT JOIN users         u_created ON u_created.id = r.created_by
        ";
    }
}
