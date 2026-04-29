<?php
declare(strict_types=1);

/**
 * send-superadmin-timesheet-report.php — Super admin consolidated previous-day timesheet report.
 *
 * Section 1: users below daily shift target (with breakdown).
 * Section 2: users who met or exceeded target (overtime minutes + extra-target multiples; statistical only).
 *
 * Designed for cron:
 *   0 5 * * * php /path/to/server-php/cli/send-superadmin-timesheet-report.php >> /path/to/logs/superadmin-timesheet.log 2>&1
 *
 * Usage:
 *   php cli/send-superadmin-timesheet-report.php              # previous day (default)
 *   php cli/send-superadmin-timesheet-report.php 2026-04-27   # specific date
 *   php cli/send-superadmin-timesheet-report.php --dry-run    # print HTML; do not send
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
            $_SERVER[$key] = $value;
        }
    }
}

require_once $scriptDir . '/app/Config/Database.php';
require_once $scriptDir . '/app/Libraries/BrevoMailer.php';
require_once $scriptDir . '/app/Models/TimeEntryModel.php';

use App\Libraries\BrevoMailer;
use App\Models\TimeEntryModel;

/**
 * @return string
 */
function formatMinutes(int $minutes): string
{
    if ($minutes < 0) {
        $minutes = 0;
    }
    $hours = intdiv($minutes, 60);
    $mins = $minutes % 60;
    return sprintf('%dh %02dm', $hours, $mins);
}

/**
 * @param array<int, array<string, mixed>> $rows
 */
function renderBelowTargetTable(array $rows): string
{
    if ($rows === []) {
        return '<p class="empty-note">No users in this category.</p>';
    }
    $h = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $out = '<table class="data" role="presentation">'
        . '<thead><tr>'
        . '<th>Name</th><th>Email</th><th>Billable</th><th>Non-billable</th>'
        . '<th>Total punched</th><th>Shift target</th><th>Shortfall (idle)</th>'
        . '</tr></thead><tbody>';
    foreach ($rows as $row) {
        $name = $h(trim((string)($row['user_name'] ?? 'User')));
        $email = $h(trim((string)($row['user_email'] ?? '')));
        $rowTarget = (int)($row['shift_target_minutes'] ?? TimeEntryModel::SHIFT_TARGET_MINUTES);
        $bill = (int)($row['billable_minutes'] ?? 0);
        $non = (int)($row['non_billable_minutes'] ?? 0);
        $punched = (int)($row['total_punched_minutes'] ?? 0);
        $idle = max(0, $rowTarget - $punched);
        $out .= '<tr>'
            . "<td>{$name}</td>"
            . "<td><small>{$email}</small></td>"
            . '<td>' . $h(formatMinutes($bill) . " ({$bill})") . '</td>'
            . '<td>' . $h(formatMinutes($non) . " ({$non})") . '</td>'
            . '<td>' . $h(formatMinutes($punched) . " ({$punched})") . '</td>'
            . '<td>' . $h(formatMinutes($rowTarget) . " ({$rowTarget} min)") . '</td>'
            . '<td>' . $h(formatMinutes($idle) . " ({$idle})") . '</td>'
            . '</tr>';
    }
    return $out . '</tbody></table>';
}

/**
 * @param array<int, array<string, mixed>> $rows
 */
