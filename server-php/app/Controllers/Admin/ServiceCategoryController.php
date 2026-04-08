<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\ServiceCategoryModel;
use App\Models\ServiceSubcategoryModel;
use App\Models\EngagementTypeModel;

/**
 * ServiceCategoryController — CRUD for service categories, subcategories,
 * and engagement types (used by the Service Configuration settings tab).
 *
 * All endpoints require Bearer token + role: super_admin or admin.
 */
class ServiceCategoryController extends BaseController
{
    private ServiceCategoryModel    $categories;
    private ServiceSubcategoryModel $subcategories;
    private EngagementTypeModel     $engagementTypes;

    public function __construct()
    {
        $this->categories      = new ServiceCategoryModel();
        $this->subcategories   = new ServiceSubcategoryModel();
        $this->engagementTypes = new EngagementTypeModel();
    }

    // ── GET /api/admin/service-categories ────────────────────────────────────

    /**
     * Return all categories with nested subcategories and engagement types.
     */
    public function index(): never
    {
        $data = $this->categories->allWithChildren();
        $this->success($data, 'Service categories retrieved');
    }

    // ── POST /api/admin/service-categories ───────────────────────────────────

    /**
     * Create a new service category.
     *
     * Body: { name }
     */
    public function store(): never
    {
        $body = $this->getJsonBody();
        $name = trim((string)($body['name'] ?? ''));

        if ($name === '') {
            $this->error('Category name is required.', 422);
        }

        $newId = $this->categories->create($name);
        $cat   = $this->categories->find($newId);
        $this->success($cat, 'Category created', 201);
    }

    // ── DELETE /api/admin/service-categories/:id ─────────────────────────────

    /**
     * Delete a service category (and its subcategories + engagement types via CASCADE).
     */
    public function destroy(int $id): never
    {
        $cat = $this->categories->find($id);
        if ($cat === null) {
            $this->error('Category not found.', 404);
        }

        $this->categories->delete($id);
        $this->success(null, 'Category deleted');
    }

    // ── GET /api/admin/service-categories/:id/subcategories ──────────────────

    /**
     * Return subcategories for a category.
     */
    public function subcategoryIndex(int $categoryId): never
    {
        $data = $this->subcategories->forCategory($categoryId);
        $this->success($data, 'Subcategories retrieved');
    }

    // ── POST /api/admin/service-categories/:id/subcategories ─────────────────

    /**
     * Create a subcategory under a category.
     *
     * Body: { name }
     */
    public function subcategoryStore(int $categoryId): never
    {
        $cat = $this->categories->find($categoryId);
        if ($cat === null) {
            $this->error('Category not found.', 404);
        }

        $body = $this->getJsonBody();
        $name = trim((string)($body['name'] ?? ''));

        if ($name === '') {
            $this->error('Subcategory name is required.', 422);
        }

        $newId = $this->subcategories->create($categoryId, $name);
        $sub   = $this->subcategories->find($newId);
        $this->success($sub, 'Subcategory created', 201);
    }

    // ── DELETE /api/admin/service-subcategories/:id ───────────────────────────

    /**
     * Delete a subcategory.
     */
    public function subcategoryDestroy(int $id): never
    {
        $sub = $this->subcategories->find($id);
        if ($sub === null) {
            $this->error('Subcategory not found.', 404);
        }

        $this->subcategories->delete($id);
        $this->success(null, 'Subcategory deleted');
    }

    // ── GET /api/admin/service-categories/:id/engagement-types ───────────────

    /**
     * Return engagement types for a category.
     */
    public function engagementTypeIndex(int $categoryId): never
    {
        $data = $this->engagementTypes->forCategory($categoryId);
        $this->success($data, 'Engagement types retrieved');
    }

    // ── POST /api/admin/service-categories/:id/engagement-types ──────────────

    /**
     * Create an engagement type under a category.
     * Optionally accepts subcategory_id in the body to link it to a subcategory.
     *
     * Body: { name, subcategory_id? }
     */
    public function engagementTypeStore(int $categoryId): never
    {
        $cat = $this->categories->find($categoryId);
        if ($cat === null) {
            $this->error('Category not found.', 404);
        }

        $body = $this->getJsonBody();
        $name = trim((string)($body['name'] ?? ''));

        if ($name === '') {
            $this->error('Engagement type name is required.', 422);
        }

        $subcategoryId = isset($body['subcategory_id']) && $body['subcategory_id'] !== ''
            ? (int)$body['subcategory_id']
            : null;

        // Validate subcategory belongs to this category
        if ($subcategoryId !== null) {
            $sub = $this->subcategories->find($subcategoryId);
            if ($sub === null || (int)$sub['category_id'] !== $categoryId) {
                $this->error('Subcategory not found or does not belong to this category.', 422);
            }
        }

        $newId = $this->engagementTypes->create($categoryId, $name, $subcategoryId);
        $et    = $this->engagementTypes->find($newId);
        $this->success($et, 'Engagement type created', 201);
    }

    // ── POST /api/admin/service-subcategories/:id/engagement-types ────────────

    /**
     * Create an engagement type directly under a subcategory.
     *
     * Body: { name }
     */
    public function engagementTypeStoreForSubcategory(int $subcategoryId): never
    {
        $sub = $this->subcategories->find($subcategoryId);
        if ($sub === null) {
            $this->error('Subcategory not found.', 404);
        }

        $body = $this->getJsonBody();
        $name = trim((string)($body['name'] ?? ''));

        if ($name === '') {
            $this->error('Engagement type name is required.', 422);
        }

        $categoryId = (int)$sub['category_id'];
        $newId      = $this->engagementTypes->create($categoryId, $name, $subcategoryId);
        $et         = $this->engagementTypes->find($newId);
        $this->success($et, 'Engagement type created', 201);
    }

    // ── DELETE /api/admin/engagement-types/:id ────────────────────────────────

    /**
     * Delete an engagement type.
     */
    public function engagementTypeDestroy(int $id): never
    {
        $et = $this->engagementTypes->find($id);
        if ($et === null) {
            $this->error('Engagement type not found.', 404);
        }

        $this->engagementTypes->delete($id);
        $this->success(null, 'Engagement type deleted');
    }
}
