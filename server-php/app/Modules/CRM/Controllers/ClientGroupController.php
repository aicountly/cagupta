<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Libraries\ClientMasterAudit;
use App\Libraries\ClientMasterNameChangeService;
use App\Models\AdminAuditLogModel;
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
    private AdminAuditLogModel $audit;

    public function __construct()
    {
        $this->groups = new ClientGroupModel();
        $this->audit  = new AdminAuditLogModel();
    }

    // ── GET /api/admin/client-groups/search ─────────────────────────────────

    /**
     * Type-ahead search for client groups. Query params: q, limit
     */
    public function search(): never
    {
        $q     = trim((string)$this->query('q', ''));
        $limit = min(50, max(1, (int)$this->query('limit', 20)));

        if ($q === '') {
            $this->success([], 'No query provided');
        }

        $results = $this->groups->search($q, $limit);
        $this->success($results, 'Groups found');
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

        $actorId = $user ? (int)$user['id'] : null;
        try {
            $this->audit->insert(
                $actorId,
                'client_group.created',
                'client_group',
                (int)$group['id'],
                [],
                null,
                ClientMasterAudit::clientGroupSnapshot($group)
            );
        } catch (\Throwable $e) {
            error_log('[ClientGroupController] Audit log failed: ' . $e->getMessage());
        }

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

        $members            = $this->groups->members($id);
        $group['members']   = $members;
        ClientMasterNameChangeService::attachPendingToRow('client_group', $id, $group);

        $this->success($group, 'Group retrieved');
    }

    // ── GET /api/admin/client-groups/:id/audit-log ─────────────────────────

    public function auditLog(int $id): never
    {
        $group = $this->groups->find($id);
        if ($group === null) {
            $this->error('Group not found.', 404);
        }

        $limit  = min(100, max(1, (int)$this->query('limit', 50)));
        $offset = max(0, (int)$this->query('offset', 0));

        $rows = $this->audit->listForEntity('client_group', $id, $limit, $offset);
        $this->success($rows, 'Audit log retrieved');
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

        $actingUser   = $this->authUser();
        $isSuperAdmin = $this->isSuperAdminActor($actingUser);
        $beforeSnap   = ClientMasterAudit::clientGroupSnapshot($group);
        $pendingMeta  = null;

        $intercept = ClientMasterNameChangeService::interceptNameChange(
            'client_group',
            $id,
            $group,
            $data,
            $actingUser,
            $isSuperAdmin
        );
        if ($intercept !== null) {
            if ($intercept['type'] === 'blocked') {
                $this->error(
                    'A name change is already pending Super Admin approval (Approval #'
                    . (int)$intercept['summary']['approval_id'] . ').',
                    422,
                    [],
                    ['pending_name_change' => $intercept['summary']]
                );
            }
            $pendingMeta = $intercept['summary'];
        }

        if ($data !== []) {
            $this->groups->update($id, $data);
        }

        $updated   = $this->groups->find($id);
        $afterSnap = ClientMasterAudit::clientGroupSnapshot($updated ?? []);
        $actorId   = $actingUser ? (int)$actingUser['id'] : null;
        try {
            $this->audit->insert($actorId, 'client_group.updated', 'client_group', $id, [], $beforeSnap, $afterSnap);
        } catch (\Throwable $e) {
            error_log('[ClientGroupController] Audit log failed: ' . $e->getMessage());
        }

        $message = 'Group updated';
        $meta    = [];
        if ($pendingMeta !== null) {
            $message = 'Group updated. Name change submitted for Super Admin approval (Approval #'
                . (int)$pendingMeta['approval_id'] . ').';
            $meta['pending_name_change'] = $pendingMeta;
        }

        $this->success($updated, $message, 200, $meta);
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

        $beforeSnap = ClientMasterAudit::clientGroupSnapshot($group);
        $this->groups->delete($id);

        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : null;
        try {
            $this->audit->insert($actorId, 'client_group.deleted', 'client_group', $id, [], $beforeSnap, null);
        } catch (\Throwable $e) {
            error_log('[ClientGroupController] Audit log failed: ' . $e->getMessage());
        }

        $this->success(null, 'Group deleted');
    }

    /** @param array<string, mixed>|null $actor */
    private function isSuperAdminActor(?array $actor): bool
    {
        if ($actor === null) {
            return false;
        }
        if ($this->isSuperAdminEmail((string)($actor['email'] ?? ''))) {
            return true;
        }

        return ($actor['role_name'] ?? '') === 'super_admin';
    }
}
