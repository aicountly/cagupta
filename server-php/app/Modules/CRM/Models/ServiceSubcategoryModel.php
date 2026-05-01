<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * ServiceSubcategoryModel — CRUD for the `service_subcategories` table.
 */
class ServiceSubcategoryModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Find a subcategory.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM service_subcategories WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Return all subcategories for a category.
     *
     * @return array<int, array<string, mixed>>
     */
    public function forCategory(int $categoryId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM service_subcategories WHERE category_id = :cid ORDER BY name ASC'
        );
        $stmt->execute([':cid' => $categoryId]);
        return $stmt->fetchAll();
    }

    /**
     * Create a subcategory.
     */
    public function create(int $categoryId, string $name): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO service_subcategories (category_id, name) VALUES (:cid, :name) RETURNING id'
        );
        $stmt->execute([':cid' => $categoryId, ':name' => $name]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Delete a subcategory.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM service_subcategories WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }
}
