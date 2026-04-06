<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * ServiceCategoryModel — CRUD for the `service_categories` table.
 *
 * Returns categories with nested subcategories and engagement types
 * so the frontend can build the full catalog in one call.
 */
class ServiceCategoryModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Return all categories with their subcategories and engagement types.
     *
     * @return array<int, array<string, mixed>>
     */
    public function allWithChildren(): array
    {
        // Fetch all categories
        $catStmt = $this->db->query(
            'SELECT * FROM service_categories ORDER BY name ASC'
        );
        $categories = $catStmt->fetchAll();

        foreach ($categories as &$cat) {
            // Subcategories
            $subStmt = $this->db->prepare(
                'SELECT * FROM service_subcategories WHERE category_id = :cid ORDER BY name ASC'
            );
            $subStmt->execute([':cid' => $cat['id']]);
            $cat['subcategories'] = $subStmt->fetchAll();

            // Engagement types
            $etStmt = $this->db->prepare(
                'SELECT * FROM engagement_types WHERE category_id = :cid ORDER BY name ASC'
            );
            $etStmt->execute([':cid' => $cat['id']]);
            $cat['engagementTypes'] = $etStmt->fetchAll();
        }
        unset($cat);

        return $categories;
    }

    /**
     * Find a single category.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM service_categories WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Create a category.
     */
    public function create(string $name): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO service_categories (name) VALUES (:name) RETURNING id'
        );
        $stmt->execute([':name' => $name]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Delete a category and its children.
     */
    public function delete(int $id): bool
    {
        // Children are deleted by ON DELETE CASCADE in the migration
        $stmt = $this->db->prepare('DELETE FROM service_categories WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }
}
