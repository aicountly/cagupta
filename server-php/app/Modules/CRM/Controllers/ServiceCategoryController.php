<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Database;
use App\Controllers\BaseController;
use JsonException;
use App\Models\ServiceCategoryModel;
use App\Models\ServiceSubcategoryModel;
use App\Models\EngagementTypeModel;
use App\Models\ServiceModel;
use App\Models\LeadModel;
use App\Models\RecurringServiceDefinitionModel;
use App\Models\RegisterModel;

/**
 * ServiceCategoryController — CRUD for service categories, subcategories,
 * and engagement types (used by the Service Configuration settings tab).
 *
 * All endpoints require Bearer token + role: super_admin or admin.
 */
class ServiceCategoryController extends BaseController
{
    /** Loaded on every request (catalog index needs only this). */
    private ServiceCategoryModel $categories;

    /** Lazily constructed so GET /service-categories does not touch unrelated models/tables. */
    private ?ServiceSubcategoryModel $lazySubcategories = null;

    private ?EngagementTypeModel $lazyEngagementTypes = null;

    private ?ServiceModel $lazyServices = null;

    private ?LeadModel $lazyLeads = null;

    private ?RecurringServiceDefinitionModel $lazyRecurringDefs = null;

    private ?RegisterModel $lazyRegisters = null;

    public function __construct()
    {
        $this->categories = new ServiceCategoryModel();
    }

    private function subcategories(): ServiceSubcategoryModel
    {
        return $this->lazySubcategories ??= new ServiceSubcategoryModel();
    }

    private function engagementTypes(): EngagementTypeModel
    {
        return $this->lazyEngagementTypes ??= new EngagementTypeModel();
    }

    private function services(): ServiceModel
    {
        return $this->lazyServices ??= new ServiceModel();
    }

    private function leads(): LeadModel
    {
        return $this->lazyLeads ??= new LeadModel();
    }

    private function recurringDefs(): RecurringServiceDefinitionModel
    {
        return $this->lazyRecurringDefs ??= new RecurringServiceDefinitionModel();
    }

    private function registers(): RegisterModel
    {
        return $this->lazyRegisters ??= new RegisterModel();
    }

    // ── GET /api/admin/service-categories ────────────────────────────────────

