<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Validation, snapshot building, total computation, and share-text formatting
 * for flexible quotation pricing models.
 */
final class QuotationPricing
{
    public const MODEL_FIXED = 'fixed';
    public const MODEL_PER_HOUR = 'per_hour';
    public const MODEL_FIXED_PLUS = 'fixed_plus_additional';

    public const FEE_FIXED = 'fixed_per_event';
    public const FEE_HOURLY = 'per_hour';
    public const FEE_BOTH = 'both';

    /**
     * @return array<int, string>
     */
    public static function pricingModels(): array
    {
        return [self::MODEL_FIXED, self::MODEL_PER_HOUR, self::MODEL_FIXED_PLUS];
    }

    /**
     * @param array<string, mixed> $et Engagement type row
     * @param array<int, array<string, mixed>> $templates
     * @return array<string, mixed>
     */
    public static function buildSnapshotFromEngagementType(array $et, array $templates): array
    {
        $model = self::normalizeModel((string)($et['pricing_model'] ?? self::MODEL_FIXED));

        $snapshot = [
            'pricing_model'    => $model,
            'base_amount'      => self::nullableFloat($et['quotation_base_amount'] ?? null),
            'hourly_rate'      => self::nullableFloat($et['quotation_hourly_rate'] ?? null),
            'estimated_hours'  => self::nullableFloat($et['quotation_estimated_hours'] ?? null),
            'additional_items' => [],
        ];

        if ($model === self::MODEL_FIXED_PLUS) {
            foreach ($templates as $t) {
                $snapshot['additional_items'][] = self::templateToSnapshotItem($t);
            }
        }

        return $snapshot;
    }

    /**
     * @param array<string, mixed> $template
     * @return array<string, mixed>
     */
    public static function templateToSnapshotItem(array $template): array
    {
        return [
            'template_id'      => isset($template['id']) ? (int)$template['id'] : null,
            'label'            => trim((string)($template['label'] ?? '')),
            'fee_type'         => self::normalizeFeeType((string)($template['fee_type'] ?? self::FEE_FIXED)),
            'fixed_amount'     => self::nullableFloat($template['fixed_amount'] ?? null),
            'hourly_rate'      => self::nullableFloat($template['hourly_rate'] ?? null),
            'estimated_hours'  => self::nullableFloat($template['estimated_hours'] ?? null),
            'include_in_share' => true,
            'is_custom'        => false,
        ];
    }

