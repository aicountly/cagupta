<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * RoleModel — CRUD operations for the `roles` table.
 */
class RoleModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Return all roles.
     *
     * @return array<int, array<string, mixed>>
     */
    public function all(): array
    {
        $stmt = $this->db->query('SELECT * FROM roles ORDER BY id');
        return $stmt->fetchAll();
    }

    /**
     * Find a role by name.
     *
     * @return array<string, mixed>|null
     */
    public function findByName(string $name): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM roles WHERE name = :name LIMIT 1');
        $stmt->execute([':name' => $name]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Find a role by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM roles WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Update a role's permissions JSON.
     *
     * @param array<string, mixed> $permissions
     */
    public function updatePermissions(int $id, array $permissions): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE roles SET permissions = :permissions WHERE id = :id AND name != \'super_admin\''
        );
        return $stmt->execute([
            ':permissions' => json_encode($permissions, JSON_THROW_ON_ERROR),
            ':id'          => $id,
        ]);
    }
}
