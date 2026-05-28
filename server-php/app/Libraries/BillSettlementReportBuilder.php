<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\TxnModel;
use App\Models\TxnSettlementAllocationModel;

/**
 * Bill-by-bill settlement vs ledger_class + ledger_view, with reconciliation footer.
 */
final class BillSettlementReportBuilder
{
    /**
     * @return array{
     *   lines: list<array<string, mixed>>,
     *   ledger_closing_balance: float,
     *   report_net: float,
     *   reconciliation_gap: float,
     *   ledger_view: string,
     *   ledger_class: string
     * }
     */
    public static function build(
        TxnModel $txn,
        int $clientId,
        int $orgId,
        string $ledgerClass,
        string $ledgerView,
        ?string $dateFrom,
        ?string $dateTo
    ): array {
        $ledgerClass = LedgerDimensions::normalizeLedgerClass($ledgerClass);
        $ledgerView  = LedgerDimensions::assertLedgerView($ledgerView);

        if ($ledgerClass === LedgerDimensions::CLASS_PARKED) {
            $closing = 0.0;
            if ($clientId > 0) {
                $built = LedgerPresentation::buildLedger(
                    $txn->fetchRawLedgerRowsForClient($clientId, $ledgerClass),
                    $ledgerView
                );
            } else {
                $built = LedgerPresentation::buildLedger(
                    $txn->fetchRawLedgerRowsForOrganization($orgId, $ledgerClass),
                    $ledgerView
                );
            }
            if ($built !== []) {
                $last = $built[count($built) - 1];
                $closing = round((float)($last['balance'] ?? 0), 2);
            }

            return [
                'lines'                  => [],
                'ledger_closing_balance' => $closing,
                'report_net'             => 0.0,
                'reconciliation_gap'     => $closing,
                'ledger_view'            => $ledgerView,
                'ledger_class'           => $ledgerClass,
            ];
        }

        if ($clientId > 0) {
            $rows = $txn->fetchRawLedgerRowsForClient($clientId, $ledgerClass);
        } elseif ($orgId > 0) {
            $rows = $txn->fetchRawLedgerRowsForOrganization($orgId, $ledgerClass);
        } else {
            throw new \InvalidArgumentException('client_id or organization_id is required.');
        }

        $rows = self::applyDateRangeWithCarryForward($rows, $dateFrom, $dateTo, $ledgerClass, $ledgerView);

        $ledgerBuilt = LedgerPresentation::buildLedger($rows, $ledgerView);
        $ledgerClosing = 0.0;
        if ($ledgerBuilt !== []) {
            $last = $ledgerBuilt[count($ledgerBuilt) - 1];
            $ledgerClosing = round((float)($last['balance'] ?? 0), 2);
        }

        $allocModel = new TxnSettlementAllocationModel();
        $allocRows  = $allocModel->listReceiptAllocationsForReporting($clientId, $orgId, $ledgerClass, $dateFrom, $dateTo);

        $invoiceById = [];
        foreach ($rows as $t) {
            if (($t['txn_type'] ?? '') === 'invoice') {
                $invoiceById[(int)$t['id']] = $t;
            }
        }

        $creditNotesByInvoice = [];
        foreach ($rows as $t) {
            if (($t['txn_type'] ?? '') !== 'credit_note') {
                continue;
            }
            $lid = (int)($t['linked_txn_id'] ?? 0);
            if ($lid <= 0) {
                continue;
            }
            $creditNotesByInvoice[$lid][] = $t;
        }

        $allocByInvoice = [];
        $allocByPayment = [];
        $unallocatedLines = [];
        foreach ($allocRows as $ar) {
            $tt = (string)($ar['target_type'] ?? '');
            if ($tt === 'invoice') {
                $iid = (int)($ar['target_txn_id'] ?? 0);
                if ($iid > 0) {
                    $allocByInvoice[$iid][] = $ar;
                }
            } elseif ($tt === 'payment_expense') {
                $pid = (int)($ar['target_txn_id'] ?? 0);
                if ($pid > 0) {
                    $allocByPayment[$pid][] = $ar;
                }
            } elseif ($tt === 'unallocated_advance') {
                $unallocatedLines[] = $ar;
            }
        }

        $lines = [];

        /** Invoice / slice rows */
        foreach ($invoiceById as $iid => $inv) {
            if (in_array((string)($inv['status'] ?? ''), ['cancelled', 'reversed'], true)) {
                continue;
            }
            if (in_array((string)($inv['invoice_status'] ?? ''), ['cancelled', 'reversed'], true)) {
                continue;
            }
            $parts = LedgerPresentation::invoiceBucketParts($inv);

            if ($ledgerView === LedgerDimensions::VIEW_CONSOLIDATED) {
                $gross = $parts['inv_total'];
                $cnTotal = 0.0;
                foreach ($creditNotesByInvoice[$iid] ?? [] as $cn) {
                    $cnTotal += round((float)($cn['amount'] ?? 0), 2);
                }
                $applied = self::sumAllocationsForInvoiceView($allocByInvoice[$iid] ?? [], null);
                $outstanding = round($gross - $cnTotal - $applied, 2);
                $lines[] = self::lineInvoice($inv, $ledgerView, $gross, $cnTotal, $applied, $outstanding, $parts);

                continue;
            }

            if ($ledgerView === LedgerDimensions::VIEW_FEES && $parts['fee_total'] > 0.00001) {
                $gross  = $parts['fee_total'];
                $cnPart = 0.0;
                foreach ($creditNotesByInvoice[$iid] ?? [] as $cn) {
                    $cnPart += LedgerPresentation::creditNoteCreditForSlice($cn, $inv, LedgerDimensions::VIEW_FEES);
                }
                $applied = self::sumAllocationsForInvoiceView($allocByInvoice[$iid] ?? [], LedgerDimensions::KIND_FEES);
                $outstanding = round($gross - $cnPart - $applied, 2);
                $lines[] = self::lineInvoice($inv, $ledgerView, $gross, $cnPart, $applied, $outstanding, $parts);

                continue;
            }

            if ($ledgerView === LedgerDimensions::VIEW_REIMBURSEMENT && $parts['reim_total'] > 0.00001) {
                $gross  = $parts['reim_total'];
                $cnPart = 0.0;
                foreach ($creditNotesByInvoice[$iid] ?? [] as $cn) {
                    $cnPart += LedgerPresentation::creditNoteCreditForSlice($cn, $inv, LedgerDimensions::VIEW_REIMBURSEMENT);
                }
                $applied = self::sumAllocationsForInvoiceView($allocByInvoice[$iid] ?? [], LedgerDimensions::KIND_REIMBURSEMENT);
                $outstanding = round($gross - $cnPart - $applied, 2);
                $lines[] = self::lineInvoice($inv, $ledgerView, $gross, $cnPart, $applied, $outstanding, $parts);
            }
        }

        /** Payment expenses */
        foreach ($rows as $t) {
            if (($t['txn_type'] ?? '') !== 'payment_expense') {
                continue;
            }
            if (in_array((string)($t['status'] ?? ''), ['cancelled', 'reversed'], true)) {
                continue;
            }
            $kind = (string)($t['ledger_movement_kind'] ?? '');
            if ($ledgerView !== LedgerDimensions::VIEW_CONSOLIDATED && $kind !== $ledgerView) {
                continue;
            }
            $pid       = (int)$t['id'];
            $gross     = round((float)($t['amount'] ?? 0), 2);
            $applied   = self::sumAllocationsForPaymentView($allocByPayment[$pid] ?? [], $ledgerView);
            $outstd    = round($gross - $applied, 2);
            $lines[]   = [
                'line_kind'           => 'payment_expense',
                'txn_id'              => $pid,
                'public_ref'          => $t['public_ref'] ?? null,
                'date'                => (string)($t['txn_date'] ?? ''),
                'label'               => (string)($t['narration'] ?? 'Payment expense'),
                'gross'               => $gross,
                'credit_note_credits' => 0.0,
                'applied_receipts'    => $applied,
                'outstanding'         => $outstd,
                'net_balance_effect'  => $outstd,
                'ledger_movement_kind'=> $kind,
            ];
        }

        /** Unallocated advances */
        foreach ($unallocatedLines as $ur) {
            $amt = round((float)($ur['amount'] ?? 0), 2);
            $rk  = (string)($ur['receipt_kind'] ?? '');
            if ($ledgerView !== LedgerDimensions::VIEW_CONSOLIDATED && $rk !== $ledgerView) {
                continue;
            }
            $lines[] = [
                'line_kind'           => 'unallocated_advance',
                'txn_id'              => (int)($ur['receipt_id'] ?? 0),
                'public_ref'          => $ur['public_ref'] ?? null,
                'allocation_id'       => (int)($ur['id'] ?? 0),
                'date'                => (string)($ur['receipt_date'] ?? ''),
                'label'               => 'Unallocated advance (receipt)',
                'gross'               => $amt,
                'credit_note_credits' => 0.0,
                'applied_receipts'    => $amt,
                'outstanding'         => round(-$amt, 2),
                'net_balance_effect'  => round(-$amt, 2),
                'ledger_movement_kind'=> $rk,
            ];
        }

        /** Other movements: opening_balance, TDS, rebate, ledger reversals (same visibility rules as buildSliced) */
        foreach ($rows as $t) {
            $type = (string)($t['txn_type'] ?? '');
            if (!in_array($type, [
                'opening_balance',
                'tds_provisional', 'tds_final', 'rebate',
                'receipt_reversal', 'payment_expense_reversal', 'tds_reversal',
            ], true)) {
                continue;
            }
            if ($type === 'opening_balance') {
                if ($ledgerView !== LedgerDimensions::VIEW_CONSOLIDATED) {
                    $obKind = (string)($t['ledger_movement_kind'] ?? '');
                    if ($obKind === '' || $obKind !== $ledgerView) {
                        continue;
                    }
                }
            } elseif ($type !== 'opening_balance') {
                $kind = (string)($t['ledger_movement_kind'] ?? '');
                if ($ledgerView !== LedgerDimensions::VIEW_CONSOLIDATED && $kind !== $ledgerView) {
                    continue;
                }
            }
            $debit  = round((float)($t['debit'] ?? 0), 2);
            $credit = round((float)($t['credit'] ?? 0), 2);
            $net    = round($debit - $credit, 2);
            $lines[] = [
                'line_kind'           => 'adjustment',
                'txn_id'              => (int)$t['id'],
                'txn_type'            => $type,
                'public_ref'          => $t['public_ref'] ?? null,
                'date'                => (string)($t['txn_date'] ?? ''),
                'label'               => (string)($t['narration'] ?? $type),
                'gross'               => $net,
                'credit_note_credits' => 0.0,
                'applied_receipts'    => 0.0,
                'outstanding'         => $net,
                'net_balance_effect'  => $net,
                'ledger_movement_kind'=> $t['ledger_movement_kind'] ?? null,
            ];
        }

        $reportNet = 0.0;
        foreach ($lines as $ln) {
            $reportNet += (float)($ln['net_balance_effect'] ?? 0);
        }
        $reportNet     = round($reportNet, 2);
        $reconGap      = round($ledgerClosing - $reportNet, 2);

        return [
            'lines'                 => $lines,
            'ledger_closing_balance'=> $ledgerClosing,
            'report_net'            => $reportNet,
            'reconciliation_gap'    => $reconGap,
            'ledger_view'           => $ledgerView,
            'ledger_class'          => $ledgerClass,
        ];
    }

