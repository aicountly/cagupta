<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\LedgerTxnChangeRequestModel;
use App\Models\TxnModel;
use App\Models\UserModel;
use App\Models\UserNotificationModel;

/**
 * Queue protected ledger mutations for Super Admin Team Approvals.
 */
final class LedgerTxnChangeService
{
    /**
     * @param array<string, mixed> $payload
     * @param array<string, mixed>|null $actor
     *
     * @return array{type: string, summary: array<string, mixed>}|null null when caller should proceed directly
     */
    public static function queueUpdate(int $txnId, array $payload, ?array $actor): ?array
    {
        return self::queue(
            $txnId,
            LedgerTxnChangeRequestModel::ACTION_UPDATE,
            $payload,
            null,
            $actor
        );
    }

    /**
     * @param array<string, mixed>|null $actor
     *
     * @return array{type: string, summary: array<string, mixed>}|null
     */
    public static function queueReverse(int $txnId, string $reason, ?array $actor): ?array
    {
        return self::queue(
            $txnId,
            LedgerTxnChangeRequestModel::ACTION_REVERSE,
            ['reason' => trim($reason)],
            trim($reason),
            $actor
        );
    }

    /**
     * @param array<string, mixed>|null $actor
     *
     * @return array{type: string, summary: array<string, mixed>}|null
     */
    public static function queueCancelReversal(int $txnId, ?array $actor): ?array
    {
        return self::queue(
            $txnId,
            LedgerTxnChangeRequestModel::ACTION_CANCEL_REVERSAL,
            [],
            null,
            $actor
        );
    }

