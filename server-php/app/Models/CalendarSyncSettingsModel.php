<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * CalendarSyncSettingsModel — one row per user storing global sync preferences.
 */
class CalendarSyncSettingsModel
{
    private PDO $db;

    /** Default settings returned when no row exists yet. */
    private const DEFAULTS = [
        'default_provider'    => null,
        'conflict_resolution' => 'local_wins',
        'auto_sync_enabled'   => true,
    ];

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Return the settings for a user, falling back to defaults if none stored.
     *
     * @return array<string, mixed>
     */
    public function findByUser(int $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM calendar_sync_settings WHERE user_id = :uid LIMIT 1'
        );
        $stmt->execute([':uid' => $userId]);
        $row = $stmt->fetch();

        if (!$row) {
            return array_merge(self::DEFAULTS, ['user_id' => $userId]);
        }

        return $row;
    }

    /**
     * Insert or update settings for a user.
     *
     * @param array<string, mixed> $settings
     */
    public function save(int $userId, array $settings): void
    {
        $provider    = isset($settings['default_provider']) && $settings['default_provider'] !== ''
            ? $settings['default_provider']
            : null;
        $conflict    = $settings['conflict_resolution'] ?? 'local_wins';
        $autoSync    = isset($settings['auto_sync_enabled']) ? (bool)$settings['auto_sync_enabled'] : true;

        $stmt = $this->db->prepare(
            'INSERT INTO calendar_sync_settings
                (user_id, default_provider, conflict_resolution, auto_sync_enabled, updated_at)
             VALUES
                (:uid, :provider, :conflict, :auto_sync, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
                default_provider    = EXCLUDED.default_provider,
                conflict_resolution = EXCLUDED.conflict_resolution,
                auto_sync_enabled   = EXCLUDED.auto_sync_enabled,
                updated_at          = NOW()'
        );
        $stmt->execute([
            ':uid'      => $userId,
            ':provider' => $provider,
            ':conflict' => $conflict,
            ':auto_sync' => $autoSync,
        ]);
    }
}
