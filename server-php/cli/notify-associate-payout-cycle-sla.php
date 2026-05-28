<?php
declare(strict_types=1);

/**
 * In-app reminders for associate payout cycles that are finalised but not yet disbursed,
 * relative to the 3-calendar-day SLA after period_end (tracked via disbursal_due_on).
 *
 * Cron: daily (e.g. 9 AM).
 *
 *   php cli/notify-associate-payout-cycle-sla.php
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
require_once $scriptDir . '/app/Modules/Core/Models/UserModel.php';
require_once $scriptDir . '/app/Modules/Core/Models/UserNotificationModel.php';
require_once $scriptDir . '/app/Modules/Associate/Models/AssociatePayoutCycleModel.php';

use App\Models\AssociatePayoutCycleModel;
use App\Models\UserNotificationModel;

$n = (new AssociatePayoutCycleModel())->runSlaNotifications(new UserNotificationModel());
fwrite(STDOUT, "[notify-associate-payout-cycle-sla] Sent {$n} SLA notification batch(es).\n");
