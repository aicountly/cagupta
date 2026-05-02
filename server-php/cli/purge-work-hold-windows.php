<?php
declare(strict_types=1);

/**
 * Remove expired work-hold window exceptions (exception_kind = window, expires_at <= now).
 * Safe to run from cron (e.g. hourly).
 *
 *   php cli/purge-work-hold-windows.php
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
require_once $scriptDir . '/app/Modules/CRM/Models/WorkHoldExceptionModel.php';

use App\Models\WorkHoldExceptionModel;

$n = (new WorkHoldExceptionModel())->purgeExpiredWindows();
fwrite(STDOUT, "[purge-work-hold-windows] Deleted {$n} expired window exception(s).\n");
