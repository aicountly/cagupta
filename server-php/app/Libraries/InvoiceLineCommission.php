<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Derives pre-GST net professional fee for commission from invoice line_items JSON.
 *
 * Legacy lines without line_kind count as professional_fee (full amount).
 * cost_recovery lines are excluded from the commission base.
 */
final class InvoiceLineCommission
{
    /**
     * @param array<int, array<string, mixed>>|null $lines
     * @return array{net_base: float, fee_subtotal: float, cost_subtotal: float, manpower_deducted: float}
     */
    public static function computeNetProfessionalFeeBase(?array $lines): array
    {
        if ($lines === null || $lines === []) {
            return [
                'net_base'          => 0.0,
                'fee_subtotal'      => 0.0,
                'cost_subtotal'     => 0.0,
                'manpower_deducted' => 0.0,
            ];
        }

        $feeSubtotal      = 0.0;
        $costSubtotal     = 0.0;

        foreach ($lines as $line) {
            $amount = (float)($line['amount'] ?? 0);
            $kind   = $line['line_kind'] ?? null;
            if ($kind === null || $kind === '') {
                $kind = 'professional_fee';
            }
            if ($kind === 'cost_recovery') {
                $costSubtotal += $amount;
                continue;
            }
            $feeSubtotal += $amount;
        }

        $netBase = max(0.0, round($feeSubtotal, 2));

        return [
            'net_base'          => $netBase,
            'fee_subtotal'      => round($feeSubtotal, 2),
            'cost_subtotal'     => round($costSubtotal, 2),
            'manpower_deducted' => 0.0,
        ];
    }

    /** True if at least one line is explicitly or implicitly professional_fee. */
    public static function hasProfessionalFeeLine(?array $lines): bool
    {
        if ($lines === null || $lines === []) {
            return false;
        }
        foreach ($lines as $line) {
            $kind = $line['line_kind'] ?? null;
            if ($kind === null || $kind === '' || $kind === 'professional_fee') {
                return true;
            }
        }

        return false;
    }

    /**
     * Validate line semantics; throws InvalidArgumentException on failure.
     *
     * @param array<int, array<string, mixed>> $lines
     */
    public static function assertValid(array $lines): void
    {
        foreach ($lines as $i => $line) {
            $kind = $line['line_kind'] ?? null;
            if ($kind === null || $kind === '') {
                continue;
            }
            if (!in_array($kind, ['professional_fee', 'cost_recovery'], true)) {
                throw new \InvalidArgumentException("Line " . ($i + 1) . ": line_kind must be professional_fee or cost_recovery.");
            }
        }
    }
}
