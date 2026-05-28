<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Builds client-facing ledger rows with optional slicing by fees vs reimbursement.
 */
final class LedgerPresentation
{
    private const SLICE_FEES             = 1;
    private const SLICE_REIMBURSEMENT    = 2;

    /**
     * @param array<int, array<string, mixed>> $rows  Raw txn rows (decoded JSON), any order
     * @return array<int, array<string, mixed>>
     */
    public static function buildLedger(array $rows, string $ledgerView): array
    {
        $ledgerView = LedgerDimensions::assertLedgerView($ledgerView);
        usort($rows, static function (array $a, array $b): int {
            $da = strcmp((string)($a['txn_date'] ?? ''), (string)($b['txn_date'] ?? ''));
            if ($da !== 0) {
                return $da;
            }
            $ta = (string)($a['txn_type'] ?? '');
            $tb = (string)($b['txn_type'] ?? '');
            if ($ta !== $tb) {
                return strcmp($ta, $tb);
            }

            return ((int)($a['id'] ?? 0)) <=> ((int)($b['id'] ?? 0));
        });
        if ($ledgerView === LedgerDimensions::VIEW_CONSOLIDATED) {
            return self::buildConsolidated($rows);
        }

        return self::buildSliced($rows, $ledgerView);
    }

    /**
     * Merge multiple opening_balance txn rows into one synthetic row for group ledger view.
     *
     * @param array<int, array<string, mixed>> $obRows
     * @return array<string, mixed>|null
     */
    public static function consolidateOpeningBalances(array $obRows, string $ledgerView): ?array
    {
        $ledgerView = LedgerDimensions::assertLedgerView($ledgerView);
        $filtered   = [];
        foreach ($obRows as $t) {
            if (($t['txn_type'] ?? '') !== 'opening_balance') {
                continue;
            }
            if ($ledgerView === LedgerDimensions::VIEW_CONSOLIDATED) {
                $filtered[] = $t;
            } elseif ($ledgerView === LedgerDimensions::VIEW_FEES) {
                if (self::movementKindForSlicedNonInvoiceRow($t) === LedgerDimensions::KIND_FEES) {
                    $filtered[] = $t;
                }
            } elseif (self::movementKindForSlicedNonInvoiceRow($t) === LedgerDimensions::KIND_REIMBURSEMENT) {
                $filtered[] = $t;
            }
        }
        if ($filtered === []) {
            return null;
        }

        $net          = 0.0;
        $earliestDate = '';
        $ledgerClass  = LedgerDimensions::CLASS_REGULAR;
        foreach ($filtered as $t) {
            $net += (float)($t['debit'] ?? 0) - (float)($t['credit'] ?? 0);
            $d = (string)($t['txn_date'] ?? '');
            if ($d !== '' && ($earliestDate === '' || $d < $earliestDate)) {
                $earliestDate = $d;
            }
            $ledgerClass = LedgerDimensions::normalizeLedgerClass($t['ledger_class'] ?? null);
        }
        if (abs($net) < 0.00001) {
            return null;
        }

        $debit  = $net > 0 ? round($net, 2) : 0.0;
        $credit = $net < 0 ? round(-$net, 2) : 0.0;

        return [
            'id'                   => 0,
            'txn_type'             => 'opening_balance',
            'txn_date'             => $earliestDate !== '' ? $earliestDate : date('Y-m-d'),
            'narration'            => 'Consolidated opening balance',
            'debit'                => $debit,
            'credit'               => $credit,
            'amount'               => round(abs($net), 2),
            'ledger_class'         => $ledgerClass,
            'billing_profile_code' => null,
            'status'               => 'active',
        ];
    }

    /**
     * Fees / reimbursement slice: non-invoice rows use ledger_movement_kind; empty matches migration 061 default (fees).
     */
    private static function movementKindForSlicedNonInvoiceRow(array $t): string
    {
        $kind = trim((string)($t['ledger_movement_kind'] ?? ''));
        if ($kind !== '') {
            return $kind;
        }

        return LedgerDimensions::KIND_FEES;
    }

