<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\AppointmentFeeRuleModel;

/**
 * Validates billing fields, computes fee snapshot, and derives appointment_status / amount_due_now.
 */
final class AppointmentBookingService
{
    /**
     * @param array<string, mixed> $body Request JSON
     * @return array<string, mixed> Extra columns for calendar_events insert/update
     */
    public static function buildBillingPatch(array $body): array
    {
        if (empty($body['fee_rule_id'])) {
            return [];
        }

        $ruleId = (int)$body['fee_rule_id'];
        $rule    = (new AppointmentFeeRuleModel())->find($ruleId);
        if ($rule === null || empty($rule['is_active'])) {
            throw new \InvalidArgumentException('Invalid or inactive fee_rule_id.');
        }

        $cid = (int)($body['client_id'] ?? 0);
        $oid = (int)($body['billing_organization_id'] ?? 0);
        if ($cid <= 0 && $oid <= 0) {
            throw new \InvalidArgumentException('client_id or billing_organization_id is required when fee_rule_id is set.');
        }
        if ($cid > 0 && $oid > 0) {
            throw new \InvalidArgumentException('Provide only one of client_id or billing_organization_id.');
        }

        $terms = trim((string)($body['payment_terms'] ?? ''));
        if (!in_array($terms, ['full_advance', 'partial_advance', 'pay_later'], true)) {
            throw new \InvalidArgumentException('payment_terms must be full_advance, partial_advance, or pay_later.');
        }

        $hours = self::resolveBillableHours($body, $rule['pricing_model'] ?? '');
        $unit  = (float)($rule['amount'] ?? 0);
        if ($rule['pricing_model'] === 'fixed_meeting') {
            $feeSubtotal = round($unit, 2);
        } else {
            if ($hours <= 0) {
                throw new \InvalidArgumentException('billable_hours or start_time/end_time is required for per_hour pricing.');
            }
            $feeSubtotal = round($unit * $hours, 2);
        }

        $profileCode = trim((string)($body['billing_profile_code'] ?? $rule['default_billing_profile_code'] ?? ''));
        if ($profileCode === '') {
            throw new \InvalidArgumentException('billing_profile_code is required when using a fee rule.');
        }

        $snap = $body['billing_profile_snapshot'] ?? null;
        if ($snap !== null && !is_array($snap)) {
            throw new \InvalidArgumentException('billing_profile_snapshot must be an object.');
        }

        $advanceAmount  = isset($body['advance_amount']) ? (float)$body['advance_amount'] : null;
        $advancePercent = isset($body['advance_percent']) ? (float)$body['advance_percent'] : null;

        $title     = trim((string)($body['title'] ?? $body['subject'] ?? ''));
        $lineDesc  = trim((string)($body['invoice_line_description'] ?? $rule['default_line_description'] ?? ''));
        if ($lineDesc === '') {
            $lineDesc = 'Professional fees — ' . ($title !== '' ? $title : 'Appointment');
        }
        $lineKind = trim((string)($body['invoice_line_kind'] ?? $rule['default_line_kind'] ?? 'professional_fee'));
        if (!in_array($lineKind, ['professional_fee', 'cost_recovery'], true)) {
            $lineKind = 'professional_fee';
        }

        // amount_due_now is set after invoice total known — placeholder; controller recomputes
        $patch = [
            'fee_rule_id'               => $ruleId,
            'pricing_model'             => $rule['pricing_model'],
            'unit_amount'               => $unit,
            'billable_hours'            => $rule['pricing_model'] === 'per_hour' ? $hours : null,
            'fee_subtotal'              => $feeSubtotal,
            'billing_profile_code'      => $profileCode,
            'billing_profile_snapshot'  => $snap,
            'billing_organization_id'   => $oid > 0 ? $oid : null,
            'payment_terms'             => $terms,
            'advance_amount'            => $advanceAmount,
            'advance_percent'           => $advancePercent,
            'invoice_line_description'  => $lineDesc,
            'invoice_line_kind'         => $lineKind,
        ];

        return $patch;
    }

