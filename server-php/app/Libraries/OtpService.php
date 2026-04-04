<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Config\Database;

/**
 * OtpService — generate, store, and verify one-time passwords.
 *
 * OTPs are:
 *  - 6 digits, zero-padded
 *  - Valid for 10 minutes
 *  - Single-use (marked as used after successful verification)
 *
 * Depends on the `otp_tokens` table (migration 003_create_otp_tokens).
 */
class OtpService
{
    private const EXPIRY_MINUTES = 10;
    private const DIGITS         = 6;

    /**
     * Generate a new OTP for the given user, persist it and return the code.
     *
     * Any existing unused OTPs for this user are invalidated first so that
     * only the most-recently issued code is valid.
     *
     * @throws \RuntimeException if the database insert fails.
     */
    public static function generate(int $userId): string
    {
        $db  = Database::getConnection();
        $otp = str_pad((string)random_int(0, 999999), self::DIGITS, '0', STR_PAD_LEFT);
        $exp = (new \DateTimeImmutable())
            ->modify('+' . self::EXPIRY_MINUTES . ' minutes')
            ->format('Y-m-d H:i:sO');

        // Invalidate previous unused OTPs for this user
        $db->prepare('UPDATE otp_tokens SET used = TRUE WHERE user_id = :uid AND used = FALSE')
           ->execute([':uid' => $userId]);

        $db->prepare(
            'INSERT INTO otp_tokens (user_id, otp_code, expires_at, used)
             VALUES (:uid, :code, :exp, FALSE)'
        )->execute([':uid' => $userId, ':code' => $otp, ':exp' => $exp]);

        return $otp;
    }

    /**
     * Verify an OTP for the given user.
     *
     * Returns TRUE and marks the token as used if the OTP is valid and
     * not yet expired. Returns FALSE for any invalid/expired/used code.
     */
    public static function verify(int $userId, string $otp): bool
    {
        $db   = Database::getConnection();
        $stmt = $db->prepare(
            'SELECT id FROM otp_tokens
             WHERE user_id = :uid
               AND otp_code = :code
               AND used = FALSE
               AND expires_at > NOW()
             ORDER BY id DESC
             LIMIT 1'
        );
        $stmt->execute([':uid' => $userId, ':code' => $otp]);
        $row = $stmt->fetch();

        if ($row === false) {
            return false;
        }

        // Mark as used so it cannot be replayed
        $db->prepare('UPDATE otp_tokens SET used = TRUE WHERE id = :id')
           ->execute([':id' => (int)$row['id']]);

        return true;
    }

    /**
     * Return the OTP validity window in minutes (for display in emails).
     */
    public static function expiryMinutes(): int
    {
        return self::EXPIRY_MINUTES;
    }
}