    /**
     * @param list<array<string, mixed>> $allocRows
     */
    private static function sumAllocationsForInvoiceView(array $allocRows, ?string $kindFilter): float
    {
        $sum = 0.0;
        foreach ($allocRows as $ar) {
            $rk = (string)($ar['receipt_kind'] ?? '');
            if ($kindFilter !== null && $rk !== $kindFilter) {
                continue;
            }
            $sum += round((float)($ar['amount'] ?? 0), 2);
        }

        return round($sum, 2);
    }

    /**
     * @param list<array<string, mixed>> $allocRows
     */
    private static function sumAllocationsForPaymentView(array $allocRows, string $ledgerView): float
    {
        $sum = 0.0;
        foreach ($allocRows as $ar) {
            $rk = (string)($ar['receipt_kind'] ?? '');
            if ($ledgerView !== LedgerDimensions::VIEW_CONSOLIDATED && $rk !== $ledgerView) {
                continue;
            }
            $sum += round((float)($ar['amount'] ?? 0), 2);
        }

        return round($sum, 2);
    }

    /**
     * @param array<string, mixed> $inv
     * @param array{fee_total: float, reim_total: float, inv_total: float} $parts
     * @return array<string, mixed>
     */
    private static function lineInvoice(
        array $inv,
        string $ledgerView,
        float $gross,
        float $cnPart,
        float $applied,
        float $outstanding,
        array $parts
    ): array {
        $slice = $ledgerView;
        if ($ledgerView === LedgerDimensions::VIEW_FEES) {
            $slice = 'fees';
        } elseif ($ledgerView === LedgerDimensions::VIEW_REIMBURSEMENT) {
            $slice = 'reimbursement';
        } else {
            $slice = 'consolidated';
        }

        return [
            'line_kind'            => 'invoice',
            'txn_id'               => (int)$inv['id'],
            'public_ref'           => $inv['public_ref'] ?? null,
            'invoice_number'       => $inv['invoice_number'] ?? null,
            'invoice_status'       => $inv['invoice_status'] ?? null,
            'date'                 => (string)($inv['txn_date'] ?? ''),
            'label'                => trim((string)($inv['invoice_number'] ?? $inv['narration'] ?? 'Invoice'))
                . ($slice !== 'consolidated' ? (' — ' . $slice) : ''),
            'gross'                => round($gross, 2),
            'credit_note_credits'  => round($cnPart, 2),
            'applied_receipts'     => round($applied, 2),
            'outstanding'          => round($outstanding, 2),
            'net_balance_effect'   => round($outstanding, 2),
            'ledger_slice'         => $slice,
            'fee_total'            => $parts['fee_total'],
            'reim_total'           => $parts['reim_total'],
        ];
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    private static function applyDateRangeWithCarryForward(
        array $rows,
        ?string $dateFrom,
        ?string $dateTo,
        string $ledgerClass,
        string $ledgerView
    ): array {
        if ($dateFrom === null || $dateFrom === '') {
            return self::filterByDateRange($rows, $dateFrom, $dateTo);
        }
        if (!LedgerDateRangeCarryForward::isValidYmd($dateFrom)) {
            return self::filterByDateRange($rows, $dateFrom, $dateTo);
        }

        $before  = [];
        $inRange = [];
        foreach ($rows as $t) {
            $d = (string)($t['txn_date'] ?? '');
            if ($d === '') {
                continue;
            }
            if (strcmp($d, $dateFrom) < 0) {
                $before[] = $t;
            } elseif ($dateTo === null || $dateTo === '' || strcmp($d, $dateTo) <= 0) {
                $inRange[] = $t;
            }
        }

        $bfBalance = LedgerDateRangeCarryForward::clientLedgerCarryForward($before, $ledgerView);
        $synthetic = LedgerDateRangeCarryForward::syntheticBalanceBfTxn($bfBalance, $dateFrom, $ledgerClass);

        return array_merge([$synthetic], $inRange);
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    private static function filterByDateRange(array $rows, ?string $dateFrom, ?string $dateTo): array
    {
        if (($dateFrom === null || $dateFrom === '') && ($dateTo === null || $dateTo === '')) {
            return $rows;
        }
        $out = [];
        foreach ($rows as $t) {
            $d = (string)($t['txn_date'] ?? '');
            if ($dateFrom !== null && $dateFrom !== '' && strcmp($d, $dateFrom) < 0) {
                continue;
            }
            if ($dateTo !== null && $dateTo !== '' && strcmp($d, $dateTo) > 0) {
                continue;
            }
            $out[] = $t;
        }

        return $out;
    }
}
