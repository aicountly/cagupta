<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class ChatMessageModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return array{rows: array<int, array<string, mixed>>, has_more: bool}
     */
    public function listForConversation(int $conversationId, int $afterId = 0, int $beforeId = 0, int $limit = 50): array
    {
        $limit = max(1, min(100, $limit));
        $params = [':cid' => $conversationId, ':lim' => $limit + 1];

        if ($afterId > 0) {
            $sql = 'SELECT msg.id, msg.conversation_id, msg.sender_user_id, msg.sender_kind,
                           msg.sender_display_name, msg.body_text, msg.metadata, msg.created_at,
                           COALESCE(msg.sender_display_name, u.name) AS sender_name
                    FROM chat_messages msg
                    LEFT JOIN users u ON u.id = msg.sender_user_id
                    WHERE msg.conversation_id = :cid AND msg.id > :after_id
                    ORDER BY msg.id ASC
                    LIMIT :lim';
            $params[':after_id'] = $afterId;
        } elseif ($beforeId > 0) {
            $sql = 'SELECT * FROM (
                        SELECT msg.id, msg.conversation_id, msg.sender_user_id, msg.sender_kind,
                               msg.sender_display_name, msg.body_text, msg.metadata, msg.created_at,
                               COALESCE(msg.sender_display_name, u.name) AS sender_name
                        FROM chat_messages msg
                        LEFT JOIN users u ON u.id = msg.sender_user_id
                        WHERE msg.conversation_id = :cid AND msg.id < :before_id
                        ORDER BY msg.id DESC
                        LIMIT :lim
                    ) sub ORDER BY sub.id ASC';
            $params[':before_id'] = $beforeId;
        } else {
            $sql = 'SELECT * FROM (
                        SELECT msg.id, msg.conversation_id, msg.sender_user_id, msg.sender_kind,
                               msg.sender_display_name, msg.body_text, msg.metadata, msg.created_at,
                               COALESCE(msg.sender_display_name, u.name) AS sender_name
                        FROM chat_messages msg
                        LEFT JOIN users u ON u.id = msg.sender_user_id
                        WHERE msg.conversation_id = :cid
                        ORDER BY msg.id DESC
                        LIMIT :lim
                    ) sub ORDER BY sub.id ASC';
        }

        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $hasMore = count($rows) > $limit;
        if ($hasMore) {
            if ($afterId > 0) {
                array_pop($rows);
            } else {
                array_shift($rows);
            }
        }

        return ['rows' => $rows, 'has_more' => $hasMore];
    }

    public function insert(int $conversationId, int $senderUserId, string $bodyText, string $senderName): int
    {
        return $this->insertWithKind($conversationId, 'staff', $senderUserId, $senderName, $bodyText, []);
    }

    /** @param array<string, mixed> $metadata */
    public function insertClientMessage(int $conversationId, string $bodyText, string $displayName): int
    {
        return $this->insertWithKind($conversationId, 'client', null, $displayName, $bodyText, []);
    }

    /** @param array<string, mixed> $metadata */
    public function insertBotMessage(int $conversationId, string $bodyText, array $metadata = []): int
    {
        return $this->insertWithKind(
            $conversationId,
            'bot',
            null,
            \App\Libraries\ClientAssistantBot::botDisplayName(),
            $bodyText,
            $metadata
        );
    }

    /** @param array<string, mixed> $metadata */
    private function insertWithKind(
        int $conversationId,
        string $senderKind,
        ?int $senderUserId,
        string $displayName,
        string $bodyText,
        array $metadata
    ): int {
        $bodyText = trim($bodyText);
        $stmt = $this->db->prepare(
            'INSERT INTO chat_messages (conversation_id, sender_user_id, sender_kind, sender_display_name, body_text, metadata)
             VALUES (:cid, :uid, :kind, :dname, :body, CAST(:meta AS jsonb))
             RETURNING id'
        );
        $stmt->execute([
            ':cid'   => $conversationId,
            ':uid'   => $senderUserId,
            ':kind'  => $senderKind,
            ':dname' => $displayName,
            ':body'  => $bodyText,
            ':meta'  => json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
        $messageId = (int)$stmt->fetchColumn();

        $this->db->prepare(
            'INSERT INTO chat_message_events (message_id, conversation_id, sender_user_id, sender_name, sender_kind, body_text, created_at)
             VALUES (:mid, :cid, :uid, :sname, :skind, :body, NOW())'
        )->execute([
            ':mid'   => $messageId,
            ':cid'   => $conversationId,
            ':uid'   => $senderUserId,
            ':sname' => $displayName,
            ':skind' => $senderKind,
            ':body'  => $bodyText,
        ]);

        return $messageId;
    }

    /**
     * Super Admin audit search.
     *
     * @return array{rows: array<int, array<string, mixed>>, total: int}
     */
    public function auditSearch(
        string $keyword = '',
        int $senderUserId = 0,
        int $conversationId = 0,
        string $dateFrom = '',
        string $dateTo = '',
        int $page = 1,
        int $perPage = 50,
        string $conversationType = '',
        string $senderKind = ''
    ): array {
        $where = ['1=1'];
        $params = [];

        if ($keyword !== '') {
            $where[] = 'e.body_text ILIKE :kw';
            $params[':kw'] = '%' . $keyword . '%';
        }
        if ($senderUserId > 0) {
            $where[] = 'e.sender_user_id = :suid';
            $params[':suid'] = $senderUserId;
        }
        if ($conversationId > 0) {
            $where[] = 'e.conversation_id = :cid';
            $params[':cid'] = $conversationId;
        }
        if ($dateFrom !== '') {
            $where[] = 'e.created_at >= :dfrom';
            $params[':dfrom'] = $dateFrom;
        }
        if ($dateTo !== '') {
            $where[] = 'e.created_at <= :dto';
            $params[':dto'] = $dateTo;
        }
        if ($conversationType !== '') {
            $where[] = 'c.type = :ctype';
            $params[':ctype'] = $conversationType;
        }
        if ($senderKind !== '') {
            $where[] = 'e.sender_kind = :skind';
            $params[':skind'] = $senderKind;
        }

        $whereClause = implode(' AND ', $where);
        $offset = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM chat_message_events e
             JOIN chat_conversations c ON c.id = e.conversation_id
             WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT e.id, e.message_id, e.conversation_id, e.sender_user_id, e.sender_name, e.sender_kind,
                    e.body_text, e.created_at,
                    c.type AS conversation_type, c.title AS conversation_title
             FROM chat_message_events e
             JOIN chat_conversations c ON c.id = e.conversation_id
             WHERE {$whereClause}
             ORDER BY e.created_at DESC, e.id DESC
             LIMIT :lim OFFSET :off"
        );
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return ['rows' => $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [], 'total' => $total];
    }
}
