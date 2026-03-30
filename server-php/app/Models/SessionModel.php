<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * SessionModel — manage `user_sessions` (token store).
 */
class SessionModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Persist a new session token.
     *
     * @return int  The new session id.
     */
    public function create(int $userId, string $token, \DateTimeImmutable $expiresAt, string $ipAddress = '', string $userAgent = ''): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO user_sessions (user_id, token, ip_address, user_agent, expires_at)
             VALUES (:user_id, :token, :ip_address, :user_agent, :expires_at)
             RETURNING id'
        );
        $stmt->execute([
            ':user_id'    => $userId,
            ':token'      => $token,
            ':ip_address' => $ipAddress ?: null,
            ':user_agent' => $userAgent ?: null,
            ':expires_at' => $expiresAt->format('Y-m-d H:i:sO'),
        ]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Look up a session by token; returns null if missing or expired.
     *
     * @return array<string, mixed>|null
     */
    public function findByToken(string $token): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM user_sessions WHERE token = :token AND expires_at > NOW() LIMIT 1'
        );
        $stmt->execute([':token' => $token]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Delete a session by token (logout).
     */
    public function deleteByToken(string $token): bool
    {
        $stmt = $this->db->prepare('DELETE FROM user_sessions WHERE token = :token');
        return $stmt->execute([':token' => $token]);
    }

    /**
     * Delete all sessions for a given user.
     */
    public function deleteAllForUser(int $userId): bool
    {
        $stmt = $this->db->prepare('DELETE FROM user_sessions WHERE user_id = :user_id');
        return $stmt->execute([':user_id' => $userId]);
    }

    /**
     * Remove expired sessions (housekeeping).
     */
    public function purgeExpired(): int
    {
        $stmt = $this->db->exec('DELETE FROM user_sessions WHERE expires_at <= NOW()');
        return (int)$stmt;
    }
}
