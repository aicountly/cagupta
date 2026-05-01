<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * CalendarSyncAccountModel — one row per external calendar the user has
 * opted-in to sync (a single Google account may have many calendars).
 */
class CalendarSyncAccountModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Return all sync accounts for a user.
     *
     * @return array<int, array<string, mixed>>
     */
    public function findAllByUser(int $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM calendar_sync_accounts
              WHERE user_id = :uid
              ORDER BY provider, provider_email, calendar_name'
        );
        $stmt->execute([':uid' => $userId]);

        return $stmt->fetchAll() ?: [];
    }

    /**
     * Return all enabled (and active) sync accounts for a user.
     *
     * @return array<int, array<string, mixed>>
     */
    public function findEnabledByUser(int $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM calendar_sync_accounts
              WHERE user_id = :uid AND is_active = TRUE AND sync_enabled = TRUE
              ORDER BY provider, provider_email'
        );
        $stmt->execute([':uid' => $userId]);

        return $stmt->fetchAll() ?: [];
    }

    /**
     * Find by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function findById(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM calendar_sync_accounts WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * Find a specific calendar row.
     *
     * @return array<string, mixed>|null
     */
    public function findByKey(int $userId, string $provider, string $providerEmail, string $calendarId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM calendar_sync_accounts
              WHERE user_id = :uid AND provider = :provider
                AND provider_email = :email AND calendar_id = :cid
              LIMIT 1'
        );
        $stmt->execute([
            ':uid'      => $userId,
            ':provider' => $provider,
            ':email'    => $providerEmail,
            ':cid'      => $calendarId,
        ]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * Insert or update a sync account row.
     *
     * @param array<string, mixed> $data
     */
    public function upsert(int $userId, string $provider, string $providerEmail, string $calendarId, array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO calendar_sync_accounts
                (user_id, provider, provider_email, calendar_id, calendar_name,
                 is_active, sync_enabled, sync_direction, updated_at)
             VALUES
                (:user_id, :provider, :provider_email, :calendar_id, :calendar_name,
                 :is_active, :sync_enabled, :sync_direction, NOW())
             ON CONFLICT (user_id, provider, provider_email, calendar_id) DO UPDATE SET
                calendar_name  = EXCLUDED.calendar_name,
                is_active      = EXCLUDED.is_active,
                sync_enabled   = EXCLUDED.sync_enabled,
                sync_direction = EXCLUDED.sync_direction,
                updated_at     = NOW()
             RETURNING id'
        );
        $stmt->execute([
            ':user_id'        => $userId,
            ':provider'       => $provider,
            ':provider_email' => $providerEmail,
            ':calendar_id'    => $calendarId,
            ':calendar_name'  => $data['calendar_name'] ?? null,
            ':is_active'      => isset($data['is_active']) ? (bool)$data['is_active'] : true,
            ':sync_enabled'   => isset($data['sync_enabled']) ? (bool)$data['sync_enabled'] : true,
            ':sync_direction' => $data['sync_direction'] ?? 'two_way',
        ]);

        return (int)$this->db->lastInsertId();
    }

    /**
     * Patch mutable fields on an existing sync account.
     *
     * @param array<string, mixed> $patch
     */
    public function update(int $id, array $patch): void
    {
        $allowed = ['calendar_name', 'is_active', 'sync_enabled', 'sync_direction', 'last_synced_at'];
        $sets    = [];
        $params  = [':id' => $id];

        foreach ($allowed as $col) {
            if (array_key_exists($col, $patch)) {
                $sets[]          = "{$col} = :{$col}";
                $params[":{$col}"] = $patch[$col];
            }
        }
        if ($sets === []) {
            return;
        }
        $sets[] = 'updated_at = NOW()';

        $sql = 'UPDATE calendar_sync_accounts SET ' . implode(', ', $sets) . ' WHERE id = :id';
        $this->db->prepare($sql)->execute($params);
    }

    /**
     * Delete a sync account by ID, optionally verifying user ownership.
     */
    public function delete(int $id, ?int $userId = null): void
    {
        if ($userId !== null) {
            $stmt = $this->db->prepare(
                'DELETE FROM calendar_sync_accounts WHERE id = :id AND user_id = :uid'
            );
            $stmt->execute([':id' => $id, ':uid' => $userId]);
        } else {
            $this->db->prepare('DELETE FROM calendar_sync_accounts WHERE id = :id')
                     ->execute([':id' => $id]);
        }
    }

    /**
     * Delete all sync accounts for a user + provider + email combination.
     */
    public function deleteByProviderEmail(int $userId, string $provider, string $providerEmail): void
    {
        $stmt = $this->db->prepare(
            'DELETE FROM calendar_sync_accounts
              WHERE user_id = :uid AND provider = :provider AND provider_email = :email'
        );
        $stmt->execute([':uid' => $userId, ':provider' => $provider, ':email' => $providerEmail]);
    }
}
