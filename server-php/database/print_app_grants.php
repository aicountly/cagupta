#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Prints GRANT statements for the PostgreSQL role in DB_USER (.env).
 * Run the output while connected as a superuser / table owner, e.g.:
 *   php database/print_app_grants.php | psql -h ... -U postgres -d ...
 */

(function (): void {
    $envFile = dirname(__DIR__) . '/.env';
    if (!is_readable($envFile)) {
        fwrite(STDERR, "Cannot read .env at {$envFile}\n");
        exit(1);
    }
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        if (!str_contains($line, '=')) {
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
})();

$user = trim((string)(getenv('DB_USER') ?: ''));
if ($user === '') {
    fwrite(STDERR, "DB_USER is not set in .env\n");
    exit(1);
}

$ident = static function (string $name): string {
    return '"' . str_replace('"', '""', $name) . '"';
};

$qUser = $ident($user);

echo "-- Paste into psql (or pipe this file) as a PostgreSQL superuser / owner of the tables.\n";
echo "-- Grants for application role from .env DB_USER = {$user}\n\n";
echo "GRANT USAGE ON SCHEMA public TO {$qUser};\n";
echo "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {$qUser};\n";
echo "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {$qUser};\n";
