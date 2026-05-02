<?php
declare(strict_types=1);

/**
 * Email super admin yesterday's invoice cost-variance rows (below standard / below calculated hours value).
 * Cron: daily after midnight (server TZ).
 *
 *   php cli/notify-invoice-cost-variance-yesterday.php
 */

$scriptDir = dirname(__DIR__);
$envFile   = $scriptDir . '/.env';
if (is_readable($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if (preg_match('/^(["\'])(.*)\\1$/', $value, $m)) {
            $value = $m[2];
        }
        if ($key !== '' && !array_key_exists($key, $_ENV)) {
            putenv("{$key}={$value}");
            $_ENV[$key] = $value;
        }
    }
}

require_once $scriptDir . '/app/Config/Database.php';
require_once $scriptDir . '/app/Config/Auth.php';
require_once $scriptDir . '/app/Libraries/BrevoMailer.php';
require_once $scriptDir . '/app/Modules/Core/Models/UserModel.php';
require_once $scriptDir . '/app/Modules/Finance/Models/TxnModel.php';

use App\Config\Auth;
use App\Libraries\BrevoMailer;
use App\Models\TxnModel;
use App\Models\UserModel;

$yesterday = (new DateTimeImmutable('yesterday'))->format('Y-m-d');

$txn = new TxnModel();
$rows = $txn->listInvoiceCostVarianceRows($yesterday, $yesterday);

if ($rows === []) {
    fwrite(STDOUT, "[notify-invoice-cost-variance-yesterday] OK — no variance rows for {$yesterday}.\n");
    exit(0);
}

$tbody = '';
foreach ($rows as $r) {
    $flags = [];
    if (!empty($r['below_both'])) {
        $flags[] = 'below both';
    } else {
        if (!empty($r['below_standard_fees'])) {
            $flags[] = 'below std';
        }
        if (!empty($r['below_calculated_hours_fees'])) {
            $flags[] = 'below calc';
        }
    }
    $tbody .= '<tr>'
        . '<td>' . htmlspecialchars((string)$yesterday) . '</td>'
        . '<td>' . htmlspecialchars((string)($r['invoice_number'] ?? '')) . '</td>'
        . '<td>' . htmlspecialchars((string)($r['client_name'] ?? '')) . '</td>'
        . '<td>' . htmlspecialchars((string)($r['service_id'] ?? '')) . '</td>'
        . '<td style="text-align:right">' . htmlspecialchars((string)($r['matching_professional_subtotal'] ?? '')) . '</td>'
        . '<td style="text-align:right">' . htmlspecialchars((string)($r['standard_fees'] ?? '—')) . '</td>'
        . '<td style="text-align:right">' . htmlspecialchars((string)($r['calculated_hours_fees'] ?? '')) . '</td>'
        . '<td>' . htmlspecialchars(implode(', ', $flags)) . '</td>'
        . '</tr>';
}

$n = count($rows);
$html = '<p><strong>' . $n . '</strong> invoice(s) on <strong>' . htmlspecialchars($yesterday)
    . '</strong> had taxable fees below Standard Fees and/or calculated hours-based value.</p>'
    . '<table border="1" cellpadding="6" cellspacing="0"><thead><tr>'
    . '<th>Date</th><th>Invoice</th><th>Client</th><th>Service</th>'
    . '<th>Matching fees (₹)</th><th>Std (₹)</th><th>Hours-based (₹)</th><th>Flags</th>'
    . '</tr></thead><tbody>' . $tbody . '</tbody></table>'
    . '<p>Open <strong>Finance → Invoice cost variance</strong> in the app for full detail and acknowledgements.</p>';

$superEmail = Auth::SUPER_ADMIN_EMAIL;
$super      = (new UserModel())->findByEmail($superEmail);
$name       = $super ? (string)($super['name'] ?? $superEmail) : 'Super Admin';

BrevoMailer::send($superEmail, $name, '[CA Office] Invoice cost variance — ' . $yesterday, $html);
fwrite(STDOUT, "[notify-invoice-cost-variance-yesterday] Sent {$n} row(s) to {$superEmail}\n");
