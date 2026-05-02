<?php
declare(strict_types=1);

/**
 * Email Accounts-role users with services still in billing_closure = open.
 * Cron: every 12 hours recommended.
 *
 *   php cli/notify-unbilled-accounts.php
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
require_once $scriptDir . '/app/Libraries/BrevoMailer.php';
require_once $scriptDir . '/app/Modules/Core/Models/UserModel.php';

use App\Config\Database;
use App\Libraries\BrevoMailer;
use App\Models\UserModel;

$pdo = Database::getConnection();

$sql = "SELECT s.id, s.service_type, s.status,
        COALESCE(c.organization_name, TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), o.name, 'Client') AS client_label
        FROM services s
        LEFT JOIN clients c ON c.id = s.client_id
        LEFT JOIN organizations o ON o.id = s.organization_id
        WHERE s.billing_closure = 'open'
          AND (s.status = 'completed' OR (
                jsonb_array_length(COALESCE(s.tasks, '[]'::jsonb)) > 0 AND NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(COALESCE(s.tasks, '[]'::jsonb)) el
                    WHERE COALESCE(el->>'status', '') <> 'done'
                )
            ))
        ORDER BY s.billing_open_since NULLS LAST, s.id DESC
        LIMIT 200";

$rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) ?: [];
$count = count($rows);
if ($count === 0) {
    fwrite(STDOUT, "[notify-unbilled-accounts] Nothing to send.\n");
    exit(0);
}

$tbody = '';
foreach ($rows as $r) {
    $tbody .= '<tr><td>' . htmlspecialchars((string)$r['id']) . '</td><td>'
        . htmlspecialchars((string)$r['client_label']) . '</td><td>'
        . htmlspecialchars((string)($r['service_type'] ?? '')) . '</td></tr>';
}

$html = '<p>There are <strong>' . $count . '</strong> service engagement(s) with billing still open (due for invoicing).</p>'
    . '<table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>ID</th><th>Client</th><th>Service</th></tr></thead><tbody>'
    . $tbody . '</tbody></table>'
    . '<p>Open <strong>Invoices → Service billing</strong> in the portal.</p>';

$recipients = (new UserModel())->listActiveUsersByRoleName('accounts');
if ($recipients === []) {
    fwrite(STDERR, "[notify-unbilled-accounts] No active accounts-role users.\n");
    exit(1);
}

$subject = '[CA Office] Unbilled services reminder (' . $count . ')';
foreach ($recipients as $rec) {
    $email = trim((string)($rec['email'] ?? ''));
    if ($email === '') {
        continue;
    }
    BrevoMailer::send($email, (string)($rec['name'] ?? $email), $subject, $html);
    fwrite(STDOUT, "[notify-unbilled-accounts] Sent to {$email}\n");
}