    /**
     * After fee_subtotal and GST snapshot are known, compute invoice total (preliminary) for amount_due_now.
     *
     * @param array<string, mixed> $row Appointment row + billing_profile_snapshot + fee_subtotal + payment_terms + advance fields
     */
    public static function computeAmountDueNow(array $row, float $invoiceTotalInclGst): float
    {
        $terms = (string)($row['payment_terms'] ?? '');
        if ($terms === 'pay_later') {
            return 0.0;
        }
        if ($terms === 'full_advance') {
            return round($invoiceTotalInclGst, 2);
        }
        // partial_advance
        $adv = (float)($row['advance_amount'] ?? 0);
        if ($adv > 0) {
            return min(round($adv, 2), round($invoiceTotalInclGst, 2));
        }
        $pct = (float)($row['advance_percent'] ?? 0);
        if ($pct > 0) {
            return min(round($invoiceTotalInclGst * $pct / 100, 2), round($invoiceTotalInclGst, 2));
        }

        return 0.0;
    }

    public static function initialAppointmentStatus(string $paymentTerms): string
    {
        return $paymentTerms === 'pay_later' ? 'confirmed' : 'pending_payment';
    }

    /**
     * @param array<string, mixed> $body
     */
    private static function resolveBillableHours(array $body, string $pricingModel): float
    {
        if ($pricingModel !== 'per_hour') {
            return 0.0;
        }
        if (isset($body['billable_hours'])) {
            $h = (float)$body['billable_hours'];
            if ($h > 0) {
                return $h;
            }
        }
        $start = trim((string)($body['start_time'] ?? ''));
        $end   = trim((string)($body['end_time'] ?? ''));
        if ($start === '' || $end === '') {
            return 0.0;
        }
        $t0 = strtotime('1970-01-01 ' . $start);
        $t1 = strtotime('1970-01-01 ' . $end);
        if ($t0 === false || $t1 === false || $t1 <= $t0) {
            return 0.0;
        }
        $diffHours = ($t1 - $t0) / 3600;

        return round($diffHours, 4);
    }

    /**
     * Preview invoice total (incl. GST) without persisting — for UI sync.
     *
     * @param array<string, mixed> $appointmentLike Same shape as passed to AppointmentInvoiceBuilder
     */
    public static function previewInvoiceTotal(array $appointmentLike): float
    {
        $cid = (int)($appointmentLike['client_id'] ?? 0);
        $oid = (int)($appointmentLike['billing_organization_id'] ?? 0);
        $recipientGstin = self::gstinForPreview($cid, $oid);
        $snap           = $appointmentLike['billing_profile_snapshot'] ?? [];
        if (!is_array($snap)) {
            $snap = [];
        }
        $feeSubtotal = (float)($appointmentLike['fee_subtotal'] ?? 0);
        $desc        = trim((string)($appointmentLike['invoice_line_description'] ?? 'Appointment'));
        $lineKind    = trim((string)($appointmentLike['invoice_line_kind'] ?? 'professional_fee'));
        $body        = [
            'line_items'                 => [['description' => $desc, 'amount' => $feeSubtotal, 'line_kind' => $lineKind]],
            'billing_gst_registered'     => !empty($snap['gstRegistered']),
            'billing_supplier_state_code'=> !empty($snap['gstRegistered']) ? ($snap['stateCode'] ?? null) : null,
            'billing_supplier_gstin'     => !empty($snap['gstRegistered']) ? ($snap['gstin'] ?? null) : null,
            'default_gst_rate_percent'   => (float)($snap['defaultGstRate'] ?? 18),
        ];
        $prepared = GstInvoiceTax::prepareInvoice($body, $recipientGstin);

        return (float)($prepared['amount'] ?? 0);
    }

    private static function gstinForPreview(int $clientId, int $orgId): ?string
    {
        if ($clientId > 0) {
            $c = (new \App\Models\ClientModel())->find($clientId);

            return $c ? trim((string)($c['gstin'] ?? '')) : null;
        }
        if ($orgId > 0) {
            $o = (new \App\Models\OrganizationModel())->find($orgId);

            return $o ? trim((string)($o['gstin'] ?? '')) : null;
        }

        return null;
    }
}
