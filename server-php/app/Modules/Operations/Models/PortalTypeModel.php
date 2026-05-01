<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * PortalTypeModel — CRUD operations for the `portal_types` table.
 */
class PortalTypeModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Return all portal types (optionally filtered by organization).
     *
     * @return array<int, array<string, mixed>>
     */
    public function all(?int $organizationId = null): array
    {
        if ($organizationId !== null) {
            $stmt = $this->db->prepare(
                'SELECT * FROM portal_types WHERE organization_id = :org_id ORDER BY name ASC'
            );
            $stmt->execute([':org_id' => $organizationId]);
        } else {
            $stmt = $this->db->query('SELECT * FROM portal_types ORDER BY name ASC');
        }
        return $stmt->fetchAll();
    }

    /**
     * Find a portal type by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM portal_types WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Create a new portal type.
     *
     * @param array<string, mixed> $data
     * @return int The new record's id.
     */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO portal_types (organization_id, name, url, created_by)
             VALUES (:organization_id, :name, :url, :created_by)
             RETURNING id'
        );
        $stmt->execute([
            ':organization_id' => $data['organization_id'] ?? null,
            ':name'            => $data['name'],
            ':url'             => $data['url']             ?? null,
            ':created_by'      => $data['created_by']      ?? null,
        ]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Update an existing portal type.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE portal_types SET name = :name, url = :url WHERE id = :id'
        );
        return $stmt->execute([
            ':name' => $data['name'],
            ':url'  => $data['url'] ?? null,
            ':id'   => $id,
        ]);
    }

    /**
     * Delete a portal type by primary key.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM portal_types WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }

    /**
     * Check whether any credential uses this portal name.
     */
    public function isUsedByCredential(string $name): bool
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) FROM credentials_vault WHERE portal_name = :name'
        );
        $stmt->execute([':name' => $name]);
        return (int)$stmt->fetchColumn() > 0;
    }
}
