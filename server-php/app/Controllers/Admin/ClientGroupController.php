<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\ClientGroupModel;

/**
 * ClientGroupController — CRUD for the `client_groups` table.
 *
 * Groups are shared between contacts and organizations so that records
 * can be viewed and reported on collectively.
 */
class ClientGroupController extends BaseController
{
    private ClientGroupModel $groups;

    public function __construct()
    {
        $this->groups = new ClientGroupModel();
    }

    // ── GET /api/admin/client-groups ────────────────────────────────────────

    /**
     * Return all groups with member counts.
     */
    public function index(): never
    {
        $this->success($this->groups->all(), 'Groups retrieved');
    }

    // ── POST /api/admin/client-groups ───────────────────────────────────────

    /**
     * Create a new group.
     *
     * Body: { name (required), description?, color? }
     */
    public function store(): never
    {
        $body = $this->getJsonBody();

        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') {
            $this->error('Group name is required.', 422);
        }

        $user  = $this->authUser();
        $group = $this->groups->create([
            'name'        => $name,
            'description' => $body['description'] ?? null,
            'color'       => $body['color']       ?? '#6366f1',
            'created_by'  => $user['id']           ?? null,
        ]);

        $this->success($group, 'Group created', 201);
    }

    // ── GET /api/admin/client-groups/:id ────────────────────────────────────

    /**
     * Return a single group with its members (contacts + organizations).
     */
    public function show(int $id): never
    {
        $group = $this->groups->find($id);
        if ($group === null) {
            $this->error('Group not found.', 404);
        }

        $members       = $this->groups->members($id);
        $group['members'] = $members;

        $this->success($group, 'Group retrieved');
    }

    // ── PUT /api/admin/client-groups/:id ────────────────────────────────────

    /**
     * Update a group's name, description, or color.
     *
     * Body: { name?, description?, color? }
     */
    public function update(int $id): never
    {
        $group = $this->groups->find($id);
        if ($group === null) {
            $this->error('Group not found.', 404);
        }

        $body = $this->getJsonBody();
        $this->groups->update($id, $body);

        $this->success($this->groups->find($id), 'Group updated');
    }

    // ── DELETE /api/admin/client-groups/:id ─────────────────────────────────

    /**
     * Delete a group (members' group_id is set to NULL via FK cascade).
     */
    public function destroy(int $id): never
    {
        $group = $this->groups->find($id);
        if ($group === null) {
            $this->error('Group not found.', 404);
        }

        $this->groups->delete($id);
        $this->success(null, 'Group deleted');
    }
}
