<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * CalendarOAuthTokenModel — stores and retrieves OAuth credentials
 * (or CalDAV app-specific passwords for Apple) per user per provider.
 */
class CalendarOAuthTokenModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Find all tokens for a user (one row per provider+email).
     *
     * @return array<int, array<string, mixed>>
     */
    public function findAllByUser(int $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM calendar_oauth_tokens WHERE user_id = :uid ORDER BY provider, provider_email'
        );
        $stmt->execute([':uid' => $userId]);

        return $stmt->fetchAll() ?: [];
    }

    /**
     * Find a single token row by user + provider + provider email.
     *
     * @return array<string, mixed>|null
     */
    public function findByUserProviderEmail(int $userId, string $provider, string $providerEmail): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM calendar_oauth_tokens
              WHERE user_id = :uid AND provider = :provider AND provider_email = :email
              LIMIT 1'
        );
        $stmt->execute([':uid' => $userId, ':provider' => $provider, ':email' => $providerEmail]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * Find all token rows for a given user + provider (all connected accounts).
     *
     * @return array<int, array<string, mixed>>
     */
    public function findAllByUserProvider(int $userId, string $provider): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM calendar_oauth_tokens WHERE user_id = :uid AND provider = :provider ORDER BY id'
        );
        $stmt->execute([':uid' => $userId, ':provider' => $provider]);

        return $stmt->fetchAll() ?: [];
    }

    /**
     * Insert or update a token row.
     *
     * @param array<string, mixed> $data
     */
    public function upsert(int $userId, string $provider, string $providerEmail, array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO calendar_oauth_tokens
                (user_id, provider, provider_email, access_token, refresh_token,
                 expires_at, scope, raw_profile, updated_at)
             VALUES
                (:user_id, :provider, :provider_email, :access_token, :refresh_token,
                 :expires_at, :scope, :raw_profile, NOW())
             ON CONFLICT (user_id, provider, provider_email) DO UPDATE SET
                access_token   = EXCLUDED.access_token,
                refresh_token  = EXCLUDED.refresh_token,
                expires_at     = EXCLUDED.expires_at,
                scope          = EXCLUDED.scope,
                raw_profile    = EXCLUDED.raw_profile,
                updated_at     = NOW()'
        );
        $stmt->execute([
            ':user_id'        => $userId,
            ':provider'       => $provider,
            ':provider_email' => $providerEmail,
            ':access_token'   => $data['access_token'] ?? null,
            ':refresh_token'  => $data['refresh_token'],
            ':expires_at'     => $data['expires_at'] ?? null,
            ':scope'          => $data['scope'] ?? null,
            ':raw_profile'    => isset($data['raw_profile'])
                ? json_encode($data['raw_profile'], JSON_THROW_ON_ERROR)
                : null,
        ]);
    }

    /**
     * Update just the access token and expiry after a token refresh.
     */
    public function updateAccessToken(
        int $userId,
        string $provider,
        string $providerEmail,
        string $accessToken,
        string $expiresAt
    ): void {
        $stmt = $this->db->prepare(
            'UPDATE calendar_oauth_tokens
                SET access_token = :at, expires_at = :exp, updated_at = NOW()
              WHERE user_id = :uid AND provider = :provider AND provider_email = :email'
        );
        $stmt->execute([
            ':at'       => $accessToken,
            ':exp'      => $expiresAt,
            ':uid'      => $userId,
            ':provider' => $provider,
            ':email'    => $providerEmail,
        ]);
    }

    /**
     * Delete all tokens for a user + provider + optional specific email.
     */
    public function delete(int $userId, string $provider, ?string $providerEmail = null): void
    {
        if ($providerEmail !== null) {
            $stmt = $this->db->prepare(
                'DELETE FROM calendar_oauth_tokens
                  WHERE user_id = :uid AND provider = :provider AND provider_email = :email'
            );
            $stmt->execute([':uid' => $userId, ':provider' => $provider, ':email' => $providerEmail]);
        } else {
            $stmt = $this->db->prepare(
                'DELETE FROM calendar_oauth_tokens WHERE user_id = :uid AND provider = :provider'
            );
            $stmt->execute([':uid' => $userId, ':provider' => $provider]);
        }
    }
}
