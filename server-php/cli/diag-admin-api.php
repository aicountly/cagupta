<?php
declare(strict_types=1);

/**
 * Diagnose GET /api/admin/roles and /api/admin/users failures.
 *
 * Do NOT open this file in a browser — you will be redirected to the dashboard.
 *
 * Run on the server via SSH only:
 *   php ~/public_html/api/cli/diag-admin-api.php
 *
 * Or use the HTTP diagnostic (after deploy):
 *   https://carahulgupta.in/api/system/diag
 */

$root = dirname(__DIR__);
require_once $root . '/app/Helpers/response_helper.php';

// Load .env (same as public/index.php)
$envFile = $root . '/.env';
if (is_readable($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key   = trim($key);
        $value = trim($value, " \t\"'");
        if ($key !== '' && getenv($key) === false) {
            putenv("{$key}={$value}");
            $_ENV[$key] = $value;
        }
    }
}

spl_autoload_register(static function (string $class) use ($root): void {
    $prefix = 'App\\';
    $base   = $root . '/app/';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $relPath  = str_replace('\\', '/', $relative) . '.php';
    $file     = $base . $relPath;
    if (is_file($file)) {
        require_once $file;
        return;
    }
    $className  = basename($relPath, '.php');
    $modulesDir = $base . 'Modules/';
    if (!is_dir($modulesDir)) {
        return;
    }
    $candidates = [];
    foreach (scandir($modulesDir) as $module) {
        if ($module[0] === '.') {
            continue;
        }
        foreach (['Controllers', 'Models'] as $subDir) {
            $candidate = $modulesDir . $module . '/' . $subDir . '/' . $className . '.php';
            if (is_file($candidate)) {
                $candidates[] = $candidate;
            }
        }
    }
    if (count($candidates) === 1) {
        require_once $candidates[0];
        return;
    }
    $fqcn = 'App\\' . $relative;
    foreach ($candidates as $candidate) {
        $header = file_get_contents($candidate, false, null, 0, 512);
        if ($header !== false && preg_match('/namespace\s+([^;]+);/', $header, $m)) {
            $fileNs = $m[1] . '\\' . $className;
            if ($fileNs === $fqcn) {
                require_once $candidate;
                return;
            }
        }
    }
    if ($candidates !== []) {
        require_once $candidates[0];
    }
});

use App\Config\Database;
use App\Models\RoleModel;
use App\Models\UserModel;

echo "=== Admin API diagnostics ===\n";
echo 'PHP version: ' . PHP_VERSION . "\n";
echo 'APP_ENV: ' . (getenv('APP_ENV') ?: '(unset)') . "\n\n";

$flags = JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR;

try {
    $db = Database::getConnection();
    echo "DB connection: OK\n\n";
} catch (Throwable $e) {
    echo "DB connection: FAIL — {$e->getMessage()}\n";
    exit(1);
}

// Roles (same as RoleModel::all)
echo "--- roles (SELECT * FROM roles) ---\n";
try {
    $roles = (new RoleModel())->all();
    echo 'Row count: ' . count($roles) . "\n";
    $json = json_encode(['success' => true, 'data' => $roles], $flags);
    echo 'json_encode(roles): OK (' . strlen($json) . " bytes)\n";
} catch (Throwable $e) {
    echo 'roles FAIL — ' . $e::class . ': ' . $e->getMessage() . "\n";
    if (!empty($roles)) {
        foreach ($roles as $i => $row) {
            echo "  role index {$i} name=" . ($row['name'] ?? '?') . ' permissions_type=' . gettype($row['permissions'] ?? null) . "\n";
        }
    }
}

echo "\n--- users paginate (page 1, per_page 20) ---\n";
try {
    $result = (new UserModel())->paginate(1, 20, '', '', '', 0);
    echo 'Total users: ' . $result['total'] . "\n";
    $json = json_encode(['success' => true, 'data' => $result['users']], $flags);
    echo 'json_encode(users): OK (' . strlen($json) . " bytes)\n";
} catch (Throwable $e) {
    echo 'users FAIL — ' . $e::class . ': ' . $e->getMessage() . "\n";
}

echo "\n--- UserController load ---\n";
try {
    if (!class_exists(\App\Controllers\Admin\UserController::class)) {
        echo "UserController class: NOT FOUND\n";
    } else {
        echo "UserController class: OK\n";
        $ref = new ReflectionClass(\App\Controllers\Admin\UserController::class);
        echo 'roles() at line: ' . $ref->getMethod('roles')->getStartLine() . "\n";
    }
} catch (Throwable $e) {
    echo 'UserController FAIL — ' . $e::class . ': ' . $e->getMessage() . "\n";
}

echo "\nDone. If roles/users json_encode failed above, fix that data or encoding.\n";
echo "Also check: " . dirname($root) . "/debug-441a9d.log (API uncaught exceptions)\n";
