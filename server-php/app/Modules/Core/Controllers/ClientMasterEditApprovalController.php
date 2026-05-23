<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Libraries\ApprovalDecisionNotifier;
use App\Libraries\ClientMasterEditApprovalService;
use App\Libraries\DigestQueue;
use App\Models\AdminAuditLogModel;
use App\Models\ClientMasterEditRequestModel;
use App\Models\ClientModel;
use App\Models\OrganizationModel;

/**
 * Super Admin approval for Accounts team client master edits (contacts, organizations).
 */
final class ClientMasterEditApprovalController extends BaseController
{
    /** GET /api/admin/approvals/client-master-edits */
    public function index(): never
    {
        if (!$this->isSuperAdminActor($this->authUser())) {
            $this->error('Only Super Admin may view client master edit requests.', 403);
        }

        $rows = (new ClientMasterEditRequestModel())->listPendingWithDetails();
        $out  = [];
        foreach ($rows as $row) {
            $summary = ClientMasterEditRequestModel::toPendingSummary($row);
            $summary['requested_by_name']  = $row['requested_by_name'] ?? null;
            $summary['requested_by_email'] = $row['requested_by_email'] ?? null;
            $out[] = $summary;
        }

        $this->success($out);
    }

    /** POST /api/admin/approvals/client-master-edits/:id/approve */
    public function approve(int $id): never
    {
        $actor = $this->authUser();
        if (!$this->isSuperAdminActor($actor)) {
            $this->error('Only Super Admin may approve client master edits.', 403);
        }
        $actorId = $actor ? (int)$actor['id'] : 0;

        $model = new ClientMasterEditRequestModel();
        $row   = $model->find($id);
        if ($row === null || ($row['status'] ?? '') !== 'pending') {
            $this->error('Request not found or already decided.', 404);
        }

        $body          = $this->getJsonBody();
        $decisionNotes = trim((string)($body['decision_notes'] ?? ''));

        $entityType = (string)($row['entity_type'] ?? '');
        $entityId   = (int)($row['entity_id'] ?? 0);

        $applied = ClientMasterEditApprovalService::applyApproved($row);
        if ($applied === null) {
            $this->error('Client master record not found.', 404);
        }

        $model->markApproved($id, $actorId, $decisionNotes !== '' ? $decisionNotes : null);

        try {
            (new AdminAuditLogModel())->insert(
                $actorId,
                $entityType . '.edit_approved',
                $entityType,
                $entityId,
                [
                    'approval_id'    => $id,
                    'decision_notes' => $decisionNotes !== '' ? $decisionNotes : null,
                ],
                $applied['before'],
                $applied['after']
            );
        } catch (\Throwable $e) {
            error_log('[ClientMasterEditApproval] audit failed: ' . $e->getMessage());
        }

        $this->sendDigestAlert($entityType, $entityId, $actor);

        $reqUserId = (int)($row['requested_by_user_id'] ?? 0);
        $summary   = 'Approval #' . $id . ': client master edit applied.';
        $detail    = $decisionNotes !== ''
            ? ApprovalDecisionNotifier::detailBlock(
                'Decision notes: ' . ApprovalDecisionNotifier::escapeDetail($decisionNotes)
            )
            : null;
        ClientMasterEditApprovalService::notifyRequester(
            $reqUserId,
            'Client master edit approved',
            $summary,
            $id,
            'approved',
            $summary,
            $actor,
            $detail
        );

        $this->success(['id' => $id, 'status' => 'approved'], 'Client master edit approved');
    }

    /** POST /api/admin/approvals/client-master-edits/:id/reject */
    public function reject(int $id): never
    {
        $actor = $this->authUser();
        if (!$this->isSuperAdminActor($actor)) {
            $this->error('Only Super Admin may reject client master edits.', 403);
        }
        $actorId = $actor ? (int)$actor['id'] : 0;

        $body   = $this->getJsonBody();
        $reason = trim((string)($body['reason'] ?? ''));
        if ($reason === '') {
            $this->error('reason is required.', 422);
        }

        $model = new ClientMasterEditRequestModel();
        $row   = $model->find($id);
        if ($row === null || ($row['status'] ?? '') !== 'pending') {
            $this->error('Request not found or already decided.', 404);
        }

        $model->markRejected($id, $actorId, $reason);

        $entityType = (string)($row['entity_type'] ?? '');
        $entityId   = (int)($row['entity_id'] ?? 0);

        try {
            (new AdminAuditLogModel())->insert(
                $actorId,
                $entityType . '.edit_rejected',
                $entityType,
                $entityId,
                ['approval_id' => $id, 'reject_reason' => $reason],
                null,
                null
            );
        } catch (\Throwable $e) {
            error_log('[ClientMasterEditApproval] audit failed: ' . $e->getMessage());
        }

        $reqUserId = (int)($row['requested_by_user_id'] ?? 0);
        $summary   = 'Approval #' . $id . ' was rejected.';
        $detail    = ApprovalDecisionNotifier::detailBlock(
            'Reason: ' . ApprovalDecisionNotifier::escapeDetail($reason)
        );
        ClientMasterEditApprovalService::notifyRequester(
            $reqUserId,
            'Client master edit rejected',
            $summary . ' Reason: ' . $reason,
            $id,
            'rejected',
            $summary,
            $actor,
            $detail
        );

        $this->success(['id' => $id, 'status' => 'rejected'], 'Client master edit rejected');
    }

    /** @param array<string, mixed>|null $actor */
    private function sendDigestAlert(string $entityType, int $entityId, ?array $actor): void
    {
        if ($entityType === 'contact') {
            $row = (new ClientModel())->find($entityId);
            if ($row === null) {
                return;
            }
            $displayName = ClientModel::displayName($row);
            $status      = ((bool)$row['is_active']) ? 'Active' : 'Inactive';
            DigestQueue::enqueue(
                entityType:  'contact',
                bucket:      'contact',
                entityId:    $entityId,
                displayName: $displayName,
                actionLabel: 'Updated (approved)',
                status:      $status,
                actorName:   $actor['name'] ?? 'Super Admin',
                actorEmail:  $actor['email'] ?? '',
            );

            return;
        }

        if ($entityType === 'organization') {
            $row = (new OrganizationModel())->find($entityId);
            if ($row === null) {
                return;
            }
            $displayName = (string)($row['name'] ?? 'Organization');
            $status      = ((bool)$row['is_active']) ? 'Active' : 'Inactive';
            DigestQueue::enqueue(
                entityType:  'organization',
                bucket:      'organization',
                entityId:    $entityId,
                displayName: $displayName,
                actionLabel: 'Updated (approved)',
                status:      $status,
                actorName:   $actor['name'] ?? 'Super Admin',
                actorEmail:  $actor['email'] ?? '',
            );
        }
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
