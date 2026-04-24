<?php
declare(strict_types=1);

/**
 * send-digest.php — Superadmin daily activity digest sender.
 *
 * Reads yesterday's rows from `superadmin_digest_queue`, builds one
 * consolidated HTML email, sends it via Brevo, and deletes the processed rows.
 *
 * Designed to be executed by a cPanel cron job once per day, e.g.:
 *   30 17 * * *  php /home/<user>/public_html/api/cli/send-digest.php \
 *                    >> /home/<user>/logs/digest.log 2>&1
 *
 * Usage:
 *   php cli/send-digest.php            # digest for yesterday (default)
 *   php cli/send-digest.php 2026-04-23 # digest for a specific date (YYYY-MM-DD)
 *   php cli/send-digest.php --dry-run  # print HTML to stdout; do NOT send or delete
 */

// ── Bootstrap ──────────────────────────────────────────────────────────────────

$scriptDir  = dirname(__DIR__);   // server-php/
$envFile    = $scriptDir . '/.env';

// Load .env (same parser as public/index.php — no Composer required)
if (is_readable($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key   = trim($key);
        $value = trim($value);
        if (preg_match('/^(["\'])(.*)\\1$/', $value, $m)) {
            $value = $m[2];
        }
        if ($key !== '' && !array_key_exists($key, $_ENV)) {
            putenv("{$key}={$value}");
            $_ENV[$key]    = $value;
            $_SERVER[$key] = $value;
        }
    }
}

// Autoload only the classes we need (no Composer)
require_once $scriptDir . '/app/Config/Database.php';
require_once $scriptDir . '/app/Libraries/BrevoMailer.php';

use App\Config\Database;
use App\Libraries\BrevoMailer;

// ── Arguments ──────────────────────────────────────────────────────────────────

$dryRun     = false;
$targetDate = null;   // 'YYYY-MM-DD'

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

$digestLabel = date('d M Y', (int)strtotime($targetDate));   // e.g. "23 Apr 2026"

// ── Fetch rows ─────────────────────────────────────────────────────────────────

try {
    $pdo = Database::getConnection();
} catch (\Throwable $e) {
    fwrite(STDERR, '[send-digest] DB connection failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

$stmt = $pdo->prepare(
    'SELECT id, entity_type, display_name, action_label, status,
            actor_name, actor_email, occurred_at
     FROM   superadmin_digest_queue
     WHERE  digest_date = :date
     ORDER  BY entity_type, occurred_at'
);
$stmt->execute([':date' => $targetDate]);
$rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

if (empty($rows)) {
    echo "[send-digest] No events for {$targetDate} — skipping." . PHP_EOL;
    exit(0);
}

// ── Build HTML sections ────────────────────────────────────────────────────────

/**
 * Return a CSS class for the action badge based on the action label.
 */
function actionBadgeClass(string $action): string
{
    $lower = strtolower($action);
    if (str_starts_with($lower, 'creat')) {
        return 'badge-created';
    }
    if (str_starts_with($lower, 'updat')) {
        return 'badge-updated';
    }
    if (str_starts_with($lower, 'delet')) {
        return 'badge-deleted';
    }
    if (str_starts_with($lower, 'status')) {
        return 'badge-status';
    }
    return 'badge-default';
}

/**
 * Return a CSS class for the status value.
 */
function statusClass(string $status): string
{
    return strtolower($status) === 'active' ? 'status-active' : 'status-inactive';
}

/**
 * Render HTML table rows for a list of queue entries.
 *
 * @param array<int, array<string, mixed>> $entries
 */
function renderTableRows(array $entries): string
{
    $html = '';
    foreach ($entries as $row) {
        $action      = htmlspecialchars((string)$row['action_label'], ENT_QUOTES, 'UTF-8');
        $name        = htmlspecialchars((string)$row['display_name'],  ENT_QUOTES, 'UTF-8');
        $status      = htmlspecialchars((string)$row['status'],        ENT_QUOTES, 'UTF-8');
        $actorName   = htmlspecialchars((string)$row['actor_name'],    ENT_QUOTES, 'UTF-8');
        $actorEmail  = htmlspecialchars((string)$row['actor_email'],   ENT_QUOTES, 'UTF-8');
        $time        = date('h:i A', strtotime((string)$row['occurred_at']));

        $badgeClass  = actionBadgeClass($action);
        $statusCls   = statusClass($status);

        $html .= "<tr>"
            . "<td>{$name}</td>"
            . "<td><span class=\"badge {$badgeClass}\">{$action}</span></td>"
            . "<td><span class=\"{$statusCls}\">{$status}</span></td>"
            . "<td>{$actorName}<br><small style=\"color:#94a3b8\">{$actorEmail}</small></td>"
            . "<td>{$time}</td>"
            . "</tr>\n";
    }
    return $html;
}

$tableHeader = "<table>"
    . "<thead><tr>"
    . "<th>Name</th><th>Action</th><th>Status</th><th>Performed By</th><th>Time (IST)</th>"
    . "</tr></thead><tbody>";
$tableFooter = "</tbody></table>";

// Split rows by entity_type
$contactRows = array_values(array_filter($rows, fn($r) => $r['entity_type'] === 'contact'));
$orgRows     = array_values(array_filter($rows, fn($r) => $r['entity_type'] === 'organization'));

// Build contact section HTML
$contactSection = '';
if (!empty($contactRows)) {
    $contactSection = "<div class=\"section-title\">Contacts (" . count($contactRows) . ")</div>"
        . $tableHeader
        . renderTableRows($contactRows)
        . $tableFooter;
}

// Build organization section HTML
$orgSection = '';
if (!empty($orgRows)) {
    $orgSection = "<div class=\"section-title\">Organizations (" . count($orgRows) . ")</div>"
        . $tableHeader
        . renderTableRows($orgRows)
        . $tableFooter;
}

// ── Render full template ───────────────────────────────────────────────────────

$htmlBody = BrevoMailer::renderTemplate('superadmin-daily-digest', [
    'digestDate'     => $digestLabel,
    'totalEvents'    => (string)count($rows),
    'contactSection' => $contactSection,
    'orgSection'     => $orgSection,
]);

if ($htmlBody === '') {
    fwrite(STDERR, '[send-digest] Template render failed — aborting.' . PHP_EOL);
    exit(1);
}

// ── Dry-run mode ───────────────────────────────────────────────────────────────

if ($dryRun) {
    echo $htmlBody . PHP_EOL;
    echo PHP_EOL . '[send-digest] DRY RUN — email NOT sent, rows NOT deleted.' . PHP_EOL;
    exit(0);
}

// ── Send email ─────────────────────────────────────────────────────────────────

$superadminEmail = (string)(getenv('SUPERADMIN_NOTIFY_EMAIL') ?: 'office@carahulgupta.in');
$subject         = "Daily Activity Digest ({$digestLabel}) — CA Rahul Gupta";

$sent = BrevoMailer::send($superadminEmail, 'CA Rahul Gupta', $subject, $htmlBody);

if (!$sent) {
    fwrite(STDERR, '[send-digest] Failed to send digest email — rows NOT deleted.' . PHP_EOL);
    exit(1);
}

// ── Delete processed rows ──────────────────────────────────────────────────────

$del = $pdo->prepare('DELETE FROM superadmin_digest_queue WHERE digest_date = :date');
$del->execute([':date' => $targetDate]);
$deleted = $del->rowCount();

echo "[send-digest] Sent digest for {$digestLabel} ({$deleted} events cleared)." . PHP_EOL;
exit(0);