    /**
     * Normalize snapshot from API / DB; backfill legacy flat price.
     *
     * @param mixed $raw
     * @param float|null $legacyPrice
     * @return array<string, mixed>
     */
    public static function normalizeSnapshot(mixed $raw, ?float $legacyPrice = null): array
    {
        if (!is_array($raw) || $raw === []) {
            if ($legacyPrice !== null && $legacyPrice > 0) {
                return [
                    'pricing_model'    => self::MODEL_FIXED,
                    'base_amount'      => round($legacyPrice, 2),
                    'hourly_rate'      => null,
                    'estimated_hours'  => null,
                    'additional_items' => [],
                ];
            }
            return self::emptySnapshot();
        }

        $model = self::normalizeModel((string)($raw['pricing_model'] ?? self::MODEL_FIXED));
        $items = [];
        if (isset($raw['additional_items']) && is_array($raw['additional_items'])) {
            foreach ($raw['additional_items'] as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $items[] = self::normalizeAdditionalItem($item);
            }
        }

        return [
            'pricing_model'    => $model,
            'base_amount'      => self::nullableFloat($raw['base_amount'] ?? null),
            'hourly_rate'      => self::nullableFloat($raw['hourly_rate'] ?? null),
            'estimated_hours'  => self::nullableFloat($raw['estimated_hours'] ?? null),
            'additional_items' => $items,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function emptySnapshot(): array
    {
        return [
            'pricing_model'    => self::MODEL_FIXED,
            'base_amount'      => null,
            'hourly_rate'      => null,
            'estimated_hours'  => null,
            'additional_items' => [],
        ];
    }

    /**
     * @param array<string, mixed> $item
     * @return array<string, mixed>
     */
    public static function normalizeAdditionalItem(array $item): array
    {
        return [
            'template_id'      => isset($item['template_id']) && $item['template_id'] !== ''
                ? (int)$item['template_id'] : null,
            'label'            => trim((string)($item['label'] ?? '')),
            'fee_type'         => self::normalizeFeeType((string)($item['fee_type'] ?? self::FEE_FIXED)),
            'fixed_amount'     => self::nullableFloat($item['fixed_amount'] ?? null),
            'hourly_rate'      => self::nullableFloat($item['hourly_rate'] ?? null),
            'estimated_hours'  => self::nullableFloat($item['estimated_hours'] ?? null),
            'include_in_share' => array_key_exists('include_in_share', $item)
                ? (bool)$item['include_in_share'] : true,
            'is_custom'        => (bool)($item['is_custom'] ?? false),
        ];
    }

    /**
     * @param array<string, mixed> $et
     * @return bool
     */
    public static function engagementTypeHasValidPricing(array $et): bool
    {
        $model = self::normalizeModel((string)($et['pricing_model'] ?? self::MODEL_FIXED));

        if ($model === self::MODEL_FIXED) {
            $base = self::nullableFloat($et['quotation_base_amount'] ?? null);
            return $base !== null && $base > 0;
        }

        if ($model === self::MODEL_PER_HOUR) {
            $rate = self::nullableFloat($et['quotation_hourly_rate'] ?? null);
            return $rate !== null && $rate > 0;
        }

        if ($model === self::MODEL_FIXED_PLUS) {
            $base = self::nullableFloat($et['quotation_base_amount'] ?? null);
            return $base !== null && $base > 0;
        }

        return false;
    }

    /**
     * @param array<string, mixed> $snapshot
     */
    public static function computeTotal(array $snapshot): ?float
    {
        $model = self::normalizeModel((string)($snapshot['pricing_model'] ?? self::MODEL_FIXED));
        $total = 0.0;
        $hasValue = false;

        if ($model === self::MODEL_FIXED) {
            $base = self::nullableFloat($snapshot['base_amount'] ?? null);
            if ($base !== null && $base > 0) {
                return round($base, 2);
            }
            return null;
        }

        if ($model === self::MODEL_PER_HOUR) {
            $rate  = self::nullableFloat($snapshot['hourly_rate'] ?? null);
            $hours = self::nullableFloat($snapshot['estimated_hours'] ?? null);
            if ($rate !== null && $rate > 0 && $hours !== null && $hours > 0) {
                return round($rate * $hours, 2);
            }
            return null;
        }

        if ($model === self::MODEL_FIXED_PLUS) {
            $base = self::nullableFloat($snapshot['base_amount'] ?? null);
            if ($base !== null && $base > 0) {
                $total += $base;
                $hasValue = true;
            }

            foreach ($snapshot['additional_items'] ?? [] as $item) {
                if (!is_array($item) || !($item['include_in_share'] ?? false)) {
                    continue;
                }
                $itemTotal = self::computeAdditionalItemAmount($item);
                if ($itemTotal !== null && $itemTotal > 0) {
                    $total += $itemTotal;
                    $hasValue = true;
                }
            }

            return $hasValue ? round($total, 2) : null;
        }

        return null;
    }

    /**
     * @param array<string, mixed> $item
     */
    public static function computeAdditionalItemAmount(array $item): ?float
    {
        $feeType = self::normalizeFeeType((string)($item['fee_type'] ?? self::FEE_FIXED));
        $amount  = 0.0;
        $has     = false;

        if ($feeType === self::FEE_FIXED || $feeType === self::FEE_BOTH) {
            $fixed = self::nullableFloat($item['fixed_amount'] ?? null);
            if ($fixed !== null && $fixed > 0) {
                $amount += $fixed;
                $has = true;
            }
        }

        if ($feeType === self::FEE_HOURLY || $feeType === self::FEE_BOTH) {
            $rate  = self::nullableFloat($item['hourly_rate'] ?? null);
            $hours = self::nullableFloat($item['estimated_hours'] ?? null);
            if ($rate !== null && $rate > 0 && $hours !== null && $hours > 0) {
                $amount += $rate * $hours;
                $has = true;
            }
        }

        return $has ? round($amount, 2) : null;
    }

    /**
     * @param array<int, string> $docs
     */
    public static function formatShareText(string $contactName, array $snapshot, array $docs): string
    {
        $lines   = ["Quotation for {$contactName}", ''];
        $model   = self::normalizeModel((string)($snapshot['pricing_model'] ?? self::MODEL_FIXED));
        $fmt     = static fn (?float $v): string => $v !== null
            ? '₹' . number_format($v, 2, '.', ',')
            : '—';

        if ($model === self::MODEL_FIXED) {
            $base = self::nullableFloat($snapshot['base_amount'] ?? null);
            $lines[] = 'Professional fee: ' . $fmt($base);
        } elseif ($model === self::MODEL_PER_HOUR) {
            $rate  = self::nullableFloat($snapshot['hourly_rate'] ?? null);
            $hours = self::nullableFloat($snapshot['estimated_hours'] ?? null);
            $lines[] = 'Hourly rate: ' . $fmt($rate) . '/hr';
            if ($hours !== null && $hours > 0) {
                $lines[] = 'Estimated hours: ' . rtrim(rtrim(number_format($hours, 4, '.', ''), '0'), '.');
            }
            $total = self::computeTotal($snapshot);
            if ($total !== null) {
                $lines[] = 'Estimated total: ' . $fmt($total);
            }
        } elseif ($model === self::MODEL_FIXED_PLUS) {
            $base = self::nullableFloat($snapshot['base_amount'] ?? null);
            $lines[] = 'Base fee: ' . $fmt($base);

            foreach ($snapshot['additional_items'] ?? [] as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $label = trim((string)($item['label'] ?? ''));
                if ($label === '') {
                    continue;
                }
                $desc = self::describeAdditionalItem($item);
                if ($desc === '') {
                    continue;
                }
                $included = (bool)($item['include_in_share'] ?? false);
                if ($included) {
                    $lines[] = "Included: {$desc} ({$label})";
                } else {
                    $lines[] = "Additional {$desc} if {$label} occurs";
                }
            }

            $total = self::computeTotal($snapshot);
            if ($total !== null) {
                $lines[] = '';
                $lines[] = 'Quoted total (included items): ' . $fmt($total);
            }
        }

        if ($docs !== []) {
            $lines[] = '';
            $lines[] = 'Documents required:';
            foreach ($docs as $doc) {
                $s = trim((string)$doc);
                if ($s !== '') {
                    $lines[] = '- ' . $s;
                }
            }
        }

        return implode("\n", $lines);
    }

    /**
     * @param array<string, mixed> $item
     */
    public static function describeAdditionalItem(array $item): string
    {
        $feeType = self::normalizeFeeType((string)($item['fee_type'] ?? self::FEE_FIXED));
        $parts   = [];

        if ($feeType === self::FEE_FIXED || $feeType === self::FEE_BOTH) {
            $fixed = self::nullableFloat($item['fixed_amount'] ?? null);
            if ($fixed !== null && $fixed > 0) {
                $parts[] = '₹' . number_format($fixed, 2, '.', ',') . ' per event';
            }
        }

        if ($feeType === self::FEE_HOURLY || $feeType === self::FEE_BOTH) {
            $rate = self::nullableFloat($item['hourly_rate'] ?? null);
            if ($rate !== null && $rate > 0) {
                $parts[] = '₹' . number_format($rate, 2, '.', ',') . '/hr';
            }
        }

        return implode(' + ', $parts);
    }

    /**
     * @param array<string, mixed> $fields
     * @return array<string, string> field => error message
     */
    public static function validateEngagementTypePricing(array $fields): array
    {
        $errors = [];
        $model  = self::normalizeModel((string)($fields['pricing_model'] ?? self::MODEL_FIXED));

        if ($model === self::MODEL_FIXED) {
            $base = self::nullableFloat($fields['quotation_base_amount'] ?? null);
            if ($base === null || $base <= 0) {
                $errors['quotation_base_amount'] = 'Base amount is required for fixed pricing.';
            }
        } elseif ($model === self::MODEL_PER_HOUR) {
            $rate = self::nullableFloat($fields['quotation_hourly_rate'] ?? null);
            if ($rate === null || $rate <= 0) {
                $errors['quotation_hourly_rate'] = 'Hourly rate is required for per-hour pricing.';
            }
        } elseif ($model === self::MODEL_FIXED_PLUS) {
            $base = self::nullableFloat($fields['quotation_base_amount'] ?? null);
            if ($base === null || $base <= 0) {
                $errors['quotation_base_amount'] = 'Base amount is required for fixed + additional pricing.';
            }
        }

        return $errors;
    }

    /**
     * @param array<string, mixed> $item
     * @return array<string, string>
     */
    public static function validateAdditionalTemplate(array $item): array
    {
        $errors = [];
        $label  = trim((string)($item['label'] ?? ''));
        if ($label === '') {
            $errors['label'] = 'Label is required.';
        }

        $feeType = self::normalizeFeeType((string)($item['fee_type'] ?? ''));
        if ($feeType === self::FEE_FIXED || $feeType === self::FEE_BOTH) {
            $fixed = self::nullableFloat($item['fixed_amount'] ?? null);
            if ($fixed === null || $fixed <= 0) {
                $errors['fixed_amount'] = 'Fixed amount is required.';
            }
        }
        if ($feeType === self::FEE_HOURLY || $feeType === self::FEE_BOTH) {
            $rate = self::nullableFloat($item['hourly_rate'] ?? null);
            if ($rate === null || $rate <= 0) {
                $errors['hourly_rate'] = 'Hourly rate is required.';
            }
        }

        return $errors;
    }

    public static function normalizeModel(string $model): string
    {
        $model = strtolower(trim($model));
        return in_array($model, self::pricingModels(), true) ? $model : self::MODEL_FIXED;
    }

    public static function normalizeFeeType(string $feeType): string
    {
        $feeType = strtolower(trim($feeType));
        if (in_array($feeType, [self::FEE_FIXED, self::FEE_HOURLY, self::FEE_BOTH], true)) {
            return $feeType;
        }
        return self::FEE_FIXED;
    }

    private static function nullableFloat(mixed $v): ?float
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (!is_numeric($v)) {
            return null;
        }
        $f = (float)$v;
        return $f >= 0 ? round($f, 4) : null;
    }
}
