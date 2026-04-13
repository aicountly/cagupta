<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Indian GST place-of-supply logic for professional invoices.
 * Computes CGST/SGST vs IGST vs CGST/UTGST and returns a structured breakdown for ERP sync.
 */
final class GstInvoiceTax
{
    /** State codes treated as Union Territories for UTGST (intra-UT same as CGST+UTGST). */
    private const UT_STATE_CODES = ['04', '07', '25', '26', '31', '34', '35', '36', '37', '38'];

    /**
     * @param array<string, mixed> $body  Raw invoice POST body
     * @param string|null          $recipientGstin GSTIN from client or organization master
     * @return array<string, mixed>  Merged invoice fields: subtotal, tax_percent, tax_amount, amount, line_items, gst_breakdown
     */
    public static function prepareInvoice(array $body, ?string $recipientGstin): array
    {
        $gstRegistered = filter_var($body['billing_gst_registered'] ?? false, FILTER_VALIDATE_BOOLEAN);

        $lines = self::normalizeLineItems($body['line_items'] ?? null);
        $subtotal = 0.0;
        foreach ($lines as $ln) {
            $subtotal += (float)$ln['amount'];
        }
        $subtotal = round($subtotal, 2);

        if (!$gstRegistered) {
            return [
                'subtotal'       => $subtotal,
                'tax_percent'    => null,
                'tax_amount'     => null,
                'amount'         => $subtotal,
                'debit'          => $subtotal,
                'line_items'     => $lines,
                'gst_breakdown'  => null,
            ];
        }

        $rate = (float)($body['default_gst_rate_percent'] ?? 18);
        if ($rate < 0 || $rate > 40) {
            throw new \InvalidArgumentException('default_gst_rate_percent must be between 0 and 40.');
        }

        $supplierState = self::normalizeStateCode((string)($body['billing_supplier_state_code'] ?? ''));
        if ($supplierState === null || !self::isValidStateCode($supplierState)) {
            throw new \InvalidArgumentException('Valid billing_supplier_state_code (2 digits) is required when GST is registered.');
        }

        $recipientState = self::stateCodeFromGstin($recipientGstin);
        if ($recipientState === null) {
            throw new \InvalidArgumentException(
                'Recipient place of supply is unknown. Add a valid GSTIN on the contact or organization (state is taken from the first two characters).'
            );
        }

        $taxAmount = round($subtotal * $rate / 100, 2);
        $total     = round($subtotal + $taxAmount, 2);

        $cgst = 0.0;
        $sgst = 0.0;
        $igst = 0.0;
        $utgst = 0.0;
        $scheme = 'exempt';

        if ($taxAmount <= 0) {
            $scheme = 'nil';
        } elseif ($supplierState === $recipientState) {
            $half = round($taxAmount / 2, 2);
            $other = round($taxAmount - $half, 2);
            if (in_array($supplierState, self::UT_STATE_CODES, true)) {
                $cgst  = $half;
                $utgst = $other;
                $scheme = 'intra_ut';
            } else {
                $cgst = $half;
                $sgst = $other;
                $scheme = 'intra_state';
            }
        } else {
            $igst = $taxAmount;
            $scheme = 'inter_state';
        }

        $gstBreakdown = [
            'scheme'                 => $scheme,
            'gst_rate_percent'       => $rate,
            'taxable_value'          => $subtotal,
            'total_gst'              => $taxAmount,
            'cgst_amount'            => round($cgst, 2),
            'sgst_amount'            => round($sgst, 2),
            'utgst_amount'           => round($utgst, 2),
            'igst_amount'            => round($igst, 2),
            'supplier_state_code'    => $supplierState,
            'recipient_state_code'   => $recipientState,
            'place_of_supply_code'   => $recipientState,
            'supplier_gstin'         => self::normalizeGstin((string)($body['billing_supplier_gstin'] ?? '')),
            'recipient_gstin'        => self::normalizeGstin($recipientGstin ?? ''),
        ];

        return [
            'subtotal'       => $subtotal,
            'tax_percent'    => $rate,
            'tax_amount'     => $taxAmount,
            'amount'         => $total,
            'debit'          => $total,
            'line_items'     => $lines,
            'gst_breakdown'  => $gstBreakdown,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function normalizeLineItems(mixed $raw): array
    {
        if ($raw === null || $raw === '' || !is_array($raw) || count($raw) === 0) {
            throw new \InvalidArgumentException('At least one line item is required.');
        }

        $normalized = [];
        foreach ($raw as $line) {
            if (!is_array($line)) {
                throw new \InvalidArgumentException('Each line item must be an object.');
            }
            $desc = trim((string)($line['description'] ?? ''));
            $amt  = (float)($line['amount'] ?? 0);
            if ($desc === '') {
                throw new \InvalidArgumentException('Each line item requires a description.');
            }
            if ($amt <= 0) {
                throw new \InvalidArgumentException('Each line item amount must be greater than zero.');
            }
            $row = [
                'description' => $desc,
                'amount'      => round($amt, 2),
            ];
            if (!empty($line['engagement_type_id'])) {
                $row['engagement_type_id'] = (int)$line['engagement_type_id'];
            }
            if (!empty($line['service_line_key'])) {
                $row['service_line_key'] = trim((string)$line['service_line_key']);
            }
            $normalized[] = $row;
        }

        return $normalized;
    }

    public static function stateCodeFromGstin(?string $gstin): ?string
    {
        $g = self::normalizeGstin($gstin ?? '');
        if (strlen($g) < 2) {
            return null;
        }
        $code = strtoupper(substr($g, 0, 2));
        if (!ctype_digit($code)) {
            return null;
        }
        if (!self::isValidStateCode($code)) {
            return null;
        }

        return $code;
    }

    private static function normalizeGstin(string $gstin): string
    {
        return strtoupper(preg_replace('/\s+/', '', $gstin) ?? '');
    }

    private static function normalizeStateCode(string $code): ?string
    {
        $c = strtoupper(trim(preg_replace('/\s+/', '', $code) ?? ''));
        if ($c === '') {
            return null;
        }
        if (strlen($c) === 2 && ctype_digit($c)) {
            return $c;
        }

        return null;
    }

    private static function isValidStateCode(string $twoDigits): bool
    {
        $n = (int)$twoDigits;
        // Indian GST state / UT codes are generally 01–38; 97 = Other Territory; allow 01–99 for forward compatibility
        return $n >= 1 && $n <= 99;
    }
}
