<?php
declare(strict_types=1);

/**
 * Weekend digest: client groups with large meeting gaps + material trailing billing.
 *
 *   php cli/send-client-engagement-digest.php
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
require_once $scriptDir . '/app/Modules/CRM/Models/ClientEngagementGapModel.php';

use App\Config\Auth;
use App\Libraries\BrevoMailer;
use App\Models\ClientEngagementGapModel;
use App\Models\UserModel;

$to      = date('Y-m-d');
$from    = date('Y-m-d', strtotime('-12 months'));
$minBill = (float)(getenv('ENGAGEMENT_DIGEST_MIN_BILLING') ?: '100000');
$minGap  = (int)(getenv('ENGAGEMENT_DIGEST_MIN_GAP_DAYS') ?: '90');

$rows = (new ClientEngagementGapModel())->buildReport($from, $to, $minBill, $minGap, 0);
if ($rows === []) {
    fwrite(STDOUT, "[send-client-engagement-digest] No rows for thresholds min_billing={$minBill} min_gap={$minGap}\n");
    exit(0);
}

$tbody = '';
foreach ($rows as $r) {
    $tbody .= '<tr>'
        . '<td>' . htmlspecialchars((string)$r['group_name']) . '</td>'
        . '<td>' . htmlspecialchars((string)($r['last_meeting_date'] ?? '—')) . '</td>'
        . '<td>' . htmlspecialchars((string)$r['gap_days']) . '</td>'
        . '<td>' . htmlspecialchars((string)$r['annual_fee_sum']) . '</td>'
        . '</tr>';
}

$html = '<p>Client groups with annual professional-fee invoicing ≥ <strong>₹' . number_format($minBill) . '</strong> '
    . 'and no meeting within <strong>' . $minGap . '</strong> days (trailing 12 months).</p>'
    . '<p>Period: <strong>' . htmlspecialchars($from) . '</strong> → <strong>' . htmlspecialchars($to) . '</strong></p>'
    . '<table border="1" cellpadding="6" cellspacing="0"><thead><tr>'
    . '<th>Group</th><th>Last meeting</th><th>Gap days</th><th>Fee sum</th></tr></thead><tbody>'
    . $tbody . '</tbody></table>'
    . '<p>Open <strong>Reports → Client engagement gaps</strong> in the portal.</p>';

$superEmail = Auth::SUPER_ADMIN_EMAIL;
$super      = (new UserModel())->findByEmail($superEmail);
$name       = $super ? (string)($super['name'] ?? $superEmail) : 'Super Admin';

BrevoMailer::send($superEmail, $name, '[CA Office] Client engagement gap digest', $html);
fwrite(STDOUT, '[send-client-engagement-digest] Sent ' . count($rows) . " row(s) to {$superEmail}\n");
