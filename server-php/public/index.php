<?php
declare(strict_types=1);

/**
 * Front Controller — CA Gupta Office Portal PHP API
 *
 * Routes all /api/* requests to the correct Controller@method.
 * No Composer required — works on standard CPN shared hosting (PHP 8.1+).
 */

// ── Load .env ─────────────────────────────────────────────────────────────────
(function () {
    $envFile = dirname(__DIR__) . '/.env';
    if (!is_readable($envFile)) {
        return;
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
        // Strip surrounding quotes
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

// ── PSR-4 autoloader (no Composer) ────────────────────────────────────────────
spl_autoload_register(function (string $class): void {
    $prefix = 'App\\';
    $base   = dirname(__DIR__) . '/app/';

    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $relative = substr($class, strlen($prefix));
    $file     = $base . str_replace('\\', '/', $relative) . '.php';

    if (is_file($file)) {
        require_once $file;
    }
});

// ── Load helpers ──────────────────────────────────────────────────────────────
require_once dirname(__DIR__) . '/app/Helpers/response_helper.php';

use App\Config\App as AppConfig;
use App\Config\Routes;
use App\Filters\AuthFilter;
use App\Filters\RoleFilter;

use function App\Helpers\api_error;

// ── Set timezone ──────────────────────────────────────────────────────────────
$appConfig = new AppConfig();
date_default_timezone_set($appConfig->timezone);

// ── CORS headers ──────────────────────────────────────────────────────────────
$origin         = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigin  = $appConfig->corsOrigin;

// Allow the configured origin or (in dev) any localhost origin
if ($origin === $allowedOrigin || (str_starts_with($origin, 'http://localhost') && $appConfig->environment === 'development')) {
    header("Access-Control-Allow-Origin: {$origin}");
} else {
    header("Access-Control-Allow-Origin: {$allowedOrigin}");
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

// Handle OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Route dispatching ─────────────────────────────────────────────────────────
$requestMethod = strtoupper($_SERVER['REQUEST_METHOD']);
$requestUri    = strtok($_SERVER['REQUEST_URI'], '?');
// Strip base path if the app is in a subdirectory
$scriptDir = dirname($_SERVER['SCRIPT_NAME']);
if ($scriptDir !== '/' && str_starts_with($requestUri, $scriptDir)) {
    $requestUri = substr($requestUri, strlen($scriptDir));
}
$requestUri = '/' . ltrim($requestUri, '/');

$routes  = Routes::getRoutes();
$matched = false;

foreach ($routes as $route) {
    if ($route['method'] !== $requestMethod) {
        continue;
    }

    // Build regex from pattern (e.g. /api/admin/users/:id → /api/admin/users/(\d+))
    $pattern = preg_replace('/\/:id/', '/(\d+)', $route['pattern']);
    $pattern = preg_replace('/\/:slug/', '/([a-zA-Z0-9\-]+)', $pattern);
    $regex   = '#^' . $pattern . '$#';

    if (!preg_match($regex, $requestUri, $matches)) {
        continue;
    }

    $matched = true;

    // Extract path parameters (numeric ids etc.)
    array_shift($matches); // remove full match

    // ── Run middleware ────────────────────────────────────────────────────────
    foreach ($route['middleware'] as $mw) {
        if ($mw === 'auth') {
            (new AuthFilter())->handle();
        } elseif (str_starts_with($mw, 'role:')) {
            $allowedRoles = explode(',', substr($mw, 5));
            (new RoleFilter($allowedRoles))->handle();
        }
    }

    // ── Dispatch to controller ────────────────────────────────────────────────
    [$controllerPath, $method] = explode('@', $route['handler']);
    $controllerClass = 'App\\Controllers\\' . str_replace('/', '\\', $controllerPath);

    if (!class_exists($controllerClass)) {
        api_error("Controller not found: {$controllerClass}", 500);
    }

    $controller = new $controllerClass();

    if (!method_exists($controller, $method)) {
        api_error("Method {$method} not found on {$controllerClass}", 500);
    }

    // Cast path params to int where appropriate
    $params = array_map(fn($p) => ctype_digit($p) ? (int)$p : $p, $matches);

    $controller->$method(...$params);
    break;
}

if (!$matched) {
    api_error("Route not found: {$requestMethod} {$requestUri}", 404);
}
