<?php
declare(strict_types=1);

namespace App\Helpers;

/**
 * Global API response helpers.
 *
 * Sends JSON and exits.  Consistent shape for every endpoint:
 *   { success: bool, data: mixed, message: string, errors: array }
 */

if (!function_exists('App\Helpers\api_success')) {
    /**
     * Send a 200 OK JSON response and exit.
     *
     * @param mixed                $data
     * @param array<string, mixed> $meta   Optional extra top-level keys.
     */
    function api_success(mixed $data = null, string $message = 'OK', int $status = 200, array $meta = []): never
    {
        http_response_code($status);
        echo json_encode(array_merge([
            'success' => true,
            'message' => $message,
            'data'    => $data,
            'errors'  => [],
        ], $meta), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
        exit;
    }
}

if (!function_exists('App\Helpers\api_error')) {
    /**
     * Send an error JSON response and exit.
     *
     * @param array<string, string[]> $errors Field-level validation errors.
     */
    function api_error(string $message, int $status = 400, array $errors = []): never
    {
        http_response_code($status);
        echo json_encode([
            'success' => false,
            'message' => $message,
            'data'    => null,
            'errors'  => $errors,
        ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
        exit;
    }
}
