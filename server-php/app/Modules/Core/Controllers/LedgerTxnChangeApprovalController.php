<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Libraries\ApprovalDecisionNotifier;
use App\Libraries\ApprovalPendingNotificationDismisser;
use App\Libraries\LedgerTxnChangeService;
use App\Models\AdminAuditLogModel;
use App\Models\LedgerTxnChangeRequestModel;

/**
 * Super Admin approval for protected ledger txn changes.
 */
final class LedgerTxnChangeApprovalController extends BaseController
{
    /** GET /api/admin/approvals/ledger-txn-changes */
    public function index(): never
    {
        if (!$this->isSuperAdminActor($this->authUser())) {
            $this->error('Only Super Admin may view ledger change requests.', 403);
        }

        $rows = (new LedgerTxnChangeRequestModel())->listPendingWithDetails();
        $out  = [];
        foreach ($rows as $row) {
            $summary = LedgerTxnChangeRequestModel::toPendingSummary($row);
            $summary['requested_by_name']  = $row['requested_by_name'] ?? null;
            $summary['requested_by_email'] = $row['requested_by_email'] ?? null;
            $summary['action_label']       = LedgerTxnChangeService::actionLabel((string)($summary['action'] ?? ''));
            $out[] = $summary;
        }

        $this->success($out);
    }

    /** POST /api/admin/approvals/ledger-txn-changes/:id/approve */
    public function approve(int $id): never
    {
        $actor = $this->authUser();
        if (!$this->isSuperAdminActor($actor)) {
            $this->error('Only Super Admin may approve ledger change requests.', 403);
        }
        $actorId = $actor ? (int)$actor['id'] : 0;

        $model = new LedgerTxnChangeRequestModel();
        $row   = $model->find($id);
        if ($row === null || ($row['status'] ?? '') !== 'pending') {
            $this->error('Request not found or already decided.', 404);
        }

        $body          = $this->getJsonBody();
        $decisionNotes = trim((string)($body['decision_notes'] ?? ''));

        $result = (new TxnController())->executeApprovedLedgerChange($id, $actorId);

        $model->markApproved($id, $actorId, $decisionNotes !== '' ? $decisionNotes : null);

        $action      = (string)($row['action'] ?? '');
        $actionLabel = LedgerTxnChangeService::actionLabel($action);
        $txnId       = $row['txn_id'] !== null ? (int)$row['txn_id'] : null;
        $summary     = 'Approval #' . $id . ': ' . $actionLabel . ' applied.';
        if ($txnId !== null && $txnId > 0) {
            $summary .= ' Txn #' . $txnId . '.';
        }
        $detail = $decisionNotes !== ''
            ? ApprovalDecisionNotifier::detailBlock(
                'Decision notes: ' . ApprovalDecisionNotifier::escapeDetail($decisionNotes)
            )
            : null;

        LedgerTxnChangeService::notifyRequester(
            (int)($row['requested_by_user_id'] ?? 0),
            'Ledger change approved',
            $summary,
            $id,
            'approved',
            $summary,
            $actor,
            $detail
        );

        ApprovalPendingNotificationDismisser::dismiss('ledger_txn_change', 'ledger_txn_change', $id);

        $this->success(
            array_merge(['id' => $id, 'status' => 'approved'], $result),
            $actionLabel . ' approved'
        );
    }

    /** POST /api/admin/approvals/ledger-txn-changes/:id/reject */
    public function reject(int $id): never
    {
        $actor = $this->authUser();
        if (!$this->isSuperAdminActor($actor)) {
            $this->error('Only Super Admin may reject ledger change requests.', 403);
        }
        $actorId = $actor ? (int)$actor['id'] : 0;

        $body   = $this->getJsonBody();
        $reason = trim((string)($body['reason'] ?? ''));
        if ($reason === '') {
            $this->error('reason is required.', 422);
        }

        $model = new LedgerTxnChangeRequestModel();
        $row   = $model->find($id);
        if ($row === null || ($row['status'] ?? '') !== 'pending') {
            $this->error('Request not found or already decided.', 404);
        }

        $model->markRejected($id, $actorId, $reason);

        $txnId = (int)($row['txn_id'] ?? 0);
        if ($txnId > 0) {
            try {
                (new AdminAuditLogModel())->insert(
                    $actorId,
                    'txn.change_rejected',
                    'txn',
                    $txnId,
                    [
                        'approval_id' => $id,
                        'action'      => (string)($row['action'] ?? ''),
                        'reason'      => $reason,
                    ],
                    null,
                    null
                );
            } catch (\Throwable $e) {
                error_log('[LedgerTxnChangeApprovalController] txn audit log failed: ' . $e->getMessage());
            }
        }

        $actionLabel = LedgerTxnChangeService::actionLabel((string)($row['action'] ?? ''));
        $summary     = 'Approval #' . $id . ' (' . $actionLabel . ') was rejected.';
        $detail      = ApprovalDecisionNotifier::detailBlock(
            'Reason: ' . ApprovalDecisionNotifier::escapeDetail($reason)
        );
        LedgerTxnChangeService::notifyRequester(
            (int)($row['requested_by_user_id'] ?? 0),
            'Ledger change rejected',
            $summary . ' Reason: ' . $reason,
            $id,
            'rejected',
            $summary,
            $actor,
            $detail
        );

        ApprovalPendingNotificationDismisser::dismiss('ledger_txn_change', 'ledger_txn_change', $id);

        $this->success(['id' => $id, 'status' => 'rejected'], 'Ledger change rejected');
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
