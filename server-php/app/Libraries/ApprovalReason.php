<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Validation for request-side approval reasons (Team Approvals queue submissions).
 */
final class ApprovalReason
{
    public const ERROR_MESSAGE = 'request_reason is required.';

    public const OVERFLOW_NOTES_MESSAGE = 'notes is required for overflow approval requests.';

    /**
     * Returns trimmed reason or null when empty.
     */
    public static function normalize(?string $reason): ?string
    {
        $trimmed = trim((string)$reason);

        return $trimmed !== '' ? $trimmed : null;
    }

    /**
     * @return string|null Error message when invalid; null when valid.
     */
    public static function validateRequestReason(?string $reason): ?string
    {
        return self::normalize($reason) === null ? self::ERROR_MESSAGE : null;
    }

    /**
     * @return string|null Error message when invalid; null when valid.
     */
    public static function validateOverflowNotes(?string $notes): ?string
    {
        return self::normalize($notes) === null ? self::OVERFLOW_NOTES_MESSAGE : null;
    }

    /**
     * @throws \InvalidArgumentException
     */
    public static function requireRequestReason(?string $reason): string
    {
        $normalized = self::normalize($reason);
        if ($normalized === null) {
            throw new \InvalidArgumentException(self::ERROR_MESSAGE);
        }

        return $normalized;
    }
}
