<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class ChatConversationModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT c.*, u.name AS created_by_name
             FROM chat_conversations c
             LEFT JOIN users u ON u.id = c.created_by_user_id
             WHERE c.id = :id'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /** @return array<string, mixed>|null */
    public function findDmBetween(int $userA, int $userB): ?array
    {
        $a = min($userA, $userB);
        $b = max($userA, $userB);
        $stmt = $this->db->prepare(
            'SELECT * FROM chat_conversations
             WHERE type = \'dm\' AND dm_user_a_id = :a AND dm_user_b_id = :b
             LIMIT 1'
        );
        $stmt->execute([':a' => $a, ':b' => $b]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /** @return array<int, array<string, mixed>> */
    public function listForUser(int $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT c.id, c.type, c.title, c.created_by_user_id, c.dm_user_a_id, c.dm_user_b_id,
                    c.last_message_at, c.created_at,
                    m.last_read_message_id,
                    (
                        SELECT COUNT(*)::int FROM chat_messages msg
                        WHERE msg.conversation_id = c.id
                          AND (m.last_read_message_id IS NULL OR msg.id > m.last_read_message_id)
                          AND msg.sender_user_id IS DISTINCT FROM :uid
                    ) AS unread_count,
                    (
                        SELECT msg.body_text FROM chat_messages msg
                        WHERE msg.conversation_id = c.id
                        ORDER BY msg.id DESC LIMIT 1
                    ) AS last_message_preview,
                    (
                        SELECT msg.created_at FROM chat_messages msg
                        WHERE msg.conversation_id = c.id
                        ORDER BY msg.id DESC LIMIT 1
                    ) AS last_message_created_at,
                    CASE
                        WHEN c.type = \'dm\' THEN (
                            SELECT u.name FROM users u
                            WHERE u.id = CASE
                                WHEN c.dm_user_a_id = :uid THEN c.dm_user_b_id
                                ELSE c.dm_user_a_id
                            END
                        )
                        ELSE c.title
                    END AS display_title
             FROM chat_conversations c
             INNER JOIN chat_conversation_members m
                ON m.conversation_id = c.id AND m.user_id = :uid AND m.left_at IS NULL
             ORDER BY c.last_message_at DESC, c.id DESC'
        );
        $stmt->execute([':uid' => $userId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /** @param array<int> $memberUserIds */
    public function createChannel(string $title, int $createdByUserId, array $memberUserIds): int
    {
        $title = trim($title);
        $stmt = $this->db->prepare(
            'INSERT INTO chat_conversations (type, title, created_by_user_id, last_message_at, updated_at)
             VALUES (\'channel\', :title, :creator, NOW(), NOW())
             RETURNING id'
        );
        $stmt->execute([':title' => $title, ':creator' => $createdByUserId]);
        $convId = (int)$stmt->fetchColumn();

        $memberUserIds = array_values(array_unique(array_filter(array_map('intval', $memberUserIds))));
        if (!in_array($createdByUserId, $memberUserIds, true)) {
            $memberUserIds[] = $createdByUserId;
        }

        $ins = $this->db->prepare(
            'INSERT INTO chat_conversation_members (conversation_id, user_id, joined_at)
             VALUES (:cid, :uid, NOW())
             ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL, joined_at = NOW()'
        );
        foreach ($memberUserIds as $uid) {
            $ins->execute([':cid' => $convId, ':uid' => $uid]);
        }

        return $convId;
    }

    public function createDm(int $userA, int $userB, int $createdByUserId): int
    {
        $existing = $this->findDmBetween($userA, $userB);
        if ($existing !== null) {
            $convId = (int)$existing['id'];
            $member = new ChatMemberModel();
            $member->ensureActiveMember($convId, $userA);
            $member->ensureActiveMember($convId, $userB);
            return $convId;
        }

        $a = min($userA, $userB);
        $b = max($userA, $userB);
        $stmt = $this->db->prepare(
            'INSERT INTO chat_conversations (type, created_by_user_id, dm_user_a_id, dm_user_b_id, last_message_at, updated_at)
             VALUES (\'dm\', :creator, :a, :b, NOW(), NOW())
             RETURNING id'
        );
        $stmt->execute([':creator' => $createdByUserId, ':a' => $a, ':b' => $b]);
        $convId = (int)$stmt->fetchColumn();

        $member = new ChatMemberModel();
        $member->ensureActiveMember($convId, $userA);
        $member->ensureActiveMember($convId, $userB);

        return $convId;
    }

    public function touchLastMessage(int $conversationId): void
    {
        $this->db->prepare(
            'UPDATE chat_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = :id'
        )->execute([':id' => $conversationId]);
    }

    /** @return array<int, array<string, mixed>> */
    public function listChatEnabledUsers(int $excludeUserId): array
    {
        $stmt = $this->db->prepare(
            'SELECT u.id, u.name, u.email, r.name AS role_name, r.display_name AS role_display_name
             FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.is_active = true
               AND u.id != :exclude
               AND (
                 COALESCE(r.permissions->\'permissions\', \'[]\'::jsonb) @> \'["chat.use"]\'::jsonb
                 OR COALESCE(r.permissions->\'permissions\', \'[]\'::jsonb) @> \'["*"]\'::jsonb
               )
             ORDER BY u.name ASC, u.id ASC'
        );
        $stmt->execute([':exclude' => $excludeUserId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function userHasChatUse(int $userId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT 1 FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.id = :id AND u.is_active = true
               AND (
                 COALESCE(r.permissions->\'permissions\', \'[]\'::jsonb) @> \'["chat.use"]\'::jsonb
                 OR COALESCE(r.permissions->\'permissions\', \'[]\'::jsonb) @> \'["*"]\'::jsonb
               )
             LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        return (bool)$stmt->fetchColumn();
    }
}
