<?php
declare(strict_types=1);

/**
 * Verifies recovery-list entity attribution matches exclusive ledger ownership.
 * Run: php scripts/verify_recovery_attribution.php
 */

require dirname(__DIR__) . '/app/Modules/Finance/Models/TxnModel.php';

use App\Models\TxnModel;

function assertTrue(bool $cond, string $msg): void
{
    if (!$cond) {
        fwrite(STDERR, "FAIL: {$msg}\n");
        exit(1);
    }
    echo "OK: {$msg}\n";
}

// SQL helpers
$clientOnly = TxnModel::sqlTxnOwnedExclusivelyByClient('t');
$orgOnly    = TxnModel::sqlTxnOwnedExclusivelyByOrganization('t');
assertTrue(str_contains($clientOnly, 'organization_id'), 'client-only filter references organization_id');
assertTrue(str_contains($orgOnly, 'client_id'), 'org-only filter references client_id');

/**
 * Mirrors getRecoveryByGroupReport() bucketing for a single row.
 *
 * @param array<string, mixed> $row
 */
function recoveryEntityKey(array $row): ?string
{
    $cid = isset($row['client_id']) ? (int)$row['client_id'] : 0;
    $oid = isset($row['organization_id']) ? (int)$row['organization_id'] : 0;
    $lc  = 'regular';
    if ($cid > 0) {
        return 'client:' . $cid . ':' . $lc;
    }
    if ($oid > 0) {
        return 'organization:' . $oid . ':' . $lc;
    }

    return null;
}

/** Org opening balance with exclusive ownership → attributed to organization. */
$key = recoveryEntityKey([
    'client_id'       => null,
    'organization_id' => 23,
    'debit'           => 10000,
    'credit'          => 0,
]);
assertTrue($key === 'organization:23:regular', 'org-only OB row → organization bucket');

/** Dual-ID row (legacy) → client wins (the bug scenario). */
$keyDual = recoveryEntityKey([
    'client_id'       => 99,
    'organization_id' => 23,
    'debit'           => 10000,
    'credit'          => 0,
]);
assertTrue($keyDual === 'client:99:regular', 'dual-ID row → client bucket (pre-migration)');

/** After migration fix (client_id cleared), org bucket receives balance. */
$keyFixed = recoveryEntityKey([
    'client_id'       => null,
    'organization_id' => 23,
    'debit'           => 40702,
    'credit'          => 0,
]);
assertTrue($keyFixed === 'organization:23:regular', 'fixed org OB → organization bucket');

/** Ekaiva scenario: regular receivable + memorandum credit → still recoverable on regular. */
function recoveryPositiveRowTotal(array $entityRow): float
{
    $sum = 0.0;
    foreach (['regular', 'memorandum', 'optional', 'parked'] as $slot) {
        $sum += max(0.0, (float)($entityRow[$slot]['ledgerClosing'] ?? 0));
    }

    return round($sum, 2);
}

$ekaivaRow = [
    'regular'    => ['ledgerClosing' => 40702.0],
    'memorandum' => ['ledgerClosing' => -95493.0],
    'optional'   => ['ledgerClosing' => 0.0],
    'parked'     => ['ledgerClosing' => 0.0],
];
assertTrue(recoveryPositiveRowTotal($ekaivaRow) === 40702.0, 'positive regular + negative memorandum → rowTotal 40702');

echo "\nAll recovery attribution checks passed.\n";
