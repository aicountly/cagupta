<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class ChatMemberModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    public function isActiveMember(int $conversationId, int $userId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT 1 FROM chat_conversation_members
             WHERE conversation_id = :cid AND user_id = :uid AND left_at IS NULL
             LIMIT 1'
        );
        $stmt->execute([':cid' => $conversationId, ':uid' => $userId]);
        return (bool)$stmt->fetchColumn();
    }

    public function ensureActiveMember(int $conversationId, int $userId): void
    {
        $this->db->prepare(
            'INSERT INTO chat_conversation_members (conversation_id, user_id, joined_at)
             VALUES (:cid, :uid, NOW())
             ON CONFLICT (conversation_id, user_id)
             DO UPDATE SET left_at = NULL, joined_at = COALESCE(chat_conversation_members.joined_at, NOW())'
        )->execute([':cid' => $conversationId, ':uid' => $userId]);
    }

    /** @return array<int, array<string, mixed>> */
    public function listActiveMembers(int $conversationId): array
    {
        $stmt = $this->db->prepare(
            'SELECT m.user_id, m.joined_at, m.last_read_message_id, u.name, u.email, r.name AS role_name
             FROM chat_conversation_members m
             JOIN users u ON u.id = m.user_id
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE m.conversation_id = :cid AND m.left_at IS NULL
             ORDER BY u.name ASC'
        );
        $stmt->execute([':cid' => $conversationId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function markRead(int $conversationId, int $userId, int $messageId): void
    {
        $this->db->prepare(
            'UPDATE chat_conversation_members
             SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), :mid)
             WHERE conversation_id = :cid AND user_id = :uid AND left_at IS NULL'
        )->execute([':mid' => $messageId, ':cid' => $conversationId, ':uid' => $userId]);
    }

    public function totalUnreadForUser(int $userId): int
    {
        $stmt = $this->db->prepare(
            'SELECT COALESCE(SUM(sub.cnt), 0)::int FROM (
                SELECT COUNT(*) AS cnt
                FROM chat_conversation_members m
                JOIN chat_messages msg ON msg.conversation_id = m.conversation_id
                WHERE m.user_id = :uid AND m.left_at IS NULL
                  AND (m.last_read_message_id IS NULL OR msg.id > m.last_read_message_id)
                  AND msg.sender_user_id IS DISTINCT FROM :uid
                GROUP BY m.conversation_id
             ) sub'
        );
        $stmt->execute([':uid' => $userId]);
        return (int)$stmt->fetchColumn();
    }

    /** @param array<int> $userIds */
    public function addMembers(int $conversationId, array $userIds): void
    {
        $userIds = array_values(array_unique(array_filter(array_map('intval', $userIds))));
        $ins = $this->db->prepare(
            'INSERT INTO chat_conversation_members (conversation_id, user_id, joined_at)
             VALUES (:cid, :uid, NOW())
             ON CONFLICT (conversation_id, user_id)
             DO UPDATE SET left_at = NULL, joined_at = NOW()'
        );
        foreach ($userIds as $uid) {
            $ins->execute([':cid' => $conversationId, ':uid' => $uid]);
        }
    }

    public function leave(int $conversationId, int $userId): void
    {
        $this->db->prepare(
            'UPDATE chat_conversation_members SET left_at = NOW()
             WHERE conversation_id = :cid AND user_id = :uid AND left_at IS NULL'
        )->execute([':cid' => $conversationId, ':uid' => $userId]);
    }

    /** @return array<int> */
    public function activeMemberUserIds(int $conversationId, int $excludeUserId = 0): array
    {
        $stmt = $this->db->prepare(
            'SELECT user_id FROM chat_conversation_members
             WHERE conversation_id = :cid AND left_at IS NULL
               AND (:exclude = 0 OR user_id != :exclude)'
        );
        $stmt->execute([':cid' => $conversationId, ':exclude' => $excludeUserId]);
        return array_map('intval', array_column($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [], 'user_id'));
    }
}