    /**
     * @param array<int, array<string, mixed>> $rows sorted
     * @return array<int, array<string, mixed>>
     */
    private static function buildConsolidated(array $rows): array
    {
        $out   = [];
        $balance = 0.0;
        foreach ($rows as $t) {
            $row = self::txnToLedgerRow($t);
            $balance += (float)$row['debit'] - (float)$row['credit'];
            $row['balance'] = round($balance, 2);
            $out[] = $row;
        }

        return $out;
    }

    /**
     * @param array<int, array<string, mixed>> $rows sorted
     * @return array<int, array<string, mixed>>
     */
    private static function buildSliced(array $rows, string $targetView): array
    {
        $invoiceById = [];
        foreach ($rows as $t) {
            if (($t['txn_type'] ?? '') === 'invoice') {
                $invoiceById[(int)$t['id']] = $t;
            }
        }

        $expanded = [];
        foreach ($rows as $t) {
            $type = (string)($t['txn_type'] ?? '');
            if ($type === 'opening_balance') {
                $obKind = (string)($t['ledger_movement_kind'] ?? '');
                if ($obKind === '' || $obKind !== $targetView) {
                    continue;
                }
                $expanded[] = self::txnToLedgerRow($t);
                continue;
            }
            if ($type === 'invoice') {
                foreach (self::sliceInvoiceRows($t, $targetView) as $r) {
                    $expanded[] = $r;
                }
                continue;
            }
            if ($type === 'credit_note') {
                $linked = (int)($t['linked_txn_id'] ?? 0);
                $inv    = $invoiceById[$linked] ?? null;
                if ($inv === null) {
                    continue;
                }
                foreach (self::sliceCreditNoteRows($t, $inv, $targetView) as $r) {
                    $expanded[] = $r;
                }
                continue;
            }
            $kind = self::movementKindForSlicedNonInvoiceRow($t);
            if ($kind !== $targetView) {
                continue;
            }
            $expanded[] = self::txnToLedgerRow($t);
        }

        $balance = 0.0;
        foreach ($expanded as &$r) {
            $balance += (float)$r['debit'] - (float)$r['credit'];
            $r['balance'] = round($balance, 2);
        }
        unset($r);

        return $expanded;
    }

    /**
     * Fee / reimbursement totals (incl. tax split) for an invoice txn — used by bill settlement report.
     *
     * @param array<string, mixed> $invoiceTxn
     * @return array{fee_total: float, reim_total: float, inv_total: float}
     */
    public static function invoiceBucketParts(array $invoiceTxn): array
    {
        $lines = self::lineItemsArray($invoiceTxn);
        $totals = LedgerDimensions::invoiceLineSubtotalsByKind($lines);
        $subtotal = (float)($invoiceTxn['subtotal'] ?? 0);
        if ($subtotal <= 0.00001) {
            $subtotal = $totals['fee_sub'] + $totals['reimbursement_sub'];
        }
        $tax   = (float)($invoiceTxn['tax_amount'] ?? 0);
        $parts = self::bucketTotals($totals, $subtotal, $tax);

        return [
            'fee_total'  => $parts['fee_total'],
            'reim_total' => $parts['reim_total'],
            'inv_total'  => round((float)($invoiceTxn['amount'] ?? 0), 2),
        ];
    }

