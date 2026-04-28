<?php
declare(strict_types=1);

/**
 * send-timesheet-intimation.php — Daily low-timesheet user intimation sender.
 *
 * Evaluates each active user's previous-day timesheet, and sends an individual
 * email only when punched time is below target (default 510 minutes).
 *
 * Designed for cron:
 *   0 6 * * * php /path/to/server-php/cli/send-timesheet-intimation.php >> /path/to/logs/timesheet-intimation.log 2>&1
 *
 * Usage:
 *   php cli/send-timesheet-intimation.php            # previous day (default)
 *   php cli/send-timesheet-intimation.php 2026-04-27 # specific date
 *   php cli/send-timesheet-intimation.php --dry-run  # do not send; print candidates
 */

$scriptDir  = dirname(__DIR__);
$envFile    = $scriptDir . '/.env';

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
$targetMinutes = TimeEntryModel::SHIFT_TARGET_MINUTES;
$rows = $model->listDailyUserPunchedSummary($targetDate, $targetMinutes);

if (empty($rows)) {
    echo "[timesheet-intimation] No active users found for {$targetDate}." . PHP_EOL;
    exit(0);
}

$sentCount = 0;
$skipCount = 0;
$failCount = 0;
$labelDate = date('d M Y', (int)strtotime($targetDate));

foreach ($rows as $row) {
    $userEmail = trim((string)($row['user_email'] ?? ''));
    $userName = trim((string)($row['user_name'] ?? 'User'));
    if ($userEmail === '') {
        $skipCount++;
        continue;
    }

    $billable = (int)($row['billable_minutes'] ?? 0);
    $nonBillable = (int)($row['non_billable_minutes'] ?? 0);
    $punched = (int)($row['total_punched_minutes'] ?? 0);
    $idle = max(0, $targetMinutes - $punched);

    if ($punched >= $targetMinutes) {
        $skipCount++;
        continue;
    }

    $htmlBody = BrevoMailer::renderTemplate('timesheet-low-intimation', [
        'userName' => htmlspecialchars($userName, ENT_QUOTES, 'UTF-8'),
        'reportDate' => htmlspecialchars($labelDate, ENT_QUOTES, 'UTF-8'),
        'targetMinutes' => (string)$targetMinutes,
        'targetFormatted' => formatMinutes($targetMinutes),
        'billableMinutes' => (string)$billable,
        'billableFormatted' => formatMinutes($billable),
        'nonBillableMinutes' => (string)$nonBillable,
        'nonBillableFormatted' => formatMinutes($nonBillable),
        'punchedMinutes' => (string)$punched,
        'punchedFormatted' => formatMinutes($punched),
        'idleMinutes' => (string)$idle,
        'idleFormatted' => formatMinutes($idle),
    ]);
    if ($htmlBody === '') {
        $failCount++;
        fwrite(STDERR, "[timesheet-intimation] Template render failed for {$userEmail}" . PHP_EOL);
        continue;
    }

    $subject = "Timesheet Intimation ({$labelDate}) — action required";

    if ($dryRun) {
        echo "[DRY RUN] {$userEmail} | punched={$punched} | billable={$billable} | non_billable={$nonBillable} | idle={$idle}" . PHP_EOL;
        $sentCount++;
        continue;
    }

    $ok = BrevoMailer::send($userEmail, $userName, $subject, $htmlBody);
    if ($ok) {
        $sentCount++;
    } else {
        $failCount++;
        fwrite(STDERR, "[timesheet-intimation] Send failed for {$userEmail}" . PHP_EOL);
    }
}

echo "[timesheet-intimation] Date={$targetDate} sent={$sentCount} skipped={$skipCount} failed={$failCount}" . PHP_EOL;
exit($failCount > 0 ? 1 : 0);