    /**
     * Return all categories with nested subcategories and engagement types.
     */
    public function index(): never
    {
        try {
            $data = $this->categories->allWithChildren();
            $this->success($data, 'Service categories retrieved');
        } catch (\PDOException $e) {
            error_log('[ServiceCategoryController::index] PDO: ' . $e->getMessage());
            $this->error(
                'The service catalog could not be loaded from the database. Verify migrations ran and the DB user may SELECT service_categories, service_subcategories, and engagement_types.',
                500
            );
        } catch (JsonException $e) {
            error_log('[ServiceCategoryController::index] JSON: ' . $e->getMessage());
            $this->error('The service catalog could not be encoded for the API. Check server logs.', 500);
        } catch (\Throwable $e) {
            error_log('[ServiceCategoryController::index] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $env = strtolower((string)(getenv('APP_ENV') ?: ''));
            if (in_array($env, ['development', 'local', 'dev'], true)) {
                $this->error($e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine(), 500);
            }
            $this->error(
                'Service catalog could not be loaded. See server error log line prefixed with [ServiceCategoryController::index].',
                500
            );
        }
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

    // ── PATCH /api/admin/service-categories/:id ─────────────────────────────

    /**
     * Rename a category. IDs on engagements stay the same; denormalized names are refreshed.
     *
     * Body: { name }
     */
    public function update(int $id): never
    {
        $cat = $this->categories->find($id);
        if ($cat === null) {
            $this->error('Category not found.', 404);
        }

        $body = $this->getJsonBody();
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') {
            $this->error('Category name is required.', 422);
        }

        $db = Database::getConnection();
        $db->beginTransaction();
        try {
            $this->categories->updateName($id, $name);
            $this->services()->syncDenormalizedCategoryName($id, $name);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        $this->success($this->categories->find($id), 'Category updated');
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

        if ($this->services()->countReferencingCategoryTree($id) > 0) {
            $this->error(
                'This category cannot be deleted because one or more service engagements still reference it, its subcategories, or its engagement types.',
                409
            );
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
        $data = $this->subcategories()->forCategory($categoryId);
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

        $newId = $this->subcategories()->create($categoryId, $name);
        $sub   = $this->subcategories()->find($newId);
        $this->success($sub, 'Subcategory created', 201);
    }

    // ── PATCH /api/admin/service-subcategories/:id ────────────────────────────

    /**
     * Rename a subcategory. Updates denormalized subcategory_name on linked services.
     *
     * Body: { name }
     */
    public function subcategoryUpdate(int $id): never
    {
        $sub = $this->subcategories()->find($id);
        if ($sub === null) {
            $this->error('Subcategory not found.', 404);
        }

        $body = $this->getJsonBody();
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') {
            $this->error('Subcategory name is required.', 422);
        }

        $db = Database::getConnection();
        $db->beginTransaction();
        try {
            $this->subcategories()->updateName($id, $name);
            $this->services()->syncDenormalizedSubcategoryName($id, $name);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        $this->success($this->subcategories()->find($id), 'Subcategory updated');
    }

    // ── DELETE /api/admin/service-subcategories/:id ───────────────────────────

    /**
     * Delete a subcategory.
     */
    public function subcategoryDestroy(int $id): never
    {
        $sub = $this->subcategories()->find($id);
        if ($sub === null) {
            $this->error('Subcategory not found.', 404);
        }

        if ($this->engagementTypes()->countBySubcategoryId($id) > 0) {
            $this->error(
                'This subcategory cannot be deleted while it has engagement types. Remove those engagement types first.',
                409
            );
        }

        if ($this->services()->countBySubcategoryId($id) > 0) {
            $this->error(
                'This subcategory cannot be deleted because one or more service engagements still reference it.',
                409
            );
        }

        $this->subcategories()->delete($id);
        $this->success(null, 'Subcategory deleted');
    }

    // ── GET /api/admin/service-categories/:id/engagement-types ───────────────

    /**
     * Return engagement types for a category.
     */
    public function engagementTypeIndex(int $categoryId): never
    {
        $data = $this->engagementTypes()->forCategory($categoryId);
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
            $sub = $this->subcategories()->find($subcategoryId);
            if ($sub === null || (int)$sub['category_id'] !== $categoryId) {
                $this->error('Subcategory not found or does not belong to this category.', 422);
            }
        }

        $newId = $this->engagementTypes()->create($categoryId, $name, $subcategoryId);
        $et    = $this->engagementTypes()->find($newId);
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
        $sub = $this->subcategories()->find($subcategoryId);
        if ($sub === null) {
            $this->error('Subcategory not found.', 404);
        }

        $body = $this->getJsonBody();
        $name = trim((string)($body['name'] ?? ''));

        if ($name === '') {
            $this->error('Engagement type name is required.', 422);
        }

        $categoryId = (int)$sub['category_id'];
        $newId      = $this->engagementTypes()->create($categoryId, $name, $subcategoryId);
        $et         = $this->engagementTypes()->find($newId);
        $this->success($et, 'Engagement type created', 201);
    }

    // ── PATCH /api/admin/engagement-types/:id ─────────────────────────────────

    /**
     * Update billing standards (and optionally name) on an engagement type.
     *
     * Body: { name?, standard_fee_amount?, standard_allowable_hours? } — omit or null to clear amounts/hours.
     */
    public function engagementTypeUpdate(int $id): never
    {
        $et = $this->engagementTypes()->find($id);
        if ($et === null) {
            $this->error('Engagement type not found.', 404);
        }

        $body = $this->getJsonBody();
        $data = [];

        $oldName = trim((string)($et['name'] ?? ''));

        if (array_key_exists('name', $body)) {
            $n = trim((string)$body['name']);
            if ($n === '') {
                $this->error('name cannot be empty when provided.', 422);
            }
            $data['name'] = $n;
        }
        if (array_key_exists('standard_fee_amount', $body)) {
            $raw = $body['standard_fee_amount'];
            if ($raw === null || $raw === '') {
                $data['standard_fee_amount'] = null;
            } elseif (!is_numeric($raw)) {
                $this->error('standard_fee_amount must be numeric or empty.', 422);
            } else {
                $fv = (float)$raw;
                if ($fv < 0) {
                    $this->error('standard_fee_amount cannot be negative.', 422);
                }
                $data['standard_fee_amount'] = $fv;
            }
        }
        if (array_key_exists('standard_allowable_hours', $body)) {
            $raw = $body['standard_allowable_hours'];
            if ($raw === null || $raw === '') {
                $data['standard_allowable_hours'] = null;
            } elseif (!is_numeric($raw)) {
                $this->error('standard_allowable_hours must be numeric or empty.', 422);
            } else {
                $hv = (float)$raw;
                if ($hv < 0) {
                    $this->error('standard_allowable_hours cannot be negative.', 422);
                }
                $data['standard_allowable_hours'] = $hv;
            }
        }

        if ($data === []) {
            $this->success($this->engagementTypes()->find($id), 'No changes.');
        }

        $db = Database::getConnection();
        $db->beginTransaction();
        try {
            $this->engagementTypes()->update($id, $data);

            if (isset($data['name'])) {
                $newName = trim((string)$data['name']);
                if ($newName !== $oldName) {
                    $this->services()->syncDenormalizedEngagementTypeName($id, $newName);
                    $this->leads()->syncEngagementTypeName($id, $newName);
                    $this->syncReturnTypesAfterEngagementTypeRename($id, $oldName, $newName);
                }
            }

            $db->commit();
        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            error_log('[ServiceCategoryController::engagementTypeUpdate] ' . $e::class . ': ' . $e->getMessage());
            throw $e;
        }

        $this->success($this->engagementTypes()->find($id), 'Engagement type updated');
    }

    /**
     * Refresh register/recurring return_type labels after an engagement type rename.
     * Skipped when migration 044 columns/tables are not present.
     */
    private function syncReturnTypesAfterEngagementTypeRename(int $id, string $oldName, string $newName): void
    {
        static $hasRegisterReturnType = null;
        if ($hasRegisterReturnType === null) {
            $stmt = Database::getConnection()->prepare(
                'SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = current_schema()
                   AND table_name = :table
                   AND column_name IN (\'engagement_type_id\', \'return_type\')'
            );
            $stmt->execute([':table' => 'registers']);
            $hasRegisterReturnType = ((int)$stmt->fetchColumn()) >= 2;
        }

        if (!$hasRegisterReturnType) {
            return;
        }

        static $hasRecurringTable = null;
        if ($hasRecurringTable === null) {
            $stmt = Database::getConnection()->prepare(
                'SELECT 1 FROM information_schema.tables
                 WHERE table_schema = current_schema()
                   AND table_name = :table
                 LIMIT 1'
            );
            $stmt->execute([':table' => 'recurring_service_definitions']);
            $hasRecurringTable = (bool)$stmt->fetchColumn();
        }

        if ($hasRecurringTable) {
            $this->recurringDefs()->syncReturnTypeAfterEngagementTypeRename($id, $oldName, $newName);
        }

        $this->registers()->syncReturnTypeAfterEngagementTypeRename($id, $oldName, $newName);
    }

    // ── DELETE /api/admin/engagement-types/:id ────────────────────────────────

    /**
     * Delete an engagement type.
     */
    public function engagementTypeDestroy(int $id): never
    {
        $et = $this->engagementTypes()->find($id);
        if ($et === null) {
            $this->error('Engagement type not found.', 404);
        }

        if ($this->services()->countByEngagementTypeId($id) > 0) {
            $this->error(
                'This engagement type cannot be deleted because one or more service engagements still use it.',
                409
            );
        }

        $this->engagementTypes()->delete($id);
        $this->success(null, 'Engagement type deleted');
    }
}
