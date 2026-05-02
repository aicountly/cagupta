<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\EngagementTypeModel;
use App\Models\ServiceModel;
use App\Models\TimeEntryModel;

/**
 * Standard fee vs planned-rate time value for invoice lines linked to a service engagement.
 */
final class InvoiceCostAnalysis
{
    private const EPS = 0.005;

    /**
     * Resolve standard fee (₹) from engagement type with optional service overrides.
     */
    public static function resolveStandardFeeAmount(?array $engagementTypeRow, ?array $serviceRow): ?float
    {
        if ($serviceRow !== null) {
            $o = $serviceRow['standard_fee_override'] ?? null;
            if ($o !== null && $o !== '') {
                $v = round((float)$o, 2);

                return $v > 0 ? $v : null;
            }
        }
        if ($engagementTypeRow === null) {
            return null;
        }
        $s = $engagementTypeRow['standard_fee_amount'] ?? null;
        if ($s === null || $s === '') {
            return null;
        }
        $v = round((float)$s, 2);

        return $v > 0 ? $v : null;
    }

    /**
     * @return array{
     *   standard_fees: float|null,
     *   billed_hours_fees: float,
     *   unbilled_hours_fees: float,
     *   calculated_hours_fees: float,
     *   threshold: float|null,
     *   matching_professional_subtotal: float,
     *   engagement_type_id: int|null,
     *   service_id: int|null
     * }
     */
    public static function analyzeInvoiceBody(array $body): array
    {
        $serviceId = isset($body['service_id']) ? (int)$body['service_id'] : 0;
        $services  = new ServiceModel();
        $service   = ($serviceId > 0) ? $services->find($serviceId) : null;

        $lines = $body['line_items'] ?? [];
        if (!is_array($lines)) {
            $lines = [];
        }

        $svcEt = ($service !== null) ? (int)($service['engagement_type_id'] ?? 0) : 0;

        $matchingSubtotal = 0.0;
        foreach ($lines as $ln) {
            if (!is_array($ln)) {
                continue;
            }
            $kind = $ln['line_kind'] ?? null;
            if ($kind === 'cost_recovery') {
                continue;
            }
            $et = isset($ln['engagement_type_id']) ? (int)$ln['engagement_type_id'] : 0;
            if ($svcEt <= 0 || $et !== $svcEt) {
                continue;
            }
            $matchingSubtotal += round((float)($ln['amount'] ?? 0), 2);
        }
        $matchingSubtotal = round($matchingSubtotal, 2);

        $standard = null;
        $etRow    = null;
        if ($svcEt > 0) {
            $etRow    = (new EngagementTypeModel())->find($svcEt);
            $standard = self::resolveStandardFeeAmount($etRow, $service);
        }

        $billedHoursFees   = 0.0;
        $unbilledHoursFees = 0.0;
        if ($serviceId > 0) {
            $sum = (new TimeEntryModel())->sumPlannedRatesForService($serviceId);
            $billedHoursFees   = round((float)($sum['billed_hours_fees'] ?? 0), 2);
            $unbilledHoursFees = round((float)($sum['unbilled_hours_fees'] ?? 0), 2);
        }

        $calcHoursTotal = round($billedHoursFees + $unbilledHoursFees, 2);

        $threshold = null;
        if ($standard !== null || $calcHoursTotal > 0) {
            $threshold = round(max((float)($standard ?? 0), $calcHoursTotal), 2);
        }

        return [
            'standard_fees'                  => $standard,
            'billed_hours_fees'              => $billedHoursFees,
            'unbilled_hours_fees'            => $unbilledHoursFees,
            'calculated_hours_fees'          => $calcHoursTotal,
            'threshold'                      => $threshold,
            'matching_professional_subtotal' => $matchingSubtotal,
            'engagement_type_id'             => $svcEt > 0 ? $svcEt : null,
            'service_id'                     => $serviceId > 0 ? $serviceId : null,
        ];
    }

    /**
     * When service + matching fee lines exist and benchmarks are known, require Accounts / Superadmin acknowledgement.
     *
     * @return array<int, array<string, mixed>> Non-empty if confirmation is still required
     */
    public static function validationViolations(array $analysis): array
    {
        $violations = [];
        $std        = $analysis['standard_fees'] ?? null;
        $matchSub   = (float)($analysis['matching_professional_subtotal'] ?? 0);
        $billedH    = (float)($analysis['billed_hours_fees'] ?? 0);
        $unbilledH  = (float)($analysis['unbilled_hours_fees'] ?? 0);
        $calcTotal  = round($billedH + $unbilledH, 2);

        if ($matchSub <= 0) {
            return [];
        }

        if ($std !== null && $matchSub + self::EPS < (float)$std) {
            $violations[] = [
                'code'       => 'below_standard_fees',
                'message'    => 'Taxable professional fees for this engagement type are below Standard Fees.',
                'difference' => round((float)$std - $matchSub, 2),
                'benchmark'  => round((float)$std, 2),
            ];
        }
        if ($calcTotal > 0 && $matchSub + self::EPS < $calcTotal) {
            $violations[] = [
                'code'       => 'below_calculated_hours_fees',
                'message'    => 'Taxable professional fees are below Billed + Unbilled hours value at team planned ₹/hr.',
                'difference' => round($calcTotal - $matchSub, 2),
                'benchmark'  => $calcTotal,
            ];
        }
        if ($std !== null && $calcTotal > 0
            && $matchSub + self::EPS < (float)$std
            && $matchSub + self::EPS < $calcTotal) {
            $violations[] = [
                'code'    => 'below_standard_and_calculated',
                'message' => 'Fees are below both Standard Fees and calculated hours-based fees.',
            ];
        }

        return $violations;
    }

