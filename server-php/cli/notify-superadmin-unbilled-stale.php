<?php
declare(strict_types=1);

/**
 * Email super admin if any service stayed billing_closure = open for 48h+ since billing_open_since.
 * Cron: daily or every 12h.
 *
 *   php cli/notify-superadmin-unbilled-stale.php
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

use App\Config\Auth;
use App\Config\Database;
use App\Libraries\BrevoMailer;
use App\Models\UserModel;

$pdo = Database::getConnection();
$sql = "SELECT s.id, s.service_type, s.billing_open_since,
        COALESCE(c.organization_name, TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), o.name, 'Client') AS client_label
        FROM services s
        LEFT JOIN clients c ON c.id = s.client_id
        LEFT JOIN organizations o ON o.id = s.organization_id
        WHERE s.billing_closure = 'open'
          AND s.billing_open_since IS NOT NULL
          AND s.billing_open_since < (NOW() - INTERVAL '48 hours')
        ORDER BY s.billing_open_since ASC
        LIMIT 200";
$rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) ?: [];
if ($rows === []) {
    fwrite(STDOUT, "[notify-superadmin-unbilled-stale] OK — no stale rows.\n");
    exit(0);
}

$tbody = '';
foreach ($rows as $r) {
    $since = (string)($r['billing_open_since'] ?? '');
    $tbody .= '<tr><td>' . htmlspecialchars((string)$r['id']) . '</td><td>'
        . htmlspecialchars((string)$r['client_label']) . '</td><td>'
        . htmlspecialchars((string)($r['service_type'] ?? '')) . '</td><td>'
        . htmlspecialchars($since) . '</td></tr>';
}

$n = count($rows);
$html = '<p><strong>' . $n . '</strong> engagement(s) have been awaiting billing for over <strong>48 hours</strong>.</p>'
    . '<table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>ID</th><th>Client</th><th>Service</th><th>Open since</th></tr></thead><tbody>'
    . $tbody . '</tbody></table>';

$superEmail = Auth::SUPER_ADMIN_EMAIL;
$super      = (new UserModel())->findByEmail($superEmail);
$name       = $super ? (string)($super['name'] ?? $superEmail) : 'Super Admin';

BrevoMailer::send($superEmail, $name, '[CA Office] Unbilled >48h — action needed', $html);
fwrite(STDOUT, "[notify-superadmin-unbilled-stale] Sent {$n} row(s) digest to {$superEmail}\n");
