<?php
declare(strict_types=1);

/**
 * CLI migration runner — applies pending SQL migrations in order.
 *
 * Usage (from repo root or server-php/ directory):
 *   php database/migrate.php [--dry-run]
 *
 * Reads .env from the same directory as public/ (one level up from database/).
 * Tracks applied migrations in the `schema_migrations` table.
 */

// ── Load .env ─────────────────────────────────────────────────────────────────
$envFile = dirname(__DIR__) . '/.env';
if (is_readable($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
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
        // getenv() checks the real process environment, not just $_ENV,
        // so variables set in the shell (e.g. from CI secrets) take precedence.
        if ($key !== '' && getenv($key) === false) {
            putenv("{$key}={$value}");
            $_ENV[$key] = $value;
        }
    }
}

$dryRun = in_array('--dry-run', $argv ?? [], true);

// ── Connect ───────────────────────────────────────────────────────────────────
// On cPanel, DB_USER is the restricted app user (non-owner). Migrations that
// run ALTER TABLE require the table owner. Set MIGRATION_DB_USER /
// MIGRATION_DB_PASS in .env to the owner role (e.g. the phpPgAdmin default
// user) and migrate.php will use those credentials only for migrations while
// the application continues to use DB_USER for all runtime connections.
$host   = getenv('DB_HOST') ?: 'localhost';
$port   = (int)(getenv('DB_PORT') ?: 5432);
$dbname = getenv('DB_NAME') ?: 'cagupta_db';
$user   = getenv('MIGRATION_DB_USER') ?: (getenv('DB_USER') ?: 'postgres');
$pass   = getenv('MIGRATION_DB_PASS') !== false && getenv('MIGRATION_DB_PASS') !== ''
    ? getenv('MIGRATION_DB_PASS')
    : (getenv('DB_PASS') ?: '');

$usingMigrationUser = getenv('MIGRATION_DB_USER') !== false && getenv('MIGRATION_DB_USER') !== '';
if ($usingMigrationUser) {
    echo "ℹ️  Using MIGRATION_DB_USER ({$user}) for DDL ownership.\n";
}

try {
    $pdo = new PDO(
        "pgsql:host={$host};port={$port};dbname={$dbname}",
        $user,
        $pass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    fwrite(STDERR, "❌ DB connection failed: " . $e->getMessage() . "\n");
    exit(1);
}

// ── Ensure schema_migrations table exists ─────────────────────────────────────
$pdo->exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (
        version    VARCHAR(200) PRIMARY KEY,
        applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )"
);

// ── Collect applied versions ──────────────────────────────────────────────────
$applied = [];
foreach ($pdo->query("SELECT version FROM schema_migrations ORDER BY version") as $row) {
    $applied[$row['version']] = true;
}

// ── Discover migration files ──────────────────────────────────────────────────
$migrationsDir = __DIR__ . '/migrations';
$files = glob($migrationsDir . '/*.sql');
if ($files === false || count($files) === 0) {
    echo "ℹ️  No migration files found in {$migrationsDir}\n";
    exit(0);
}
sort($files);

// ── Apply pending migrations ──────────────────────────────────────────────────
$pendingCount = 0;
$appliedCount = 0;
$errorCount   = 0;

foreach ($files as $file) {
    $version = pathinfo($file, PATHINFO_FILENAME);

    if (isset($applied[$version])) {
        continue;
    }

    $pendingCount++;
    $sql = file_get_contents($file);
    if ($sql === false || trim($sql) === '') {
        echo "⚠️  Skipping empty file: {$version}\n";
        continue;
    }

    if ($dryRun) {
        echo "[dry-run] Would apply: {$version}\n";
        continue;
    }

    echo "  → Applying {$version} … ";
    try {
        $pdo->exec($sql);
        echo "✅\n";
        $appliedCount++;
    } catch (PDOException $e) {
        echo "❌\n";
        fwrite(STDERR, "     Error: " . $e->getMessage() . "\n");
        $errorCount++;
        // Continue to attempt remaining migrations rather than aborting.
    }
}

if ($pendingCount === 0) {
    echo "✅ All migrations are up to date.\n";
} elseif ($dryRun) {
    echo "ℹ️  {$pendingCount} migration(s) would be applied (dry-run).\n";
} else {
    echo "✅ Applied {$appliedCount}/{$pendingCount} migration(s)";
    if ($errorCount > 0) {
        echo " ({$errorCount} error(s))";
    }
    echo ".\n";
}

exit($errorCount > 0 ? 1 : 0);
