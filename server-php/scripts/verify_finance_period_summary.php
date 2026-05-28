<?php
declare(strict_types=1);

/**
 * Verifies FinancePeriodSummary closing outstanding matches positive per-entity ledger-class totals.
 * Run: php scripts/verify_finance_period_summary.php
 */

require dirname(__DIR__) . '/app/Libraries/FinancePeriodSummary.php';
require dirname(__DIR__) . '/app/Libraries/LedgerRecoveryAggregator.php';
require dirname(__DIR__) . '/app/Libraries/LedgerDimensions.php';
require dirname(__DIR__) . '/app/Libraries/LedgerPresentation.php';

use App\Libraries\FinancePeriodSummary;
use App\Libraries\LedgerRecoveryAggregator;

function assertTrue(bool $cond, string $msg): void
{
    if (!$cond) {
        fwrite(STDERR, "FAIL: {$msg}\n");
        exit(1);
    }
    echo "OK: {$msg}\n";
}

/** @param array<string, mixed> $overrides */
function txn(array $overrides): array
{
    return array_merge([
        'id'                   => 1,
        'txn_type'             => 'invoice',
        'txn_date'             => '2026-01-15',
        'status'               => 'active',
        'invoice_status'       => 'sent',
        'client_id'            => 1,
        'organization_id'      => null,
        'ledger_class'         => 'regular',
        'debit'                => 10000,
        'credit'               => 0,
        'amount'               => 10000,
        'subtotal'             => 10000,
        'tax_amount'           => 0,
        'line_items'           => [['description' => 'Fee', 'amount' => 10000, 'line_kind' => 'fee']],
        'ledger_movement_kind' => '',
    ], $overrides);
}

// Cross-entity netting: entity A owes 100k, entity B has 20k credit → outstanding must stay 100k.
$rows = [
    txn(['id' => 1, 'client_id' => 1, 'debit' => 100000, 'credit' => 0, 'amount' => 100000, 'subtotal' => 100000,
        'line_items' => [['description' => 'Fee', 'amount' => 100000, 'line_kind' => 'fee']]]),
    txn(['id' => 2, 'client_id' => 2, 'txn_type' => 'receipt', 'debit' => 0, 'credit' => 20000, 'amount' => 20000]),
];
$summary = FinancePeriodSummary::compute($rows, '2026-04-01', '2026-05-28');
assertTrue(
    abs((float)$summary['consolidated']['outstanding'] - 100000.0) < 0.01,
    'cross-entity credit does not reduce firm outstanding (100000 not 80000)'
);

// Cross ledger-class: regular receivable + memorandum credit on same entity.
$rows2 = [
    txn(['id' => 10, 'client_id' => 5, 'ledger_class' => 'regular', 'debit' => 40702, 'credit' => 0,
        'amount' => 40702, 'subtotal' => 40702,
        'line_items' => [['description' => 'Fee', 'amount' => 40702, 'line_kind' => 'fee']]]),
    txn(['id' => 11, 'client_id' => 5, 'ledger_class' => 'memorandum', 'txn_type' => 'receipt',
        'debit' => 0, 'credit' => 95493, 'amount' => 95493]),
];
$summary2 = FinancePeriodSummary::compute($rows2, '2026-04-01', '2026-05-28');
assertTrue(
    abs((float)$summary2['consolidated']['outstanding'] - 40702.0) < 0.01,
    'memorandum credit does not net away regular receivable (40702 not negative)'
);

// Old pooled method would have produced different (lower) numbers — sanity check.
$pooled = LedgerRecoveryAggregator::compute($rows2);
assertTrue(
    $pooled['consolidated_closing'] < 0,
    'pooled aggregator nets memorandum credit (confirms bug scenario)'
);

echo "\nAll finance period summary checks passed.\n";