function renderMetOrOverTable(array $rows): string
{
    if ($rows === []) {
        return '<p class="empty-note">No users in this category.</p>';
    }
    $h = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $out = '<table class="data" role="presentation">'
        . '<thead><tr>'
        . '<th>Name</th><th>Email</th><th>Total punched</th><th>Shift target</th>'
        . '<th>Overtime (min)</th><th>Extra target multiples</th>'
        . '</tr></thead><tbody>';
    foreach ($rows as $row) {
        $name = $h(trim((string)($row['user_name'] ?? 'User')));
        $email = $h(trim((string)($row['user_email'] ?? '')));
        $rowTarget = (int)($row['shift_target_minutes'] ?? TimeEntryModel::SHIFT_TARGET_MINUTES);
        $punched = (int)($row['total_punched_minutes'] ?? 0);
        $overtime = max(0, $punched - $rowTarget);
        $extraMultiples = $punched > $rowTarget ? intdiv($punched - $rowTarget, $rowTarget) : 0;
        $out .= '<tr>'
            . "<td>{$name}</td>"
            . "<td><small>{$email}</small></td>"
            . '<td>' . $h(formatMinutes($punched) . " ({$punched})") . '</td>'
            . '<td>' . $h(formatMinutes($rowTarget) . " ({$rowTarget})") . '</td>'
            . '<td>' . $h(formatMinutes($overtime) . " ({$overtime})") . '</td>'
            . '<td>' . $h((string)$extraMultiples) . '</td>'
            . '</tr>';
    }
    return $out . '</tbody></table>';
}

$dryRun = false;
$targetDate = null;

foreach (array_slice($argv ?? [], 1) as $arg) {
    if ($arg === '--dry-run') {
        $dryRun = true;
    } elseif (preg_match('/^\d{4}-\d{2}-\d{2}$/', $arg)) {
        $targetDate = $arg;
    }
}

if ($targetDate === null) {
    $targetDate = date('Y-m-d', strtotime('yesterday'));
}

$model = new TimeEntryModel();
$rows = $model->listDailyUserPunchedSummary($targetDate);

if ($rows === []) {
    echo "[superadmin-timesheet-report] No active users found for {$targetDate}." . PHP_EOL;
    exit(0);
}

$below = [];
$metOrOver = [];

foreach ($rows as $row) {
    $punched = (int)($row['total_punched_minutes'] ?? 0);
    $rowTarget = (int)($row['shift_target_minutes'] ?? TimeEntryModel::SHIFT_TARGET_MINUTES);
    if ($punched < $rowTarget) {
        $below[] = $row;
    } else {
        $metOrOver[] = $row;
    }
}

$labelDate = date('d M Y', (int)strtotime($targetDate));
$defaultTarget = TimeEntryModel::SHIFT_TARGET_MINUTES;
$defaultTargetFormatted = formatMinutes($defaultTarget);

$belowHtml = renderBelowTargetTable($below);
$metHtml = renderMetOrOverTable($metOrOver);

$htmlBody = BrevoMailer::renderTemplate('superadmin-timesheet-daily', [
    'reportDate'      => htmlspecialchars($labelDate, ENT_QUOTES, 'UTF-8'),
    'targetMinutes'   => (string)$defaultTarget,
    'targetFormatted' => htmlspecialchars($defaultTargetFormatted, ENT_QUOTES, 'UTF-8'),
    'belowTargetTable' => $belowHtml,
    'metOrOverTable'   => $metHtml,
]);

if ($htmlBody === '') {
    fwrite(STDERR, '[superadmin-timesheet-report] Template render failed.' . PHP_EOL);
    exit(1);
}

if ($dryRun) {
    echo $htmlBody . PHP_EOL;
    echo PHP_EOL . '[superadmin-timesheet-report] DRY RUN — email NOT sent.' . PHP_EOL;
    exit(0);
}

$superadminEmail = (string)(getenv('SUPERADMIN_NOTIFY_EMAIL') ?: 'office@carahulgupta.in');
$subject = "Daily Timesheet Report ({$labelDate}) — CA Rahul Gupta";

$sent = BrevoMailer::send($superadminEmail, 'CA Rahul Gupta', $subject, $htmlBody);

if (!$sent) {
    fwrite(STDERR, '[superadmin-timesheet-report] Failed to send email.' . PHP_EOL);
    exit(1);
}

echo '[superadmin-timesheet-report] Sent for ' . $labelDate
    . ' | below_target=' . count($below) . ' | met_or_over=' . count($metOrOver) . PHP_EOL;
exit(0);
