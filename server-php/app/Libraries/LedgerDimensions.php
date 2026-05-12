<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Validation and helpers for client ledger classification:
 * ledger_class (regular | memorandum) and ledger_movement_kind (fees | reimbursement).
 */
final class LedgerDimensions
{
    public const CLASS_REGULAR     = 'regular';
    public const CLASS_MEMORANDUM  = 'memorandum';
    public const VIEW_CONSOLIDATED = 'consolidated';
    public const VIEW_FEES         = 'fees';
    public const VIEW_REIMBURSEMENT = 'reimbursement';

    public const KIND_FEES           = 'fees';
    public const KIND_REIMBURSEMENT = 'reimbursement';

    /** @return array<string, true> */
    private static function validClasses(): array
    {
        return [self::CLASS_REGULAR => true, self::CLASS_MEMORANDUM => true];
    }

    /** @return array<string, true> */
    private static function validKinds(): array
    {
        return [self::KIND_FEES => true, self::KIND_REIMBURSEMENT => true];
    }

    public static function assertLedgerClass(mixed $v): string
    {
        $s = is_string($v) ? trim($v) : '';
        if ($s === '' || !isset(self::validClasses()[$s])) {
            throw new \InvalidArgumentException('ledger_class must be regular or memorandum.');
        }

        return $s;
    }

    public static function normalizeLedgerClass(mixed $v): string
    {
        $s = is_string($v) ? trim($v) : '';
        if ($s === '') {
            return self::CLASS_REGULAR;
        }
        if (!isset(self::validClasses()[$s])) {
            return self::CLASS_REGULAR;
        }

        return $s;
    }

    /**
     * @param  mixed $v  fees | reimbursement
     * @return string     normalized kind
     */
    public static function assertLedgerMovementKindRequired(mixed $v): string
    {
        $s = is_string($v) ? trim($v) : '';
        if ($s === '' || !isset(self::validKinds()[$s])) {
            throw new \InvalidArgumentException('ledger_movement_kind must be fees or reimbursement.');
        }

        return $s;
    }

    public static function assertLedgerView(string $v): string
    {
        $s = trim($v);
        if (!in_array($s, [self::VIEW_CONSOLIDATED, self::VIEW_FEES, self::VIEW_REIMBURSEMENT], true)) {
            throw new \InvalidArgumentException('ledger_view must be consolidated, fees, or reimbursement.');
        }

        return $s;
    }

    /**
     * @param array<string, mixed> $lineItems  decoded line_items JSON
     * @return array{fee_sub: float, reimbursement_sub: float}
     */
    public static function invoiceLineSubtotalsByKind(array $lineItems): array
    {
        $fee = 0.0;
        $reim = 0.0;
        foreach ($lineItems as $ln) {
            if (!is_array($ln)) {
                continue;
            }
            $amt = round((float)($ln['amount'] ?? 0), 2);
            if ($amt <= 0) {
                continue;
            }
            $kind = $ln['line_kind'] ?? $ln['lineKind'] ?? 'professional_fee';
            if ($kind === 'cost_recovery') {
                $reim += $amt;
            } else {
                $fee += $amt;
            }
        }

        return ['fee_sub' => round($fee, 2), 'reimbursement_sub' => round($reim, 2)];
    }

    /**
     * For receipts linked to an invoice: movement kind must match line composition when not mixed.
     *
     * @param array<string, mixed> $invoice  txn row (invoice)
     */
    public static function assertReceiptMovementMatchesInvoice(array $invoice, string $movementKind): void
    {
        $lines = $invoice['line_items'] ?? [];
        if (is_string($lines)) {
            $decoded = json_decode($lines, true);
            $lines   = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($lines) || $lines === []) {
            return;
        }
        $totals = self::invoiceLineSubtotalsByKind($lines);
        $hasFee = $totals['fee_sub'] > 0;
        $hasReim = $totals['reimbursement_sub'] > 0;
        if ($hasFee && !$hasReim && $movementKind !== self::KIND_FEES) {
            throw new \InvalidArgumentException('This invoice only has professional fee lines; receipt must use ledger view fees.');
        }
        if ($hasReim && !$hasFee && $movementKind !== self::KIND_REIMBURSEMENT) {
            throw new \InvalidArgumentException('This invoice only has reimbursement lines; receipt must use ledger view reimbursement.');
        }
    }
}
