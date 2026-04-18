<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class ClientLoginOtpModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    public function generate(string $identifier, int $length = 6, int $ttlMinutes = 10): string
    {
        $identifier = strtolower(trim($identifier));
        $otp = '';
        for ($i = 0; $i < $length; $i++) {
            $otp .= (string)random_int(0, 9);
        }

        $this->db->prepare(
            "INSERT INTO client_login_otps (login_identifier, otp_code, expires_at, used)
             VALUES (:identifier, :otp, NOW() + (:ttl || ' minutes')::interval, FALSE)"
        )->execute([
            ':identifier' => $identifier,
            ':otp'        => $otp,
            ':ttl'        => (string)$ttlMinutes,
        ]);

        return $otp;
    }

    public function verify(string $identifier, string $otp): bool
    {
        $identifier = strtolower(trim($identifier));
        $stmt = $this->db->prepare(
            "SELECT id
             FROM client_login_otps
             WHERE login_identifier = :identifier
               AND otp_code = :otp
               AND used = FALSE
               AND expires_at > NOW()
             ORDER BY id DESC
             LIMIT 1"
        );
        $stmt->execute([
            ':identifier' => $identifier,
            ':otp'        => trim($otp),
        ]);
        $row = $stmt->fetch();
        if (!$row) {
            return false;
        }

        $this->db->prepare(
            "UPDATE client_login_otps
             SET used = TRUE
             WHERE id = :id"
        )->execute([':id' => (int)$row['id']]);

        return true;
    }
}
