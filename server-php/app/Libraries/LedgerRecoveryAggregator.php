<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Splits entity-ledger closing balances into fees (pre-tax professional), taxes (GST), and
 * reimbursement (pre-tax cost recovery), using the same invoice slicing rules as
 * {@see LedgerPresentation::buildSliced()}.
 */
final class LedgerRecoveryAggregator
{
    /**
     * @param array<int, array<string, mixed>> $rows raw txn rows (decoded JSON), any order
     * @return array{
     *   consolidated_closing: float,
     *   fees: float,
     *   taxes: float,
     *   reimbursement: float
     * }
     */
    public static function compute(array $rows): array
    {
        self::sortRowsLikeLedger($rows);
        $consolidated = 0.0;
        foreach ($rows as $t) {
            $consolidated += (float)($t['debit'] ?? 0) - (float)($t['credit'] ?? 0);
        }
        $consolidated = round($consolidated, 2);

        $invoiceById = self::indexInvoices($rows);
        $fees         = 0.0;
        $tax          = 0.0;
        $reimbursement = 0.0;

        self::accumulateFeesView($rows, $invoiceById, $fees, $tax);
        self::accumulateReimbursementView($rows, $invoiceById, $reimbursement, $tax);

        $fees          = round($fees, 2);
        $tax           = round($tax, 2);
        $reimbursement = round($reimbursement, 2);
        $split         = round($fees + $tax + $reimbursement, 2);
        // Dashboard receivable uses raw debit−credit closing. The split above needs structured
        // invoice line_items; legacy or header-only invoices can yield split ≈ 0 while closing
        // is still positive. Attribute the gap to professional fees so recovery rows and KPI align.
        if ($consolidated > 0.02 && $split + 0.02 < $consolidated) {
            $fees = round($fees + ($consolidated - $split), 2);
        }

        return [
            'consolidated_closing' => $consolidated,
            'fees'                 => $fees,
            'taxes'                => $tax,
            'reimbursement'        => $reimbursement,
        ];
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     */
    private static function sortRowsLikeLedger(array &$rows): void
    {
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
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    private static function indexInvoices(array $rows): array
    {
        $invoiceById = [];
        foreach ($rows as $t) {
            if (($t['txn_type'] ?? '') === 'invoice') {
                $invoiceById[(int)$t['id']] = $t;
            }
        }

        return $invoiceById;
    }

    /**
     * @return array{
     *   fee_sub: float,
     *   tax_fee: float,
     *   reim_sub: float,
     *   tax_reim: float,
     *   fee_total: float,
     *   reim_total: float,
     *   inv_amount: float
     * }
     */
    private static function invoiceParts(array $inv): array
    {
        $lines = $inv['line_items'] ?? [];
        if (!is_array($lines)) {
            $lines = [];
        }
        $totals   = LedgerDimensions::invoiceLineSubtotalsByKind($lines);
        $subtotal = (float)($inv['subtotal'] ?? 0);
        if ($subtotal <= 0.00001) {
            $subtotal = $totals['fee_sub'] + $totals['reimbursement_sub'];
        }
        $tax = (float)($inv['tax_amount'] ?? 0);
        $taxFee = $subtotal > 0.00001
            ? round($tax * ($totals['fee_sub'] / $subtotal), 2)
            : 0.0;
        $taxReim = round($tax - $taxFee, 2);
        $feeTotal  = round($totals['fee_sub'] + $taxFee, 2);
        $reimTotal = round($totals['reimbursement_sub'] + $taxReim, 2);

        return [
            'fee_sub'     => $totals['fee_sub'],
            'tax_fee'     => $taxFee,
            'reim_sub'    => $totals['reimbursement_sub'],
            'tax_reim'    => $taxReim,
            'fee_total'   => $feeTotal,
            'reim_total'  => $reimTotal,
            'inv_amount'  => round((float)($inv['amount'] ?? 0), 2),
        ];
    }

    /**
     * @param array<int, array<string, mixed>>     $rows
     * @param array<int, array<string, mixed>>     $invoiceById
     */
    private static function accumulateFeesView(array $rows, array $invoiceById, float &$feesPre, float &$tax): void
    {
        foreach ($rows as $t) {
            $type = (string)($t['txn_type'] ?? '');
            if ($type === 'opening_balance') {
                $obKind = trim((string)($t['ledger_movement_kind'] ?? ''));
                if ($obKind === '' || $obKind !== LedgerDimensions::KIND_FEES) {
                    continue;
                }
                $net = (float)($t['debit'] ?? 0) - (float)($t['credit'] ?? 0);
                $feesPre += $net;
                continue;
            }
            if ($type === 'invoice') {
                $p = self::invoiceParts($t);
                if ($p['fee_total'] <= 0.00001) {
                    continue;
                }
                $feesPre += $p['fee_sub'];
                static::addTax($tax, $p['tax_fee']);
                continue;
            }
            if ($type === 'credit_note') {
                $linked = (int)($t['linked_txn_id'] ?? 0);
                $inv    = $invoiceById[$linked] ?? null;
                if ($inv === null) {
                    continue;
                }
                $credit = (float)($t['amount'] ?? 0);
                if ($credit <= 0) {
                    continue;
                }
                $p = self::invoiceParts($inv);
                if ($p['inv_amount'] <= 0.00001 || $p['fee_total'] <= 0.00001) {
                    continue;
                }
                $feeShare = round($credit * ($p['fee_total'] / $p['inv_amount']), 2);
                if ($feeShare <= 0.00001) {
                    continue;
                }
                $feesPre -= round($feeShare * ($p['fee_sub'] / $p['fee_total']), 2);
                static::addTax($tax, -round($feeShare * ($p['tax_fee'] / $p['fee_total']), 2));
                continue;
            }
            $kind = self::movementKindForRow($t);
            if ($kind !== LedgerDimensions::KIND_FEES) {
                continue;
            }
            $net = (float)($t['debit'] ?? 0) - (float)($t['credit'] ?? 0);
            $link = (int)($t['linked_txn_id'] ?? 0);
            if ($link > 0 && isset($invoiceById[$link])) {
                $inv = $invoiceById[$link];
                if (($inv['txn_type'] ?? '') === 'invoice') {
                    $p = self::invoiceParts($inv);
                    if ($p['fee_total'] > 0.00001) {
                        $feesPre += round($net * ($p['fee_sub'] / $p['fee_total']), 2);
                        static::addTax($tax, round($net * ($p['tax_fee'] / $p['fee_total']), 2));

                        continue;
                    }
                }
            }
            $feesPre += $net;
        }
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @param array<int, array<string, mixed>> $invoiceById
     */
    private static function accumulateReimbursementView(array $rows, array $invoiceById, float &$reimPre, float &$tax): void
    {
        foreach ($rows as $t) {
            $type = (string)($t['txn_type'] ?? '');
            if ($type === 'opening_balance') {
                $obKind = trim((string)($t['ledger_movement_kind'] ?? ''));
                if ($obKind === '' || $obKind !== LedgerDimensions::KIND_REIMBURSEMENT) {
                    continue;
                }
                $net = (float)($t['debit'] ?? 0) - (float)($t['credit'] ?? 0);
                $reimPre += $net;
                continue;
            }
            if ($type === 'invoice') {
                $p = self::invoiceParts($t);
                if ($p['reim_total'] <= 0.00001) {
                    continue;
                }
                $reimPre += $p['reim_sub'];
                static::addTax($tax, $p['tax_reim']);
                continue;
            }
            if ($type === 'credit_note') {
                $linked = (int)($t['linked_txn_id'] ?? 0);
                $inv    = $invoiceById[$linked] ?? null;
                if ($inv === null) {
                    continue;
                }
                $credit = (float)($t['amount'] ?? 0);
                if ($credit <= 0) {
                    continue;
                }
                $p = self::invoiceParts($inv);
                if ($p['inv_amount'] <= 0.00001 || $p['reim_total'] <= 0.00001) {
                    continue;
                }
                $feeShareForCn = round($credit * ($p['fee_total'] / $p['inv_amount']), 2);
                $reimShare     = round($credit - $feeShareForCn, 2);
                if ($reimShare <= 0.00001) {
                    continue;
                }
                $reimPre -= round($reimShare * ($p['reim_sub'] / $p['reim_total']), 2);
                static::addTax($tax, -round($reimShare * ($p['tax_reim'] / $p['reim_total']), 2));
                continue;
            }
            $kind = self::movementKindForRow($t);
            if ($kind !== LedgerDimensions::KIND_REIMBURSEMENT) {
                continue;
            }
            $net = (float)($t['debit'] ?? 0) - (float)($t['credit'] ?? 0);
            $link = (int)($t['linked_txn_id'] ?? 0);
            if ($link > 0 && isset($invoiceById[$link])) {
                $inv = $invoiceById[$link];
                if (($inv['txn_type'] ?? '') === 'invoice') {
                    $p = self::invoiceParts($inv);
                    if ($p['reim_total'] > 0.00001) {
                        $reimPre += round($net * ($p['reim_sub'] / $p['reim_total']), 2);
                        static::addTax($tax, round($net * ($p['tax_reim'] / $p['reim_total']), 2));

                        continue;
                    }
                }
            }
            $reimPre += $net;
        }
    }

    private static function addTax(float &$tax, float $delta): void
    {
        $tax += $delta;
    }

    /** @param array<string, mixed> $t */
    private static function movementKindForRow(array $t): string
    {
        $kind = trim((string)($t['ledger_movement_kind'] ?? ''));
        if ($kind !== '') {
            return $kind;
        }

        return LedgerDimensions::KIND_FEES;
    }
}
