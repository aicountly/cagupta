<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Libraries\ClientMasterAudit;
use App\Libraries\ClientMasterNameChangeService;
use App\Models\AdminAuditLogModel;
use App\Models\ClientGroupModel;
use App\Models\ClientMasterNameChangeRequestModel;
use App\Models\ClientModel;
use App\Models\OrganizationModel;

/**
 * Super Admin approval for client master name changes (contacts, organizations, groups).
 */
final class ClientMasterNameChangeApprovalController extends BaseController
{
    /** GET /api/admin/approvals/client-master-name-changes */
    public function index(): never
    {
        if (!$this->isSuperAdminActor($this->authUser())) {
            $this->error('Only Super Admin may view client master name change requests.', 403);
        }

        $rows = (new ClientMasterNameChangeRequestModel())->listPendingWithDetails();
        $out  = [];
        foreach ($rows as $row) {
            $summary = ClientMasterNameChangeRequestModel::toPendingSummary($row);
            $summary['requested_by_name']  = $row['requested_by_name'] ?? null;
            $summary['requested_by_email'] = $row['requested_by_email'] ?? null;
            $out[] = $summary;
        }

        $this->success($out);
    }

    /** POST /api/admin/approvals/client-master-name-changes/:id/approve */
    public function approve(int $id): never
    {
        $actor = $this->authUser();
        if (!$this->isSuperAdminActor($actor)) {
            $this->error('Only Super Admin may approve client master name changes.', 403);
        }
        $actorId = $actor ? (int)$actor['id'] : 0;

        $model = new ClientMasterNameChangeRequestModel();
        $row   = $model->find($id);
        if ($row === null || ($row['status'] ?? '') !== 'pending') {
            $this->error('Request not found or already decided.', 404);
        }

        $body          = $this->getJsonBody();
        $decisionNotes = trim((string)($body['decision_notes'] ?? ''));

        $entityType = (string)($row['entity_type'] ?? '');
        $entityId   = (int)($row['entity_id'] ?? 0);
        $prop       = $row['proposed_values'] ?? [];
        if (is_string($prop)) {
            $prop = json_decode($prop, true) ?: [];
        }
        if (!is_array($prop)) {
            $prop = [];
        }

        $beforeSnap = $this->loadEntitySnapshot($entityType, $entityId);
        if ($beforeSnap === null) {
            $this->error('Client master record not found.', 404);
        }

        $this->applyProposedName($entityType, $entityId, $prop);

        $model->markApproved($id, $actorId, $decisionNotes !== '' ? $decisionNotes : null);

        $afterRow   = $this->loadEntityRow($entityType, $entityId);
        $afterSnap  = $afterRow !== null ? $this->rowToSnapshot($entityType, $afterRow) : null;
        $action     = $entityType . '.name_change_approved';

        try {
            (new AdminAuditLogModel())->insert(
                $actorId,
                $action,
                $entityType === 'client_group' ? 'client_group' : $entityType,
                $entityId,
                [
                    'approval_id'     => $id,
                    'decision_notes'  => $decisionNotes !== '' ? $decisionNotes : null,
                    'proposed_values' => $prop,
                ],
                $beforeSnap,
                $afterSnap
            );
        } catch (\Throwable $e) {
            error_log('[ClientMasterNameChangeApproval] audit failed: ' . $e->getMessage());
        }

        $reqUserId = (int)($row['requested_by_user_id'] ?? 0);
        $newName   = ClientMasterNameChangeRequestModel::proposedDisplayName($entityType, $prop);
        ClientMasterNameChangeService::notifyRequester(
            $reqUserId,
            'Client master name change approved',
            'Approval #' . $id . ': name updated to “' . $newName . '”.',
            $id
        );

        $this->success(['id' => $id, 'status' => 'approved'], 'Name change approved');
    }

    /** POST /api/admin/approvals/client-master-name-changes/:id/reject */
    public function reject(int $id): never
    {
        $actor = $this->authUser();
        if (!$this->isSuperAdminActor($actor)) {
            $this->error('Only Super Admin may reject client master name changes.', 403);
        }
        $actorId = $actor ? (int)$actor['id'] : 0;

        $body   = $this->getJsonBody();
        $reason = trim((string)($body['reason'] ?? ''));
        if ($reason === '') {
            $this->error('reason is required.', 422);
        }

        $model = new ClientMasterNameChangeRequestModel();
        $row   = $model->find($id);
        if ($row === null || ($row['status'] ?? '') !== 'pending') {
            $this->error('Request not found or already decided.', 404);
        }

        $model->markRejected($id, $actorId, $reason);

        try {
            (new AdminAuditLogModel())->insert(
                $actorId,
                ($row['entity_type'] ?? 'contact') . '.name_change_rejected',
                (string)($row['entity_type'] ?? 'contact'),
                (int)($row['entity_id'] ?? 0),
                ['approval_id' => $id, 'reject_reason' => $reason],
                null,
                null
            );
        } catch (\Throwable $e) {
            error_log('[ClientMasterNameChangeApproval] audit failed: ' . $e->getMessage());
        }

        $reqUserId = (int)($row['requested_by_user_id'] ?? 0);
        ClientMasterNameChangeService::notifyRequester(
            $reqUserId,
            'Client master name change rejected',
            'Approval #' . $id . ' was rejected. Reason: ' . $reason,
            $id
        );

        $this->success(['id' => $id, 'status' => 'rejected'], 'Name change rejected');
    }

    /** @param array<string, mixed> $prop */
    private function applyProposedName(string $entityType, int $entityId, array $prop): void
    {
        if ($entityType === 'contact') {
            (new ClientModel())->update($entityId, [
                'first_name'        => $prop['first_name'] ?? null,
                'last_name'         => $prop['last_name'] ?? null,
                'organization_name' => $prop['organization_name'] ?? null,
            ]);

            return;
        }
        if ($entityType === 'organization') {
            (new OrganizationModel())->update($entityId, ['name' => $prop['name'] ?? null]);

            return;
        }
        if ($entityType === 'client_group') {
            (new ClientGroupModel())->update($entityId, ['name' => $prop['name'] ?? null]);
        }
    }

    /** @return array<string, mixed>|null */
    private function loadEntityRow(string $entityType, int $entityId): ?array
    {
        if ($entityType === 'contact') {
            return (new ClientModel())->find($entityId);
        }
        if ($entityType === 'organization') {
            return (new OrganizationModel())->find($entityId);
        }
        if ($entityType === 'client_group') {
            return (new ClientGroupModel())->find($entityId);
        }

        return null;
    }

    /** @return array<string, mixed>|null */
    private function loadEntitySnapshot(string $entityType, int $entityId): ?array
    {
        $row = $this->loadEntityRow($entityType, $entityId);

        return $row !== null ? $this->rowToSnapshot($entityType, $row) : null;
    }

    /** @param array<string, mixed> $row */
    private function rowToSnapshot(string $entityType, array $row): array
    {
        return match ($entityType) {
            'contact'      => ClientMasterAudit::contactSnapshot($row),
            'organization' => ClientMasterAudit::organizationSnapshot($row),
            'client_group' => ClientMasterAudit::clientGroupSnapshot($row),
            default        => [],
        };
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
