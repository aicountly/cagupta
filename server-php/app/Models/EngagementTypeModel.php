<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * EngagementTypeModel — CRUD for the `engagement_types` table.
 */
class EngagementTypeModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Find an engagement type.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM engagement_types WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Return all engagement types for a category.
     *
     * @return array<int, array<string, mixed>>
     */
    public function forCategory(int $categoryId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM engagement_types WHERE category_id = :cid ORDER BY name ASC'
        );
        $stmt->execute([':cid' => $categoryId]);
        return $stmt->fetchAll();
    }

    /**
     * Return all engagement types for a subcategory.
     *
     * @return array<int, array<string, mixed>>
     */
    public function forSubcategory(int $subcategoryId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM engagement_types WHERE subcategory_id = :sid ORDER BY name ASC'
        );
        $stmt->execute([':sid' => $subcategoryId]);
        return $stmt->fetchAll();
    }

    /**
     * Count engagement types linked to a subcategory.
     */
    public function countBySubcategoryId(int $subcategoryId): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) FROM engagement_types WHERE subcategory_id = :sid'
        );
        $stmt->execute([':sid' => $subcategoryId]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Create an engagement type.
     *
     * @param int         $categoryId
     * @param string      $name
     * @param int|null    $subcategoryId  Optional subcategory to assign this type to.
     */
    public function create(int $categoryId, string $name, ?int $subcategoryId = null): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO engagement_types (category_id, subcategory_id, name)
             VALUES (:cid, :sid, :name) RETURNING id'
        );
        $stmt->execute([':cid' => $categoryId, ':sid' => $subcategoryId, ':name' => $name]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Delete an engagement type.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM engagement_types WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }
}
