<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Config\Auth as AuthConfig;
use App\Libraries\OtpService;
use App\Models\UserModel;

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
     * @param mixed                   $data   Optional structured payload (e.g. duplicate conflict details).
     */
    protected function error(string $message, int $status = 400, array $errors = [], mixed $data = null): never
    {
        api_error($message, $status, $errors, $data);
    }

    /**
     * Return true when the acting user is the hardcoded super admin.
     */
    protected function isSuperAdminEmail(string $email): bool
    {
        return strtolower($email) !== '' && AuthConfig::isSuperAdminEmail($email);
    }

    /**
     * Superadmin invoice/service OTP header (see TxnController, ServiceController).
     */
    protected function readSuperadminOtpFromRequest(): string
    {
        $h = $_SERVER['HTTP_X_SUPERADMIN_OTP'] ?? '';
        if (is_string($h) && trim($h) !== '') {
            return trim($h);
        }

        return '';
    }

    protected function verifySuperadminOtp(string $otp): bool
    {
        if ($otp === '') {
            return false;
        }
        $users = new UserModel();
        $super = $users->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
        if ($super === null) {
            return false;
        }

        return OtpService::verify((int)$super['id'], $otp);
    }

    /**
     * @param array<string, mixed>|null $actor
     */
    protected function userHasManageAll(?array $actor): bool
    {
        if ($actor === null) {
            return false;
        }
        if ($this->isSuperAdminEmail((string)($actor['email'] ?? ''))) {
            return true;
        }
        $list = $actor['role_permissions_array'] ?? [];
        if (!is_array($list)) {
            return false;
        }

        return in_array('users.manage', $list, true) || in_array('*', $list, true);
    }

    /**
     * Resolve list/report visibility from optional user_id query (empty | numeric | "all").
     *
     * @return array{0: int, 1: bool, 2: bool, 3: ?int, 4: bool}
     *         [actorUserId, isPrimarySuperAdmin, canViewTeam, scopeUserId, scopeAll]
     */
    protected function resolveServiceVisibilityContext(?string $userIdRaw = null): array
    {
        $actor = $this->authUser();
        $actorUserId = $actor ? (int)($actor['id'] ?? 0) : 0;
        if ($actorUserId <= 0) {
            $this->error('Unauthorized.', 401);
        }

        $isPrimarySuperAdmin = $this->isSuperAdminEmail((string)($actor['email'] ?? ''));
        $canViewTeam = $this->userHasManageAll($actor);

        $raw = $userIdRaw !== null ? trim($userIdRaw) : '';
        $scopeAll = strtolower($raw) === 'all';
        $scopeUserId = null;

        if ($raw !== '' && !$scopeAll) {
            if (!ctype_digit($raw) || (int)$raw <= 0) {
                $this->error('Invalid user_id.', 422);
            }
            $requestedId = (int)$raw;
            if (!$canViewTeam && !$isPrimarySuperAdmin) {
                if ($requestedId !== $actorUserId) {
                    $this->error('You do not have permission to view other users\' data.', 403);
                }
            }
            $scopeUserId = $requestedId;
        } elseif ($scopeAll && !$canViewTeam && !$isPrimarySuperAdmin) {
            $this->error('You do not have permission to view all users\' data.', 403);
        }

        return [$actorUserId, $isPrimarySuperAdmin, $canViewTeam, $scopeUserId, $scopeAll];
    }

    /**
     * Effective time-entry user filter for reports (null = all users in range).
     */
    protected function resolveReportUserIdFilter(
        int $actorUserId,
        bool $isPrimarySuperAdmin,
        bool $canViewTeam,
        ?int $scopeUserId,
        bool $scopeAll
    ): ?int {
        if ($scopeAll) {
            return null;
        }
        if ($scopeUserId !== null && $scopeUserId > 0) {
            return $scopeUserId;
        }
        if ($isPrimarySuperAdmin) {
            return null;
        }

        return $actorUserId;
    }
}
