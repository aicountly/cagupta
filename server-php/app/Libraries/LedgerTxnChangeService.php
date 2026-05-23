<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\BillingFirmModel;
use App\Models\FirmBankAccountModel;
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
        $requestReason = null;
        if (array_key_exists('request_reason', $payload)) {
            $requestReason = trim((string)$payload['request_reason']);
            unset($payload['request_reason']);
        }

        return self::queue(
            $txnId,
            LedgerTxnChangeRequestModel::ACTION_UPDATE,
            $payload,
            $requestReason !== '' ? $requestReason : null,
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
            'firm_bank_account_id', 'counterparty_firm_bank_account_id', 'firm_expense_category',
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

    /**
     * Human-readable before/after rows for Team Approvals UI.
     *
     * @return list<array{field: string, before: string, after: string}>
     */
    public static function buildChangeRows(
        array $snap,
        array $payload,
        string $action,
        ?string $txnType = null
    ): array {
        $txnType = $txnType ?: (string)($snap['txn_type'] ?? '');

        if ($action === LedgerTxnChangeRequestModel::ACTION_REVERSE) {
            $reason = trim((string)($payload['reason'] ?? ''));
            if ($reason === '') {
                return [];
            }

            return [['field' => 'Reversal reason', 'before' => '—', 'after' => $reason]];
        }

        if ($action === LedgerTxnChangeRequestModel::ACTION_CANCEL
            && isset($snap['bulk']) && is_array($snap['bulk'])) {
            return self::buildBulkCancelSummaryRows($snap['bulk']);
        }

        if ($action === LedgerTxnChangeRequestModel::ACTION_CANCEL
            || $action === LedgerTxnChangeRequestModel::ACTION_CANCEL_REVERSAL) {
            return self::buildSnapshotSummaryRows($snap, $txnType);
        }

        if ($action !== LedgerTxnChangeRequestModel::ACTION_UPDATE) {
            return [];
        }

        return self::buildUpdateDiffRows($snap, $payload, $txnType);
    }

    /**
     * One summary row per txn for bulk cancel approvals.
     *
     * @param list<array<string, mixed>> $bulk
     *
     * @return list<array{field: string, before: string, after: string}>
     */
    private static function buildBulkCancelSummaryRows(array $bulk): array
    {
        $banks = new FirmBankAccountModel();
        $firms = new BillingFirmModel();
        $rows  = [];

        foreach ($bulk as $item) {
            if (!is_array($item)) {
                continue;
            }
            $id   = (int)($item['id'] ?? 0);
            $type = self::txnTypeLabel((string)($item['txn_type'] ?? ''));
            $date = trim((string)($item['txn_date'] ?? ''));
            $ref  = trim((string)($item['public_ref'] ?? $item['invoice_number'] ?? ''));
            $amt  = self::formatFieldValue('amount', $item['amount'] ?? 0, $item, $banks, $firms);
            $parts = array_filter([$date !== '' ? $date : null, $ref !== '' ? $ref : null, $amt !== '—' ? $amt : null]);
            $rows[] = [
                'field'  => 'Txn #' . ($id > 0 ? $id : '?') . ' — ' . $type,
                'before' => $parts !== [] ? implode(' · ', $parts) : '—',
                'after'  => '—',
            ];
        }

        return $rows;
    }

    /**
     * @return list<array{field: string, before: string, after: string}>
     */
    private static function buildSnapshotSummaryRows(array $snap, string $txnType): array
    {
        $banks = new FirmBankAccountModel();
        $firms = new BillingFirmModel();
        $rows  = [];

        if ($txnType !== '') {
            $rows[] = [
                'field'  => 'Transaction type',
                'before' => self::txnTypeLabel($txnType),
                'after'  => '—',
            ];
        }

        foreach (self::snapshotFieldDefs($txnType) as $key => $label) {
            if (!array_key_exists($key, $snap)) {
                continue;
            }
            $val = self::formatFieldValue($key, $snap[$key], $snap, $banks, $firms);
            if ($val === '—') {
                continue;
            }
            $rows[] = ['field' => $label, 'before' => $val, 'after' => '—'];
        }

        return $rows;
    }

    /**
     * @return list<array{field: string, before: string, after: string}>
     */
    private static function buildUpdateDiffRows(array $snap, array $payload, string $txnType): array
    {
        $banks = new FirmBankAccountModel();
        $firms = new BillingFirmModel();
        $rows  = [];

        if ($txnType === 'firm_bank_transfer') {
            $rows = array_merge($rows, self::firmBankTransferDiffRows($snap, $payload, $banks, $firms));
        }

        $skipKeys = [
            'request_reason', 'pair_txn_ids', 'txn_type', 'otp',
            'from_firm_bank_account_id', 'to_firm_bank_account_id',
            'transfer_scope', 'allocations', 'settlement_lines', 'line_items',
        ];

        foreach (self::updateFieldDefs($txnType) as $key => $label) {
            if (in_array($key, $skipKeys, true) || !array_key_exists($key, $payload)) {
                continue;
            }
            $beforeRaw = $snap[$key] ?? null;
            $afterRaw  = $payload[$key];
            if (!self::valuesDiffer($beforeRaw, $afterRaw)) {
                continue;
            }
            $rows[] = [
                'field'  => $label,
                'before' => self::formatFieldValue($key, $beforeRaw, $snap, $banks, $firms),
                'after'  => self::formatFieldValue($key, $afterRaw, $snap, $banks, $firms),
            ];
        }

        if ($txnType === 'firm_expense' || $txnType === 'firm_inflow') {
            $beforeBank = (int)($snap['firm_bank_account_id'] ?? 0);
            $afterBank  = (int)($payload['firm_bank_account_id'] ?? $beforeBank);
            if ($beforeBank !== $afterBank) {
                self::appendRowIfMissing(
                    $rows,
                    'Bank / cash account',
                    self::formatBankAccountLabel($beforeBank, $banks),
                    self::formatBankAccountLabel($afterBank, $banks)
                );
                $beforeBilling = (string)($snap['billing_profile_code'] ?? '');
                $afterBilling  = self::billingCodeForAccount($afterBank, $banks) ?: $beforeBilling;
                if ($beforeBilling !== $afterBilling) {
                    self::appendRowIfMissing(
                        $rows,
                        'Billing firm',
                        self::formatBillingProfile($beforeBilling, $firms),
                        self::formatBillingProfile($afterBilling, $firms)
                    );
                }
            }
        }

        if (array_key_exists('firm_bank_account_id', $payload)
            && !in_array($txnType, ['firm_bank_transfer', 'firm_expense', 'firm_inflow'], true)) {
            $beforeBank = (int)($snap['firm_bank_account_id'] ?? 0);
            $afterBank  = (int)$payload['firm_bank_account_id'];
            if ($beforeBank !== $afterBank) {
                self::appendRowIfMissing(
                    $rows,
                    'Bank / cash account',
                    self::formatBankAccountLabel($beforeBank, $banks),
                    self::formatBankAccountLabel($afterBank, $banks)
                );
            }
        }

        if (array_key_exists('allocations', $payload) && is_array($payload['allocations'])) {
            $afterTotal = 0.0;
            foreach ($payload['allocations'] as $line) {
                if (is_array($line)) {
                    $afterTotal += (float)($line['amount'] ?? 0);
                }
            }
            $rows[] = [
                'field'  => 'Receipt allocations',
                'before' => 'Current allocations',
                'after'  => count($payload['allocations']) . ' line(s), total '
                    . self::formatMoney($afterTotal),
            ];
        }

        if (array_key_exists('settlement_lines', $payload) && is_array($payload['settlement_lines'])) {
            $afterTotal = 0.0;
            foreach ($payload['settlement_lines'] as $line) {
                if (is_array($line)) {
                    $afterTotal += (float)($line['amount'] ?? 0);
                }
            }
            $rows[] = [
                'field'  => 'Settlement lines',
                'before' => 'Current settlements',
                'after'  => count($payload['settlement_lines']) . ' line(s), total '
                    . self::formatMoney($afterTotal),
            ];
        }

        if (array_key_exists('line_items', $payload) && is_array($payload['line_items'])) {
            $afterTotal = 0.0;
            foreach ($payload['line_items'] as $line) {
                if (is_array($line)) {
                    $afterTotal += (float)($line['amount'] ?? 0);
                }
            }
            $rows[] = [
                'field'  => 'Invoice line items',
                'before' => self::formatMoney((float)($snap['subtotal'] ?? $snap['amount'] ?? 0)),
                'after'  => count($payload['line_items']) . ' line(s), subtotal '
                    . self::formatMoney($afterTotal),
            ];
        }

        if (array_key_exists('transfer_scope', $payload)) {
            $scopeAfter = trim((string)$payload['transfer_scope']);
            if ($scopeAfter !== '') {
                $beforeFrom = (int)($snap['firm_bank_account_id'] ?? 0);
                $beforeTo   = (int)($snap['counterparty_firm_bank_account_id'] ?? 0);
                $scopeBefore = self::inferTransferScope($beforeFrom, $beforeTo, $banks);
                if ($scopeBefore !== $scopeAfter) {
                    self::appendRowIfMissing(
                        $rows,
                        'Transfer scope',
                        self::transferScopeLabel($scopeBefore),
                        self::transferScopeLabel($scopeAfter)
                    );
                }
            }
        }

        return $rows;
    }

    /**
     * @return list<array{field: string, before: string, after: string}>
     */
    private static function firmBankTransferDiffRows(
        array $snap,
        array $payload,
        FirmBankAccountModel $banks,
        BillingFirmModel $firms
    ): array {
        $rows = [];
        $beforeFrom = (int)($snap['firm_bank_account_id'] ?? 0);
        $beforeTo   = (int)($snap['counterparty_firm_bank_account_id'] ?? 0);
        $afterFrom  = (int)($payload['from_firm_bank_account_id'] ?? $payload['firm_bank_account_id'] ?? $beforeFrom);
        $afterTo    = (int)($payload['to_firm_bank_account_id'] ?? $payload['counterparty_firm_bank_account_id'] ?? $beforeTo);

        if ($beforeFrom !== $afterFrom) {
            $rows[] = [
                'field'  => 'From account',
                'before' => self::formatBankAccountLabel($beforeFrom, $banks),
                'after'  => self::formatBankAccountLabel($afterFrom, $banks),
            ];
        }
        if ($beforeTo !== $afterTo) {
            $rows[] = [
                'field'  => 'To account',
                'before' => self::formatBankAccountLabel($beforeTo, $banks),
                'after'  => self::formatBankAccountLabel($afterTo, $banks),
            ];
        }

        $beforeBillingFrom = (string)($snap['billing_profile_code'] ?? '');
        $afterBillingFrom  = self::billingCodeForAccount($afterFrom, $banks) ?: $beforeBillingFrom;
        if ($beforeBillingFrom !== $afterBillingFrom) {
            $rows[] = [
                'field'  => 'Billing firm (from leg)',
                'before' => self::formatBillingProfile($beforeBillingFrom, $firms),
                'after'  => self::formatBillingProfile($afterBillingFrom, $firms),
            ];
        }

        $beforeBillingTo = self::billingCodeForAccount($beforeTo, $banks);
        $afterBillingTo  = self::billingCodeForAccount($afterTo, $banks);
        if ($beforeBillingTo !== $afterBillingTo) {
            $rows[] = [
                'field'  => 'Billing firm (to leg)',
                'before' => self::formatBillingProfile($beforeBillingTo, $firms),
                'after'  => self::formatBillingProfile($afterBillingTo, $firms),
            ];
        }

        return $rows;
    }

    /** @return array<string, string> */
    private static function updateFieldDefs(string $txnType): array
    {
        $common = [
            'txn_date'             => 'Date',
            'amount'               => 'Amount',
            'narration'            => 'Narration',
            'notes'                => 'Notes',
            'billing_profile_code' => 'Billing firm',
            'payment_method'       => 'Payment method',
            'reference_number'     => 'Reference no.',
            'expense_purpose'      => 'Purpose',
            'paid_from'            => 'Paid from',
            'firm_expense_category'=> 'Category',
            'invoice_status'       => 'Invoice status',
            'due_date'             => 'Due date',
            'subtotal'             => 'Subtotal',
            'tax_percent'          => 'Tax %',
            'tax_amount'           => 'Tax amount',
            'tds_section'          => 'TDS section',
            'tds_rate'             => 'TDS rate',
            'tds_status'           => 'TDS status',
            'ledger_class'         => 'Ledger class',
            'ledger_movement_kind' => 'Movement kind',
        ];

        return $common;
    }

    /** @return array<string, string> */
    private static function snapshotFieldDefs(string $txnType): array
    {
        $defs = self::updateFieldDefs($txnType);
        if ($txnType === 'firm_bank_transfer') {
            $defs['firm_bank_account_id']              = 'From account';
            $defs['counterparty_firm_bank_account_id'] = 'To account';
        } elseif ($txnType === 'firm_expense' || $txnType === 'firm_inflow') {
            $defs['firm_bank_account_id'] = 'Bank / cash account';
        }

        $defs['public_ref']     = 'Reference';
        $defs['invoice_number'] = 'Invoice no.';

        return $defs;
    }

    /**
     * @param list<array{field: string, before: string, after: string}> $rows
     */
    private static function appendRowIfMissing(array &$rows, string $field, string $before, string $after): void
    {
        foreach ($rows as $row) {
            if (($row['field'] ?? '') === $field) {
                return;
            }
        }
        $rows[] = ['field' => $field, 'before' => $before, 'after' => $after];
    }

    private static function billingCodeForAccount(int $accountId, FirmBankAccountModel $banks): string
    {
        if ($accountId <= 0) {
            return '';
        }
        $acc = $banks->find($accountId);

        return $acc !== null ? trim((string)($acc['billing_firm_code'] ?? '')) : '';
    }

    private static function inferTransferScope(int $fromId, int $toId, FirmBankAccountModel $banks): string
    {
        $fromCode = self::billingCodeForAccount($fromId, $banks);
        $toCode   = self::billingCodeForAccount($toId, $banks);
        if ($fromCode === '' || $toCode === '') {
            return '';
        }

        return $fromCode === $toCode ? 'intra' : 'inter';
    }

    private static function transferScopeLabel(string $scope): string
    {
        return match ($scope) {
            'intra' => 'Intra-firm (same billing entity)',
            'inter' => 'Inter-firm (cross billing entity)',
            default => $scope !== '' ? $scope : '—',
        };
    }

    private static function formatBankAccountLabel(int $accountId, FirmBankAccountModel $banks): string
    {
        if ($accountId <= 0) {
            return '—';
        }
        $acc = $banks->find($accountId);
        if ($acc === null) {
            return 'Account #' . $accountId;
        }
        $name = trim((string)($acc['name'] ?? 'Account'));
        $firm = trim((string)($acc['billing_firm_name'] ?? $acc['billing_firm_code'] ?? ''));
        $code = trim((string)($acc['billing_firm_code'] ?? ''));

        return $firm !== '' ? $name . ' · ' . $firm . ' (' . $code . ')' : $name;
    }

    private static function formatBillingProfile(?string $code, BillingFirmModel $firms): string
    {
        $code = trim((string)$code);
        if ($code === '') {
            return '—';
        }
        $firm = $firms->findByCode($code);
        if ($firm === null) {
            return $code;
        }
        $name = trim((string)($firm['name'] ?? ''));

        return $name !== '' ? $name . ' (' . $code . ')' : $code;
    }

    /**
     * @param array<string, mixed> $snap
     */
    private static function formatFieldValue(
        string $key,
        mixed $value,
        array $snap,
        FirmBankAccountModel $banks,
        BillingFirmModel $firms
    ): string {
        if ($value === null || $value === '') {
            return '—';
        }

        if ($key === 'firm_bank_account_id' || $key === 'counterparty_firm_bank_account_id') {
            return self::formatBankAccountLabel((int)$value, $banks);
        }
        if ($key === 'billing_profile_code') {
            return self::formatBillingProfile((string)$value, $firms);
        }
        if ($key === 'amount' || $key === 'subtotal' || $key === 'tax_amount' || $key === 'debit' || $key === 'credit') {
            return self::formatMoney((float)$value);
        }
        if ($key === 'firm_expense_category') {
            return self::firmExpenseCategoryLabel((string)$value);
        }
        if ($key === 'expense_purpose') {
            return self::expensePurposeLabel((string)$value);
        }
        if ($key === 'narration') {
            $n = trim((string)$value);

            return preg_replace('/\s*\((out|in)\)\s*$/i', '', $n) ?: $n;
        }

        return trim((string)$value);
    }

    private static function formatMoney(float $amount): string
    {
        return '₹' . number_format($amount, 2, '.', ',');
    }

    private static function firmExpenseCategoryLabel(string $value): string
    {
        return match ($value) {
            'salary'        => 'Salary',
            'drawings'      => 'Drawings',
            'rent'          => 'Rent',
            'electricity'   => 'Electricity',
            'bank_charges'  => 'Bank charges',
            'subscription_expenses' => 'Subscription Expenses',
            'repair_maintenance'    => 'Repair & Maintenance',
            'fund_infusion' => 'Fund infusion',
            'other'         => 'Other',
            default         => $value !== '' ? $value : '—',
        };
    }

    private static function expensePurposeLabel(string $value): string
    {
        return match ($value) {
            'challan'          => 'Challan',
            'stamp_paper'      => 'Stamp paper / duty',
            'notary'           => 'Notary',
            'statutory_fee'    => 'Statutory / government fee',
            'dept_office_misc' => 'Dept. / office (misc.)',
            'misc'             => 'Miscellaneous',
            'other'            => 'Other',
            default            => $value !== '' ? $value : '—',
        };
    }

    private static function txnTypeLabel(string $txnType): string
    {
        return match ($txnType) {
            'firm_bank_transfer'   => 'Bank transfer',
            'firm_expense'         => 'Firm expense',
            'firm_inflow'          => 'Firm inflow',
            'invoice'              => 'Invoice',
            'receipt'              => 'Receipt',
            'payment_expense'      => 'On-behalf payment',
            'payment_client_cost'  => 'Client cost payment',
            'tds_provisional'      => 'TDS (provisional)',
            'tds_final'            => 'TDS (final)',
            default                => str_replace('_', ' ', $txnType),
        };
    }

    private static function valuesDiffer(mixed $before, mixed $after): bool
    {
        if (is_numeric($before) && is_numeric($after)) {
            return abs((float)$before - (float)$after) > 0.00001;
        }

        return trim((string)$before) !== trim((string)$after);
    }
}
