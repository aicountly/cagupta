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

        if ($this->groups->findIdByConflictingName($name) !== null) {
            $this->error('A group with this name already exists.', 409);
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
        $data = [];

        if (array_key_exists('name', $body)) {
            $name = trim((string)$body['name']);
            if ($name === '') {
                $this->error('Group name cannot be empty.', 422);
            }
            if ($this->groups->findIdByConflictingName($name, $id) !== null) {
                $this->error('A group with this name already exists.', 409);
            }
            $data['name'] = $name;
        }
        if (array_key_exists('description', $body)) {
            $desc = $body['description'];
            $data['description'] = $desc === null || $desc === ''
                ? null
                : trim((string)$desc);
        }
        if (array_key_exists('color', $body)) {
            $data['color'] = (string)$body['color'];
        }

        if ($data === []) {
            $this->error('No valid fields to update.', 422);
        }

        $this->groups->update($id, $data);

        $this->success($this->groups->find($id), 'Group updated');
    }

    // ── DELETE /api/admin/client-groups/:id ─────────────────────────────────

    /**
     * Delete a group only when no contacts or organizations reference it.
     */
    public function destroy(int $id): never
    {
        $group = $this->groups->find($id);
        if ($group === null) {
            $this->error('Group not found.', 404);
        }

        $contactCount = (int)($group['contact_count'] ?? 0);
        $orgCount      = (int)($group['org_count'] ?? 0);

        if ($contactCount > 0 || $orgCount > 0) {
            $this->error(
                'This group cannot be deleted while contacts or organizations are assigned to it. '
                . 'Reassign those records to another group or clear the group on each record, then try again.',
                409
            );
        }

        $this->groups->delete($id);
        $this->success(null, 'Group deleted');
    }
}
