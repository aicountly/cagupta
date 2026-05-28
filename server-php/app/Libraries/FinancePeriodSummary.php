<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Firm-wide invoicing KPI totals for a date range: opening (pre-period), in-period billed/collected,
 * closing outstanding, and fees vs reimbursement splits via ledger_movement_kind.
 */
final class FinancePeriodSummary
{
    private const RECEIPT_TYPES = ['receipt', 'receipt_reversal'];

    /**
     * @param array<int, array<string, mixed>> $rows receivable txn rows (decoded JSON), active entities only
     */
    public static function compute(array $rows, string $dateFrom, string $dateTo): array
    {
        $dateFrom = trim($dateFrom);
        $dateTo   = trim($dateTo);

        $invoiceById = [];
        foreach ($rows as $t) {
            if (($t['txn_type'] ?? '') === 'invoice') {
                $invoiceById[(int)$t['id']] = $t;
            }
        }

        $rowsBefore   = [];
        $rowsInPeriod = [];
        $rowsThrough  = [];

        foreach ($rows as $t) {
            if (self::isHiddenRow($t)) {
                continue;
            }
            $d = trim((string)($t['txn_date'] ?? ''));
            if ($d === '') {
                continue;
            }
            if ($d < $dateFrom) {
                $rowsBefore[] = $t;
            }
            if ($d >= $dateFrom && $d <= $dateTo) {
                $rowsInPeriod[] = $t;
            }
            if ($d <= $dateTo) {
                $rowsThrough[] = $t;
            }
        }

        $openingAgg  = LedgerRecoveryAggregator::compute($rowsBefore);
        $closingAgg  = LedgerRecoveryAggregator::compute($rowsThrough);
        $periodMoves = self::accumulateInPeriod($rowsInPeriod, $invoiceById);

        $feesOpening = round($openingAgg['fees'] + $openingAgg['taxes'], 2);
        $reimOpening = round($openingAgg['reimbursement'], 2);
        $feesClosing = round($closingAgg['fees'] + $closingAgg['taxes'], 2);
        $reimClosing = round($closingAgg['reimbursement'], 2);

        return [
            'period' => [
                'from' => $dateFrom,
                'to'   => $dateTo,
            ],
            'consolidated' => [
                'opening'      => $openingAgg['consolidated_closing'],
                'billed'       => $periodMoves['billed'],
                'collected'    => $periodMoves['collected'],
                'credit_notes' => $periodMoves['credit_notes'],
                'outstanding'  => $closingAgg['consolidated_closing'],
                'fees'         => [
                    'opening'     => $feesOpening,
                    'billed'      => $periodMoves['fees_billed'],
                    'collected'   => $periodMoves['fees_collected'],
                    'outstanding' => $feesClosing,
                ],
                'reimbursement' => [
                    'opening'     => $reimOpening,
                    'billed'      => $periodMoves['reimb_billed'],
                    'collected'   => $periodMoves['reimb_collected'],
                    'outstanding' => $reimClosing,
                ],
            ],
        ];
    }

    /**
     * @param array<int, array<string, mixed>>     $rowsInPeriod
     * @param array<int, array<string, mixed>>     $invoiceById
     * @return array{
     *   billed: float,
     *   collected: float,
     *   credit_notes: float,
     *   fees_billed: float,
     *   reimb_billed: float,
     *   fees_collected: float,
     *   reimb_collected: float
     * }
     */
    private static function accumulateInPeriod(array $rowsInPeriod, array $invoiceById): array
    {
        $billed          = 0.0;
        $collected       = 0.0;
        $creditNotes     = 0.0;
        $feesBilled      = 0.0;
        $reimbBilled     = 0.0;
        $feesCollected   = 0.0;
        $reimbCollected  = 0.0;

        foreach ($rowsInPeriod as $t) {
            if (self::isHiddenRow($t)) {
                continue;
            }
            $type = (string)($t['txn_type'] ?? '');

            if ($type === 'invoice') {
                $amt = round((float)($t['amount'] ?? 0), 2);
                if ($amt <= 0.00001) {
                    continue;
                }
                $parts = LedgerPresentation::invoiceBucketParts($t);
                $billed += $amt;
                $feesBilled += $parts['fee_total'];
                $reimbBilled += $parts['reim_total'];
                continue;
            }

            if (in_array($type, self::RECEIPT_TYPES, true)) {
                $net = round((float)($t['debit'] ?? 0) - (float)($t['credit'] ?? 0), 2);
                $collected += -$net;
                $kind = self::movementKindForRow($t);
                if ($kind === LedgerDimensions::KIND_REIMBURSEMENT) {
                    $reimbCollected += -$net;
                } else {
                    $feesCollected += -$net;
                }
                continue;
            }

            if ($type === 'credit_note') {
                $cn = round((float)($t['amount'] ?? 0), 2);
                if ($cn <= 0.00001) {
                    continue;
                }
                $creditNotes += $cn;
                $linked = (int)($t['linked_txn_id'] ?? 0);
                $inv    = $invoiceById[$linked] ?? null;
                if ($inv !== null) {
                    $feePart = LedgerPresentation::creditNoteCreditForSlice(
                        $t,
                        $inv,
                        LedgerDimensions::VIEW_FEES
                    );
                    $reimPart = LedgerPresentation::creditNoteCreditForSlice(
                        $t,
                        $inv,
                        LedgerDimensions::VIEW_REIMBURSEMENT
                    );
                    $feesBilled -= $feePart;
                    $reimbBilled -= $reimPart;
                    $billed -= $cn;
                } else {
                    $billed -= $cn;
                }
            }
        }

        return [
            'billed'          => round($billed, 2),
            'collected'       => round($collected, 2),
            'credit_notes'    => round($creditNotes, 2),
            'fees_billed'     => round($feesBilled, 2),
            'reimb_billed'    => round($reimbBilled, 2),
            'fees_collected'  => round($feesCollected, 2),
            'reimb_collected' => round($reimbCollected, 2),
        ];
    }

    /** @param array<string, mixed> $t */
    private static function isHiddenRow(array $t): bool
    {
        $st = strtolower((string)($t['status'] ?? 'active'));
        if (in_array($st, ['cancelled', 'deleted'], true)) {
            return true;
        }
        if (($t['txn_type'] ?? '') === 'invoice') {
            $ist = strtolower((string)($t['invoice_status'] ?? ''));
            if ($ist === 'cancelled') {
                return true;
            }
        }

        return false;
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
