<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * LeadModel — CRUD operations for the `leads` table.
 */
class LeadModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Find a lead by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT l.*, u.name AS assigned_to_name
             FROM leads l
             LEFT JOIN users u ON u.id = l.assigned_to
             WHERE l.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Return a paginated list of leads.
     *
     * @return array{total: int, leads: array<int, array<string, mixed>>}
     */
    public function paginate(
        int    $page    = 1,
        int    $perPage = 20,
        string $search  = '',
        string $status  = ''
    ): array {
        $where  = ['1=1'];
        $params = [];

        if ($search !== '') {
            $where[]           = "(l.name ILIKE :search OR l.email ILIKE :search OR l.phone ILIKE :search)";
            $params[':search'] = "%{$search}%";
        }
        if ($status !== '') {
            $where[]           = 'l.status = :status';
            $params[':status'] = $status;
        }

        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM leads l WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT l.*, u.name AS assigned_to_name
             FROM leads l
             LEFT JOIN users u ON u.id = l.assigned_to
             WHERE {$whereClause}
             ORDER BY l.created_at DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit',  $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset,  PDO::PARAM_INT);
        $stmt->execute();

        return ['total' => $total, 'leads' => $stmt->fetchAll()];
    }

    /**
     * Create a new lead record.
     *
     * @param array<string, mixed> $data
     * @return int The new lead's id.
     */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO leads (
                name, company, email, phone, source, service_interest,
                estimated_value, status, probability, assigned_to,
                notes, follow_up_date, created_by
             ) VALUES (
                :name, :company, :email, :phone, :source, :service_interest,
                :estimated_value, :status, :probability, :assigned_to,
                :notes, :follow_up_date, :created_by
             ) RETURNING id'
        );
        $stmt->execute([
            ':name'             => $data['name']             ?? '',
            ':company'          => $data['company']          ?? null,
            ':email'            => $data['email']            ?? null,
            ':phone'            => $data['phone']            ?? null,
            ':source'           => $data['source']           ?? null,
            ':service_interest' => $data['service_interest'] ?? null,
            ':estimated_value'  => $data['estimated_value']  ?? null,
            ':status'           => $data['status']           ?? 'new',
            ':probability'      => $data['probability']      ?? 50,
            ':assigned_to'      => $data['assigned_to']      ?? null,
            ':notes'            => $data['notes']            ?? null,
            ':follow_up_date'   => $data['follow_up_date']   ?? null,
            ':created_by'       => $data['created_by']       ?? null,
        ]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Update an existing lead.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $setClauses = [];
        $params     = [':id' => $id];

        $allowed = [
            'name', 'company', 'email', 'phone', 'source',
            'service_interest', 'estimated_value', 'status',
            'probability', 'assigned_to', 'notes', 'follow_up_date',
        ];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $setClauses[]       = "{$field} = :{$field}";
                $params[":{$field}"] = $data[$field];
            }
        }

        if (empty($setClauses)) {
            return false;
        }

        $setClauses[] = 'updated_at = NOW()';
        $setClause    = implode(', ', $setClauses);

        $stmt = $this->db->prepare("UPDATE leads SET {$setClause} WHERE id = :id");
        return $stmt->execute($params);
    }

    /**
     * Delete a lead record.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM leads WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }
}