    /**
     * @param list<int> $ids
     * @param array<string, mixed>|null $actor
     *
     * @return array{type: string, summary: array<string, mixed>}|null
     */
    public static function queueCancel(array $ids, ?array $actor): ?array
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn (int $n): bool => $n > 0)));
        if ($ids === []) {
            return null;
        }

        $txnId = count($ids) === 1 ? $ids[0] : null;
        if ($txnId !== null) {
            $existing = (new LedgerTxnChangeRequestModel())->findPendingForTxn($txnId);
            if ($existing !== null) {
                return [
                    'type'    => 'blocked',
                    'summary' => LedgerTxnChangeRequestModel::toPendingSummary($existing),
                ];
            }
        } else {
            $existing = (new LedgerTxnChangeRequestModel())->findPendingBulkCancel();
            if ($existing !== null) {
                return [
                    'type'    => 'blocked',
                    'summary' => LedgerTxnChangeRequestModel::toPendingSummary($existing),
                ];
            }
        }

        $txnModel = new TxnModel();
        $snapshots = [];
        foreach ($ids as $id) {
            $row = $txnModel->find($id);
            if ($row !== null) {
                $snapshots[] = self::compactTxnSnapshot($row);
            }
        }

        $actorId = $actor ? (int)($actor['id'] ?? 0) : 0;
        if ($actorId <= 0) {
            return null;
        }

        $approvalId = (new LedgerTxnChangeRequestModel())->insertPending(
            $txnId,
            LedgerTxnChangeRequestModel::ACTION_CANCEL,
            ['ids' => $ids],
            count($snapshots) === 1 ? $snapshots[0] : ['bulk' => $snapshots],
            $actorId,
            null
        );

        self::notifySuperAdmins($approvalId, LedgerTxnChangeRequestModel::ACTION_CANCEL, $txnId);

        $fresh = (new LedgerTxnChangeRequestModel())->find($approvalId);

        return [
            'type'    => 'queued',
            'summary' => LedgerTxnChangeRequestModel::toPendingSummary($fresh ?? [
                'id'          => $approvalId,
                'txn_id'      => $txnId,
                'action'      => LedgerTxnChangeRequestModel::ACTION_CANCEL,
                'payload'     => ['ids' => $ids],
                'txn_snapshot'=> count($snapshots) === 1 ? $snapshots[0] : ['bulk' => $snapshots],
            ]),
        ];
    }

    public static function attachPendingToTxnRow(array &$row): void
    {
        $id = (int)($row['id'] ?? 0);
        if ($id <= 0) {
            $row['pending_ledger_change'] = null;

            return;
        }
        $pending = (new LedgerTxnChangeRequestModel())->findPendingForTxn($id);
        $row['pending_ledger_change'] = $pending !== null
            ? LedgerTxnChangeRequestModel::toPendingSummary($pending)
            : null;
    }

    /**
     * @param array<string, mixed>|null $actor  Super Admin who decided
     */
    public static function notifyRequester(
        int $userId,
        string $title,
        string $body,
        int $approvalId,
        string $decision,
        string $summary,
        ?array $actor = null,
        ?string $detailHtml = null
    ): void {
        ApprovalDecisionNotifier::notifyRequester(
            $userId,
            'ledger_txn_change_decided',
            $title,
            $body,
            'ledger_txn_change',
            $approvalId,
            'Ledger change',
            $decision,
            $summary,
            $actor,
            $detailHtml
        );
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array{type: string, summary: array<string, mixed>}|null
     */
    private static function queue(
        int $txnId,
        string $action,
        array $payload,
        ?string $requestReason,
        ?array $actor
    ): ?array {
        $existing = (new LedgerTxnChangeRequestModel())->findPendingForTxn($txnId);
        if ($existing !== null) {
            return [
                'type'    => 'blocked',
                'summary' => LedgerTxnChangeRequestModel::toPendingSummary($existing),
            ];
        }

        $txnModel = new TxnModel();
        $row      = $txnModel->find($txnId);
        if ($row === null) {
            return null;
        }

        $actorId = $actor ? (int)($actor['id'] ?? 0) : 0;
        if ($actorId <= 0) {
            return null;
        }

        $approvalId = (new LedgerTxnChangeRequestModel())->insertPending(
            $txnId,
            $action,
            $payload,
            self::compactTxnSnapshot($row),
            $actorId,
            $requestReason
        );

        self::notifySuperAdmins($approvalId, $action, $txnId);

        $fresh = (new LedgerTxnChangeRequestModel())->find($approvalId);

        return [
            'type'    => 'queued',
            'summary' => LedgerTxnChangeRequestModel::toPendingSummary($fresh ?? [
                'id'           => $approvalId,
                'txn_id'       => $txnId,
                'action'       => $action,
                'payload'      => $payload,
                'txn_snapshot' => self::compactTxnSnapshot($row),
            ]),
        ];
    }

    private static function notifySuperAdmins(int $approvalId, string $action, ?int $txnId): void
    {
        $label = match ($action) {
            LedgerTxnChangeRequestModel::ACTION_UPDATE          => 'Ledger edit',
            LedgerTxnChangeRequestModel::ACTION_REVERSE         => 'Ledger reversal',
            LedgerTxnChangeRequestModel::ACTION_CANCEL          => 'Ledger cancel',
            LedgerTxnChangeRequestModel::ACTION_CANCEL_REVERSAL => 'Cancel ledger reversal',
            default                                             => 'Ledger change',
        };
        $uids = (new UserModel())->idsHavingRoleNames(['super_admin']);
        if ($uids === []) {
            return;
        }
        $ref = $txnId !== null ? 'Txn #' . $txnId : 'bulk';
        try {
            (new UserNotificationModel())->createForUsers(
                $uids,
                'ledger_txn_change',
                $label . ' pending approval',
                $label . ' (' . $ref . ') requires Super Admin approval (Approval #' . $approvalId . ').',
                'ledger_txn_change',
                $approvalId
            );
        } catch (\Throwable $e) {
            error_log('[LedgerTxnChange] notify superadmins: ' . $e->getMessage());
        }
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    public static function compactTxnSnapshot(array $row): array
    {
        $keys = [
            'id', 'txn_type', 'txn_date', 'narration', 'debit', 'credit', 'amount',
            'billing_profile_code', 'invoice_number', 'invoice_status', 'due_date',
            'payment_method', 'reference_number', 'expense_purpose', 'paid_from',
            'tds_status', 'tds_section', 'tds_rate',
            'linked_txn_id', 'notes', 'status', 'public_ref',
            'ledger_class', 'ledger_movement_kind', 'client_id', 'organization_id',
        ];
        $out = [];
        foreach ($keys as $k) {
            if (array_key_exists($k, $row)) {
                $out[$k] = $row[$k];
            }
        }

        return $out;
    }

    public static function actionLabel(string $action): string
    {
        return match ($action) {
            LedgerTxnChangeRequestModel::ACTION_UPDATE          => 'Edit',
            LedgerTxnChangeRequestModel::ACTION_REVERSE         => 'Reverse',
            LedgerTxnChangeRequestModel::ACTION_CANCEL          => 'Cancel',
            LedgerTxnChangeRequestModel::ACTION_CANCEL_REVERSAL => 'Cancel reversal',
            default                                             => $action,
        };
    }
}