    /**
     * Credit note amount attributed to a ledger slice (fees or reimbursement), same split as buildSliced.
     *
     * @param array<string, mixed> $cn  credit_note txn
     * @param array<string, mixed> $invoice linked invoice txn
     */
    public static function creditNoteCreditForSlice(array $cn, array $invoice, string $targetView): float
    {
        $tv = trim($targetView);
        if ($tv === LedgerDimensions::VIEW_CONSOLIDATED) {
            return round((float)($cn['amount'] ?? 0), 2);
        }
        $targetView = LedgerDimensions::assertLedgerView($tv);
        foreach (self::sliceCreditNoteRows($cn, $invoice, $targetView) as $row) {
            return round((float)($row['credit'] ?? 0), 2);
        }

        return 0.0;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function sliceInvoiceRows(array $t, string $targetView): array
    {
        $lines = self::lineItemsArray($t);
        $totals = LedgerDimensions::invoiceLineSubtotalsByKind($lines);
        $subtotal = (float)($t['subtotal'] ?? 0);
        if ($subtotal <= 0.00001) {
            $subtotal = $totals['fee_sub'] + $totals['reimbursement_sub'];
        }
        $tax   = (float)($t['tax_amount'] ?? 0);
        $parts = self::bucketTotals($totals, $subtotal, $tax);
        $out   = [];
        if ($targetView === LedgerDimensions::VIEW_FEES && $parts['fee_total'] > 0.00001) {
            $out[] = self::syntheticRow(
                $t,
                -(abs((int)$t['id']) * 10 + self::SLICE_FEES),
                $parts['fee_total'],
                0.0,
                self::invoiceSliceNarration($t, 'Professional fees'),
                LedgerDimensions::VIEW_FEES
            );
        }
        if ($targetView === LedgerDimensions::VIEW_REIMBURSEMENT && $parts['reim_total'] > 0.00001) {
            $out[] = self::syntheticRow(
                $t,
                -(abs((int)$t['id']) * 10 + self::SLICE_REIMBURSEMENT),
                $parts['reim_total'],
                0.0,
                self::invoiceSliceNarration($t, 'Tax challans & reimbursements'),
                LedgerDimensions::VIEW_REIMBURSEMENT
            );
        }

        return $out;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function sliceCreditNoteRows(array $cn, array $invoice, string $targetView): array
    {
        $credit = (float)($cn['amount'] ?? 0);
        if ($credit <= 0) {
            return [];
        }
        $invAmt = (float)($invoice['amount'] ?? 0);
        if ($invAmt <= 0) {
            return [];
        }
        $lines = self::lineItemsArray($invoice);
        $totals = LedgerDimensions::invoiceLineSubtotalsByKind($lines);
        $subtotal = (float)($invoice['subtotal'] ?? 0);
        if ($subtotal <= 0.00001) {
            $subtotal = $totals['fee_sub'] + $totals['reimbursement_sub'];
        }
        $tax   = (float)($invoice['tax_amount'] ?? 0);
        $parts = self::bucketTotals($totals, $subtotal, $tax);
        $feeShare = round($credit * ($parts['fee_total'] / $invAmt), 2);
        $reimShare = round($credit - $feeShare, 2);

        $out = [];
        if ($targetView === LedgerDimensions::VIEW_FEES && $feeShare > 0.00001) {
            $out[] = self::syntheticRow(
                $cn,
                -(abs((int)$cn['id']) * 10 + self::SLICE_FEES),
                0.0,
                $feeShare,
                self::cnSliceNarration($cn, $invoice, 'Professional fees'),
                LedgerDimensions::VIEW_FEES
            );
        }
        if ($targetView === LedgerDimensions::VIEW_REIMBURSEMENT && $reimShare > 0.00001) {
            $out[] = self::syntheticRow(
                $cn,
                -(abs((int)$cn['id']) * 10 + self::SLICE_REIMBURSEMENT),
                0.0,
                $reimShare,
                self::cnSliceNarration($cn, $invoice, 'Tax challans & reimbursements'),
                LedgerDimensions::VIEW_REIMBURSEMENT
            );
        }

        return $out;
    }

    /**
     * @return array{fee_total: float, reim_total: float}
     */
    private static function bucketTotals(array $totals, float $subtotal, float $tax): array
    {
        $feeSub = $totals['fee_sub'];
        $reimSub = $totals['reimbursement_sub'];
        $taxFee = $subtotal > 0.00001
            ? round($tax * ($feeSub / $subtotal), 2)
            : 0.0;
        $taxReim = round($tax - $taxFee, 2);

        return [
            'fee_total'  => round($feeSub + $taxFee, 2),
            'reim_total' => round($reimSub + $taxReim, 2),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
    */
    private static function lineItemsArray(array $t): array
    {
        $lines = $t['line_items'] ?? [];
        if (!is_array($lines)) {
            return [];
        }

        return $lines;
    }

    private static function invoiceSliceNarration(array $t, string $label): string
    {
        $inv = trim((string)($t['invoice_number'] ?? ''));
        $base = $inv !== '' ? $inv : (string)($t['narration'] ?? 'Invoice');

        return $base . ' — ' . $label;
    }

    private static function cnSliceNarration(array $cn, array $inv, string $label): string
    {
        $invNo = trim((string)($inv['invoice_number'] ?? ''));
        $cnN   = trim((string)($cn['narration'] ?? 'Credit Note'));
        $base  = $invNo !== '' ? "CN vs {$invNo}" : $cnN;

        return $base . ' — ' . $label;
    }

    /**
     * @return array<string, mixed>
     */
    private static function txnToLedgerRow(array $t): array
    {
        return [
            'id'                   => (int)($t['id'] ?? 0),
            'source_txn_id'        => (int)($t['id'] ?? 0),
            'ledger_slice'         => null,
            'date'                 => (string)($t['txn_date'] ?? ''),
            'narration'            => (string)($t['narration'] ?? $t['invoice_number'] ?? $t['txn_type'] ?? ''),
            'debit'                => (float)($t['debit'] ?? 0),
            'credit'               => (float)($t['credit'] ?? 0),
            'billing_profile_code' => $t['billing_profile_code'] ?? null,
            'entry_type'           => (string)($t['txn_type'] ?? ''),
            'invoice_number'       => $t['invoice_number'] ?? null,
            'invoice_status'       => $t['invoice_status'] ?? null,
            'tds_status'           => $t['tds_status'] ?? null,
            'payment_method'       => $t['payment_method'] ?? null,
            'reference_number'     => $t['reference_number'] ?? null,
            'amount'               => (float)($t['amount'] ?? 0),
            'notes'                => $t['notes'] ?? null,
            'expense_purpose'      => $t['expense_purpose'] ?? null,
            'paid_from'            => $t['paid_from'] ?? null,
            'ledger_class'         => (string)($t['ledger_class'] ?? LedgerDimensions::CLASS_REGULAR),
            'ledger_movement_kind' => $t['ledger_movement_kind'] ?? null,
            'parked_transfer_target_txn_id'   => isset($t['parked_transfer_target_txn_id']) ? (int)$t['parked_transfer_target_txn_id'] : null,
            'parked_transfer_reversal_txn_id'   => isset($t['parked_transfer_reversal_txn_id']) ? (int)$t['parked_transfer_reversal_txn_id'] : null,
            'linked_txn_id'        => isset($t['linked_txn_id']) ? (int)$t['linked_txn_id'] : null,
            'public_ref'           => $t['public_ref'] ?? null,
            'status'               => (string)($t['status'] ?? 'active'),
            'balance'              => 0.0,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function syntheticRow(
        array $t,
        int $syntheticId,
        float $debit,
        float $credit,
        string $narration,
        string $slice
    ): array {
        $row = self::txnToLedgerRow($t);
        $row['id'] = $syntheticId;
        $row['source_txn_id'] = (int)($t['id'] ?? 0);
        $row['ledger_slice'] = $slice;
        $row['debit'] = round($debit, 2);
        $row['credit'] = round($credit, 2);
        $row['amount'] = round($debit > 0 ? $debit : $credit, 2);
        $row['narration'] = $narration;

        return $row;
    }
}