    /**
     * Merge line_kind and cost-analysis labels into GST-normalized lines (same index order).
     *
     * @param array<int, array<string, mixed>> $original
     * @param array<int, array<string, mixed>> $normalized
     * @return array<int, array<string, mixed>>
     */
    public static function mergeLineMetadata(array $original, array $normalized): array
    {
        foreach ($normalized as $i => $ln) {
            $o = $original[$i] ?? [];
            if (!empty($o['line_kind'])) {
                $ln['line_kind'] = $o['line_kind'];
            } elseif (!isset($ln['line_kind'])) {
                $ln['line_kind'] = 'professional_fee';
            }
            foreach ([
                'engagement_type_id',
                'service_line_key',
                'cost_analysis_standard_fees',
                'cost_analysis_billed_hours_fees',
                'cost_analysis_unbilled_hours_fees',
                'cost_analysis_calculated_hours_fees',
                'cost_analysis_suggested_amount',
            ] as $k) {
                if (array_key_exists($k, $o)) {
                    $ln[$k] = $o[$k];
                }
            }
            $normalized[$i] = $ln;
        }

        return $normalized;
    }

    /**
     * Attach per-line display snapshots (same benchmarks repeated on each matching professional line).
     *
     * @param array<int, array<string, mixed>> $lines
     * @return array<int, array<string, mixed>>
     */
    public static function attachLineSnapshots(array $lines, array $analysis): array
    {
        $svcEt = (int)($analysis['engagement_type_id'] ?? 0);
        $std   = $analysis['standard_fees'];
        $bh    = (float)($analysis['billed_hours_fees'] ?? 0);
        $ubh   = (float)($analysis['unbilled_hours_fees'] ?? 0);
        $cht   = (float)($analysis['calculated_hours_fees'] ?? 0);
        $thr   = $analysis['threshold'];
        $sug   = $thr !== null ? (float)$thr : null;

        $out = [];
        foreach ($lines as $ln) {
            if (!is_array($ln)) {
                continue;
            }
            $kind = $ln['line_kind'] ?? 'professional_fee';
            if ($kind === 'cost_recovery') {
                $out[] = $ln;
                continue;
            }
            $et = isset($ln['engagement_type_id']) ? (int)$ln['engagement_type_id'] : 0;
            if ($svcEt > 0 && $et === $svcEt) {
                $ln['cost_analysis_standard_fees']           = $std;
                $ln['cost_analysis_billed_hours_fees']       = round($bh, 2);
                $ln['cost_analysis_unbilled_hours_fees']     = round($ubh, 2);
                $ln['cost_analysis_calculated_hours_fees']   = round($cht, 2);
                $ln['cost_analysis_suggested_amount']        = $sug;
            }
            $out[] = $ln;
        }

        return $out;
    }

    /**
     * @return array<string, mixed>
     */
    public static function aggregateSnapshotForStorage(array $analysis): array
    {
        $std       = $analysis['standard_fees'] ?? null;
        $matchSub  = (float)($analysis['matching_professional_subtotal'] ?? 0);
        $billedH   = (float)($analysis['billed_hours_fees'] ?? 0);
        $unbilledH = (float)($analysis['unbilled_hours_fees'] ?? 0);
        $calcTotal = round($billedH + $unbilledH, 2);
        $thr       = $analysis['threshold'] ?? null;

        return [
            'service_id'                     => $analysis['service_id'] ?? null,
            'engagement_type_id'             => $analysis['engagement_type_id'] ?? null,
            'standard_fees'                  => $std !== null ? round((float)$std, 2) : null,
            'billed_hours_fees'              => round($billedH, 2),
            'unbilled_hours_fees'            => round($unbilledH, 2),
            'calculated_hours_fees'          => $calcTotal,
            'threshold'                      => $thr !== null ? round((float)$thr, 2) : null,
            'matching_professional_subtotal' => round($matchSub, 2),
            'below_standard_fees'            => $std !== null && $matchSub + self::EPS < (float)$std,
            'below_calculated_hours_fees'    => $calcTotal > 0 && $matchSub + self::EPS < $calcTotal,
        ];
    }

    public static function actorMayAcknowledgeCostShortfall(?array $acting): bool
    {
        if ($acting === null) {
            return false;
        }
        $email = strtolower(trim((string)($acting['email'] ?? '')));
        if ($email !== '' && $email === strtolower(\App\Config\Auth::SUPER_ADMIN_EMAIL)) {
            return true;
        }
        $role = strtolower(trim((string)($acting['role_name'] ?? '')));

        return in_array($role, ['super_admin', 'accounts'], true);
    }
}
