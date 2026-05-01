<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

class ZoomOAuthTokenModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /** @return array<string, mixed>|null */
    public function findByUserId(int $userId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM zoom_oauth_tokens WHERE user_id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /** @param array<string, mixed> $data */
    public function upsert(int $userId, array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO zoom_oauth_tokens (
                user_id, access_token, refresh_token, expires_at, scope, account_id, updated_at
             ) VALUES (
                :user_id, :access_token, :refresh_token, :expires_at, :scope, :account_id, NOW()
             )
             ON CONFLICT (user_id) DO UPDATE SET
                access_token  = EXCLUDED.access_token,
                refresh_token = EXCLUDED.refresh_token,
                expires_at    = EXCLUDED.expires_at,
                scope         = EXCLUDED.scope,
                account_id    = EXCLUDED.account_id,
                updated_at    = NOW()'
        );
        $stmt->execute([
            ':user_id'        => $userId,
            ':access_token'   => $data['access_token'],
            ':refresh_token'  => $data['refresh_token'],
            ':expires_at'     => $data['expires_at'],
            ':scope'          => $data['scope'] ?? null,
            ':account_id'     => $data['account_id'] ?? null,
        ]);
    }
}
