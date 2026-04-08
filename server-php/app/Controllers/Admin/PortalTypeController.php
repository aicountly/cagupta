<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\PortalTypeModel;

/**
 * PortalTypeController — CRUD for the `portal_types` table.
 *
 * GET    /api/admin/portal-types        — list all portal types
 * POST   /api/admin/portal-types        — create a new portal type
 * DELETE /api/admin/portal-types/:id    — delete a portal type (blocked if in use)
 */
class PortalTypeController extends BaseController
{
    private PortalTypeModel $model;

    public function __construct()
    {
        $this->model = new PortalTypeModel();
    }

    // ── GET /api/admin/portal-types ──────────────────────────────────────────

    public function index(): never
    {
        $rows = $this->model->all();
        $this->success($rows, 'Portal types retrieved');
    }

    // ── POST /api/admin/portal-types ─────────────────────────────────────────

    public function store(): never
    {
        $body = $this->getJsonBody();
        $name = trim((string)($body['name'] ?? ''));

        if ($name === '') {
            $this->error('name is required.', 422);
        }

        $actingUser = $this->authUser();

        $newId = $this->model->create([
            'organization_id' => isset($body['organization_id']) ? (int)$body['organization_id'] : null,
            'name'            => $name,
            'url'             => isset($body['url']) ? trim((string)$body['url']) : null,
            'created_by'      => $actingUser ? (int)$actingUser['id'] : null,
        ]);

        $record = $this->model->find($newId);
        $this->success($record, 'Portal type created', 201);
    }

    // ── DELETE /api/admin/portal-types/:id ───────────────────────────────────

    public function destroy(int $id): never
    {
        $record = $this->model->find($id);
        if ($record === null) {
            $this->error('Portal type not found.', 404);
        }

        if ($this->model->isUsedByCredential($record['name'])) {
            $this->error(
                "Cannot delete \"{$record['name']}\" — it is used by existing credentials. Remove those credentials first.",
                409
            );
        }

        $this->model->delete($id);
        $this->success(null, 'Portal type deleted');
    }
}
