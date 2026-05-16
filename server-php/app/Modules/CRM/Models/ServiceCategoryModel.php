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
            $subcategories = $subStmt->fetchAll();

            // Engagement types (all for this category, including those linked to subcategories)
            $etStmt = $this->db->prepare(
                'SELECT * FROM engagement_types WHERE category_id = :cid ORDER BY name ASC'
            );
            $etStmt->execute([':cid' => $cat['id']]);
            $allEngagementTypes = $etStmt->fetchAll();

            // Nest engagement types under their subcategory when subcategory_id is set
            $etBySubcat = [];
            $catLevelEt  = [];
            foreach ($allEngagementTypes as $et) {
                if (!empty($et['subcategory_id'])) {
                    $etBySubcat[(int)$et['subcategory_id']][] = $et;
                } else {
                    $catLevelEt[] = $et;
                }
            }

            foreach ($subcategories as &$sub) {
                $sub['engagementTypes'] = $etBySubcat[$sub['id']] ?? [];
            }
            unset($sub);

            $cat['subcategories']   = $subcategories;
            // Keep category-level engagement types (those without a subcategory) for backward compatibility
            $cat['engagementTypes'] = $catLevelEt;
        }
        unset($cat);

        return self::sanitizeCatalogTree($categories);
    }

    /**
     * Normalise catalog rows for JSON encoding (api_success uses JSON_THROW_ON_ERROR).
     * Handles PDO/pg edge cases: NaN/INF floats, resources, DateTime-like objects.
     *
     * @param mixed $value
     * @return mixed
     */
    private static function sanitizeCatalogTree(mixed $value): mixed
    {
        if (is_array($value)) {
            $out = [];
            foreach ($value as $k => $item) {
                $out[$k] = self::sanitizeCatalogTree($item);
            }
            return $out;
        }
        if (is_float($value) && (is_nan($value) || is_infinite($value))) {
            return null;
        }
        if (is_resource($value)) {
            $contents = @stream_get_contents($value);

            return ($contents !== false && $contents !== '') ? $contents : '';
        }
        if ($value instanceof \DateTimeInterface) {
            return $value->format(\DateTimeInterface::ATOM);
        }

        return $value;
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
     * Rename a category (primary key unchanged).
     */
    public function updateName(int $id, string $name): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE service_categories SET name = :name, updated_at = NOW() WHERE id = :id'
        );
        return $stmt->execute([':name' => $name, ':id' => $id]);
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
