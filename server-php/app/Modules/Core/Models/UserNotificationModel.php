<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class UserNotificationModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /** @param array<int> $userIds */
    public function createForUsers(
        array $userIds,
        string $kind,
        string $title,
        string $body = '',
        ?string $entityType = null,
        ?int $entityId = null
    ): void {
        $userIds = array_values(array_unique(array_filter(array_map('intval', $userIds))));
        if ($userIds === []) {
            return;
        }
        $stmt = $this->db->prepare(
            'INSERT INTO user_notifications (user_id, kind, title, body, entity_type, entity_id)
             VALUES (:uid, :kind, :title, :body, :etype, :eid)'
        );
        foreach ($userIds as $uid) {
            $stmt->execute([
                ':uid'   => $uid,
                ':kind'  => $kind,
                ':title' => $title,
                ':body'  => $body,
                ':etype' => $entityType,
                ':eid'   => $entityId,
            ]);
        }
    }

    /** @return array<int, array<string, mixed>> */
    public function listForUser(int $userId, int $limit = 50): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM user_notifications
             WHERE user_id = :uid
             ORDER BY created_at DESC
             LIMIT :lim'
        );
        $stmt->bindValue(':uid', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':lim', max(1, min(200, $limit)), PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function markRead(int $userId, array $notificationIds): void
    {
        $notificationIds = array_values(array_unique(array_filter(array_map('intval', $notificationIds))));
        if ($notificationIds === []) {
            return;
        }
        $upd = $this->db->prepare(
            'UPDATE user_notifications SET read_at = NOW()
             WHERE id = :id AND user_id = :uid AND read_at IS NULL'
        );
        foreach ($notificationIds as $nid) {
            $upd->execute([':id' => $nid, ':uid' => $userId]);
        }
    }

    public function markAllRead(int $userId): void
    {
        $this->db->prepare(
            'UPDATE user_notifications SET read_at = NOW()
             WHERE user_id = :uid AND read_at IS NULL'
        )->execute([':uid' => $userId]);
    }

    /** Mark unread notifications for all users matching kind + entity (e.g. pending Team Approvals). */
    public function markReadByEntity(string $kind, string $entityType, int $entityId): void
    {
        if ($entityId <= 0 || $kind === '' || $entityType === '') {
            return;
        }
        $this->db->prepare(
            'UPDATE user_notifications SET read_at = NOW()
             WHERE kind = :kind AND entity_type = :etype AND entity_id = :eid AND read_at IS NULL'
        )->execute([
            ':kind'  => $kind,
            ':etype' => $entityType,
            ':eid'   => $entityId,
        ]);
    }

    public function countUnread(int $userId): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) FROM user_notifications WHERE user_id = :uid AND read_at IS NULL'
        );
        $stmt->execute([':uid' => $userId]);
        return (int)$stmt->fetchColumn();
    }
}
