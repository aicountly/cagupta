<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * ServiceModel — CRUD operations for the `services` table.
 */
class ServiceModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Find a service by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT s.*,
                    c.first_name, c.last_name, c.organization_name,
                    COALESCE(c.organization_name,
                             TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))),
                             'Unknown') AS client_name,
                    u.name AS assigned_to_name,
                    cb.name AS created_by_name
             FROM services s
             LEFT JOIN clients c      ON c.id = s.client_id
             LEFT JOIN users   u      ON u.id = s.assigned_to
             LEFT JOIN users   cb     ON cb.id = s.created_by
             WHERE s.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Return a paginated list of services.
     *
     * @return array{total: int, services: array<int, array<string, mixed>>}
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
            $where[]           = "(s.service_type ILIKE :search
                                   OR c.first_name ILIKE :search
                                   OR c.last_name  ILIKE :search
                                   OR c.organization_name ILIKE :search)";
            $params[':search'] = "%{$search}%";
        }
        if ($status !== '') {
            $where[]           = 's.status = :status';
            $params[':status'] = $status;
        }

        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*)
             FROM services s
             LEFT JOIN clients c ON c.id = s.client_id
             WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT s.*,
                    COALESCE(c.organization_name,
                             TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))),
                             s.client_name,
                             'Unknown') AS client_name,
                    u.name AS assigned_to_name
             FROM services s
             LEFT JOIN clients c ON c.id = s.client_id
             LEFT JOIN users   u ON u.id = s.assigned_to
             WHERE {$whereClause}
             ORDER BY s.created_at DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit',  $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset,  PDO::PARAM_INT);
        $stmt->execute();

        return ['total' => $total, 'services' => $stmt->fetchAll()];
    }

    /**
     * Create a new service record.
     *
     * @param array<string, mixed> $data
     * @return int The new service's id.
     */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO services (
                client_id, organization_id, service_type, description,
                financial_year, due_date, status, priority, assigned_to,
                fees, notes, created_by,
                client_type, client_name,
                category_id, category_name,
                subcategory_id, subcategory_name,
                engagement_type_id, engagement_type_name,
                tasks
             ) VALUES (
                :client_id, :organization_id, :service_type, :description,
                :financial_year, :due_date, :status, :priority, :assigned_to,
                :fees, :notes, :created_by,
                :client_type, :client_name,
                :category_id, :category_name,
                :subcategory_id, :subcategory_name,
                :engagement_type_id, :engagement_type_name,
                :tasks
             ) RETURNING id'
        );
        $stmt->execute([
            ':client_id'           => $data['client_id']           ?? null,
            ':organization_id'     => $data['organization_id']     ?? null,
            ':service_type'        => $data['service_type']        ?? null,
            ':description'         => $data['description']         ?? null,
            ':financial_year'      => $data['financial_year']      ?? null,
            ':due_date'            => $data['due_date']            ?? null,
            ':status'              => $data['status']              ?? 'not_started',
            ':priority'            => $data['priority']            ?? 'medium',
            ':assigned_to'         => $data['assigned_to']         ?? null,
            ':fees'                => $data['fees']                ?? null,
            ':notes'               => $data['notes']               ?? null,
            ':created_by'          => $data['created_by']          ?? null,
            ':client_type'         => $data['client_type']         ?? 'contact',
            ':client_name'         => $data['client_name']         ?? null,
            ':category_id'         => $data['category_id']         ?? null,
            ':category_name'       => $data['category_name']       ?? null,
            ':subcategory_id'      => $data['subcategory_id']      ?? null,
            ':subcategory_name'    => $data['subcategory_name']    ?? null,
            ':engagement_type_id'  => $data['engagement_type_id']  ?? null,
            ':engagement_type_name'=> $data['engagement_type_name'] ?? null,
            ':tasks'               => isset($data['tasks']) ? json_encode($data['tasks']) : '[]',
        ]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Update an existing service.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $setClauses = [];
        $params     = [':id' => $id];

        $allowed = ['status', 'assigned_to', 'due_date', 'fees', 'notes', 'priority', 'service_type', 'financial_year'];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $setClauses[]       = "{$field} = :{$field}";
                $params[":{$field}"] = $data[$field];
            }
        }
        if (array_key_exists('tasks', $data)) {
            $setClauses[]    = 'tasks = :tasks';
            $params[':tasks'] = json_encode($data['tasks']);
        }

        if (empty($setClauses)) {
            return false;
        }

        $setClauses[] = 'updated_at = NOW()';
        $setClause    = implode(', ', $setClauses);

        $stmt = $this->db->prepare("UPDATE services SET {$setClause} WHERE id = :id");
        return $stmt->execute($params);
    }

    /**
     * Delete a service record permanently.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM services WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }
}
