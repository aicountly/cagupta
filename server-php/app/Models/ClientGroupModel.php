<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * ClientGroupModel — CRUD operations for the `client_groups` table.
 *
 * Groups are shared between contacts (clients) and organizations.
 * All queries use PDO prepared statements; no raw string interpolation.
 */
class ClientGroupModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Return all groups with member counts.
     *
     * @return array<int, array<string, mixed>>
     */
    public function all(): array
    {
        $stmt = $this->db->query(
            "SELECT g.*,
                    (SELECT COUNT(*) FROM clients c      WHERE c.group_id = g.id) AS contact_count,
                    (SELECT COUNT(*) FROM organizations o WHERE o.group_id = g.id) AS org_count
             FROM client_groups g
             ORDER BY g.name ASC"
        );
        return $stmt->fetchAll();
    }

    /**
     * Find a single group by ID.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT g.*,
                    (SELECT COUNT(*) FROM clients c      WHERE c.group_id = g.id) AS contact_count,
                    (SELECT COUNT(*) FROM organizations o WHERE o.group_id = g.id) AS org_count
             FROM client_groups g
             WHERE g.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Return the contacts and organizations belonging to a group.
     *
     * @return array{contacts: array<int, array<string, mixed>>, organizations: array<int, array<string, mixed>>}
     */
    public function members(int $id): array
    {
        $cStmt = $this->db->prepare(
            "SELECT id,
                    COALESCE(organization_name, TRIM(CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,'')))) AS display_name,
                    email, phone, is_active
             FROM clients
             WHERE group_id = :id
             ORDER BY display_name ASC"
        );
        $cStmt->execute([':id' => $id]);

        $oStmt = $this->db->prepare(
            "SELECT id, name AS display_name, email, phone, is_active
             FROM organizations
             WHERE group_id = :id
             ORDER BY name ASC"
        );
        $oStmt->execute([':id' => $id]);

        return [
            'contacts'      => $cStmt->fetchAll(),
            'organizations' => $oStmt->fetchAll(),
        ];
    }

    /**
     * Create a new group.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>  The newly-created group row.
     */
    public function create(array $data): array
    {
        $stmt = $this->db->prepare(
            "INSERT INTO client_groups (name, description, color, created_by)
             VALUES (:name, :description, :color, :created_by)
             RETURNING *"
        );
        $stmt->execute([
            ':name'        => $data['name'],
            ':description' => $data['description'] ?? null,
            ':color'       => $data['color']       ?? '#6366f1',
            ':created_by'  => $data['created_by']  ?? null,
        ]);
        return $stmt->fetch();
    }

    /**
     * Update an existing group.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $setClauses = [];
        $params     = [':id' => $id];

        foreach (['name', 'description', 'color'] as $field) {
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

        $stmt = $this->db->prepare("UPDATE client_groups SET {$setClause} WHERE id = :id");
        return $stmt->execute($params);
    }

    /**
     * Delete a group. The FK ON DELETE SET NULL ensures members' group_id is nulled.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM client_groups WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }
}
