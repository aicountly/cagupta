<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Config\Auth as AuthConfig;

use function App\Helpers\api_success;
use function App\Helpers\api_error;

/**
 * BaseController
 *
 * Shared helpers for all controllers:
 *  - JSON input parsing
 *  - Auth user access
 *  - Standardised response shortcuts
 */
abstract class BaseController
{
    /**
     * Return the authenticated user injected by AuthFilter, or null.
     *
     * @return array<string, mixed>|null
     */
    protected function authUser(): ?array
    {
        return $GLOBALS['auth_user'] ?? null;
    }

    /**
     * Return the raw Bearer token injected by AuthFilter.
     */
    protected function authToken(): string
    {
        return $GLOBALS['auth_token'] ?? '';
    }

    /**
     * Parse the request body as JSON.
     *
     * @return array<string, mixed>
     */
    protected function getJsonBody(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            return [];
        }
        try {
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            return is_array($data) ? $data : [];
        } catch (\JsonException) {
            return [];
        }
    }

    /**
     * Return a query parameter value (GET / query string).
     */
    protected function query(string $key, mixed $default = null): mixed
    {
        return $_GET[$key] ?? $default;
    }

    /**
     * Shortcut — send a success response.
     *
     * @param mixed                $data
     * @param array<string, mixed> $meta
     */
    protected function success(mixed $data = null, string $message = 'OK', int $status = 200, array $meta = []): never
    {
        api_success($data, $message, $status, $meta);
    }

    /**
     * Shortcut — send an error response.
     *
     * @param array<string, string[]> $errors
     */
    protected function error(string $message, int $status = 400, array $errors = []): never
    {
        api_error($message, $status, $errors);
    }

    /**
     * Return true when the acting user is the hardcoded super admin.
     */
    protected function isSuperAdminEmail(string $email): bool
    {
        return strtolower($email) === strtolower(AuthConfig::SUPER_ADMIN_EMAIL);
    }
}
