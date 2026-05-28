<?php
declare(strict_types=1);

/**
 * blog_ai_generate.php — Daily AI Blog Draft Generator
 *
 * Uses GPT + DALL-E to create pending rows in blog_ai_drafts.
 *
 * Designed for a daily cron (Windows Task Scheduler / cPanel):
 *   0 6 * * *  php /path/to/server-php/cli/blog_ai_generate.php >> /path/to/logs/blog_ai.log 2>&1
 *
 * Usage:
 *   php cli/blog_ai_generate.php               # standard run
 *   php cli/blog_ai_generate.php --dry-run     # print generated content, don't save
 *   php cli/blog_ai_generate.php --category laws   # only one category
 */

$scriptDir = dirname(__DIR__);

$envFile = $scriptDir . '/.env';
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
            $_ENV[$key] = $_SERVER[$key] = $value;
        }
    }
}

require_once $scriptDir . '/app/Config/Database.php';
require_once $scriptDir . '/app/Libraries/BlogAiGenerator.php';

use App\Config\Database;
use App\Libraries\BlogAiGenerator;

$dryRun       = false;
$onlyCategory = null;
$optionsPerCat = 2;

foreach (array_slice($argv ?? [], 1) as $arg) {
    if ($arg === '--dry-run') {
        $dryRun = true;
    }
    if (str_starts_with($arg, '--category=')) {
        $onlyCategory = substr($arg, 11);
    }
    if (str_starts_with($arg, '--options=')) {
        $optionsPerCat = max(1, (int)substr($arg, 10));
    }
}

try {
    $pdo = Database::getConnection();
} catch (\Throwable $e) {
    fwrite(STDERR, '[blog-ai] DB connection failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

$report = BlogAiGenerator::run([
    'pdo'                   => $pdo,
    'server_php_root'       => $scriptDir,
    'dry_run'               => $dryRun,
    'only_category'         => ($onlyCategory !== null && $onlyCategory !== '') ? $onlyCategory : null,
    'options_per_category'  => $optionsPerCat,
    'require_prior_approvals' => !$dryRun,
]);

if (isset($report['error'])) {
    fwrite(STDERR, '[blog-ai] ' . $report['error'] . PHP_EOL);
    foreach ($report['log'] as $line) {
        fwrite(STDOUT, $line . PHP_EOL);
    }
    exit(1);
}

foreach ($report['log'] as $line) {
    fwrite(STDOUT, $line . PHP_EOL);
}

exit(0);
