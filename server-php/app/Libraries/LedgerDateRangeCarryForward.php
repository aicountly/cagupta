<?php
declare(strict_types=1);

namespace App\Libraries;

use PDO;

/**
 * Carry-forward balances when ledgers are filtered by date_from.
 */
final class LedgerDateRangeCarryForward
{
    public static function isValidYmd(string $ymd): bool
    {
        return (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $ymd);
    }

    /** Calendar day before YYYY-MM-DD. */
    public static function dayBefore(string $ymd): string
    {
        if (!self::isValidYmd($ymd)) {
            throw new \InvalidArgumentException('date must be YYYY-MM-DD.');
        }

        return (new \DateTimeImmutable($ymd))->modify('-1 day')->format('Y-m-d');
    }

    /**
     * Signed movement sum for active txns on a firm bank/cash account strictly before date_from.
     */
    public static function bankPriorMovementSum(PDO $db, int $accountId, string $dateFrom): float
    {
        if (!self::isValidYmd($dateFrom)) {
            return 0.0;
        }
        $stmt = $db->prepare(
            "SELECT COALESCE(SUM(COALESCE(t.credit, 0) - COALESCE(t.debit, 0)), 0)
             FROM txn t
             WHERE t.firm_bank_account_id = :aid
               AND t.status = 'active'
               AND t.txn_date < :df"
        );
        $stmt->execute([':aid' => $accountId, ':df' => $dateFrom]);
        $sum = $stmt->fetchColumn();

        return round((float)($sum !== false ? $sum : 0), 2);
    }

    public static function bankCarryForwardBalance(
        PDO $db,
        int $accountId,
        float $signedOpening,
        string $dateFrom
    ): float {
        return round($signedOpening + self::bankPriorMovementSum($db, $accountId, $dateFrom), 2);
    }

    /**
     * Closing balance from raw txn rows strictly before date_from (same rules as LedgerPresentation).
     *
     * @param array<int, array<string, mixed>> $rows
     */
    public static function clientLedgerCarryForward(array $rows, string $ledgerView, string $dateFrom): float
    {
        if (!self::isValidYmd($dateFrom)) {
            return 0.0;
        }
        $before = [];
        foreach ($rows as $t) {
            $d = (string)($t['txn_date'] ?? '');
            if ($d !== '' && strcmp($d, $dateFrom) < 0) {
                $before[] = $t;
            }
        }
        if ($before === []) {
            return 0.0;
        }
        $built = LedgerPresentation::buildLedger($before, $ledgerView);
        if ($built === []) {
            return 0.0;
        }
        $last = $built[count($built) - 1];

        return round((float)($last['balance'] ?? 0), 2);
    }

    /**
     * @return array{debit: float, credit: float}
     */
    public static function debitCreditFromSigned(float $signed): array
    {
        $signed = round($signed, 2);
        if ($signed > 0) {
            return ['debit' => $signed, 'credit' => 0.0];
        }
        if ($signed < 0) {
            return ['debit' => 0.0, 'credit' => -$signed];
        }

        return ['debit' => 0.0, 'credit' => 0.0];
    }

    /**
     * Synthetic opening_balance txn for bill settlement / client ledger B/F.
     *
     * @return array<string, mixed>
     */
    public static function syntheticBalanceBfTxn(float $balance, string $dateFrom, string $ledgerClass = 'regular'): array
    {
        $dc = self::debitCreditFromSigned($balance);

        return [
            'id'                   => 0,
            'txn_type'             => 'opening_balance',
            'txn_date'             => self::dayBefore($dateFrom),
            'narration'            => 'Balance b/f',
            'debit'                => $dc['debit'],
            'credit'               => $dc['credit'],
            'amount'               => round(abs($balance), 2),
            'ledger_class'         => LedgerDimensions::normalizeLedgerClass($ledgerClass),
            'billing_profile_code' => null,
            'status'               => 'active',
        ];
    }

    /**
     * Bank ledger synthetic opening row (row_type opening).
     *
     * @return array<string, mixed>
     */
    public static function syntheticBankOpeningRow(float $carryForward, string $dateFrom): array
    {
        $dc = self::debitCreditFromSigned($carryForward);

        return [
            'row_type'  => 'opening',
            'txn_date'  => self::dayBefore($dateFrom),
            'narration' => 'Opening balance',
            'debit'     => $dc['debit'],
            'credit'    => $dc['credit'],
            'movement'  => 0.0,
            'balance'   => $carryForward,
            'txn_type'  => null,
            'id'        => null,
        ];
    }
}
