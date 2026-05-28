<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class ClientChatConversationModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /** @param array<string, mixed> $authUser */
    public function getOrCreateForClient(array $authUser): array
    {
        $entityType = (string)($authUser['entity_type'] ?? 'contact');
        $contactId = (int)($authUser['contact_id'] ?? 0);
        $orgId = (int)($authUser['organization_id'] ?? 0);

        if ($entityType === 'organization' && $orgId > 0) {
            $existing = $this->findByOrganization($orgId);
            if ($existing !== null) {
                return $existing;
            }
            return $this->createThread('organization', null, $orgId, $this->organizationDisplayName($orgId));
        }

        if ($contactId > 0) {
            $existing = $this->findByContact($contactId);
            if ($existing !== null) {
                return $existing;
            }
            return $this->createThread('contact', $contactId, null, $this->contactDisplayName($contactId));
        }

        throw new \RuntimeException('Unable to resolve client chat identity.');
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM chat_conversations WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /** @return array<string, mixed>|null */
    public function findByContact(int $contactId): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM chat_conversations
             WHERE type = 'client_support' AND client_entity_type = 'contact' AND client_contact_id = :cid
             LIMIT 1"
        );
        $stmt->execute([':cid' => $contactId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /** @return array<string, mixed>|null */
    public function findByOrganization(int $orgId): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM chat_conversations
             WHERE type = 'client_support' AND client_entity_type = 'organization' AND client_organization_id = :oid
             LIMIT 1"
        );
        $stmt->execute([':oid' => $orgId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /** @return array{rows: array<int, array<string, mixed>>, total: int} */
    public function listThreads(string $filter = '', int $page = 1, int $perPage = 50): array
    {
        $where = ["c.type = 'client_support'"];
        $params = [];
        if ($filter === 'needs_attention') {
            $where[] = 'c.needs_attention = TRUE';
        }
        $whereClause = implode(' AND ', $where);
        $offset = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM chat_conversations c WHERE {$whereClause}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT c.*,
                    CASE
                        WHEN c.client_entity_type = 'contact' THEN cl.name
                        WHEN c.client_entity_type = 'organization' THEN o.name
                        ELSE 'Client'
                    END AS client_display_name,
                    (
                        SELECT msg.body_text FROM chat_messages msg
                        WHERE msg.conversation_id = c.id ORDER BY msg.id DESC LIMIT 1
                    ) AS last_message_preview,
                    (
                        SELECT msg.created_at FROM chat_messages msg
                        WHERE msg.conversation_id = c.id ORDER BY msg.id DESC LIMIT 1
                    ) AS last_message_created_at
             FROM chat_conversations c
             LEFT JOIN clients cl ON cl.id = c.client_contact_id
             LEFT JOIN organizations o ON o.id = c.client_organization_id
             WHERE {$whereClause}
             ORDER BY c.needs_attention DESC, c.last_message_at DESC, c.id DESC
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

    public function touchLastMessage(int $conversationId): void
    {
        $this->db->prepare(
            'UPDATE chat_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = :id'
        )->execute([':id' => $conversationId]);
    }

    public function markClientRead(int $conversationId, int $messageId): void
    {
        $this->db->prepare(
            'UPDATE chat_conversations
             SET client_last_read_message_id = GREATEST(COALESCE(client_last_read_message_id, 0), :mid)
             WHERE id = :cid'
        )->execute([':mid' => $messageId, ':cid' => $conversationId]);
    }

    public function markStaffRead(int $conversationId, int $messageId): void
    {
        $this->db->prepare(
            'UPDATE chat_conversations
             SET stassoc_last_read_message_id = GREATEST(COALESCE(stassoc_last_read_message_id, 0), :mid),
                 needs_attention = FALSE
             WHERE id = :cid'
        )->execute([':mid' => $messageId, ':cid' => $conversationId]);
    }

    public function setNeedsAttention(int $conversationId, bool $needsAttention): void
    {
        $sql = 'UPDATE chat_conversations SET needs_attention = :flag, updated_at = NOW()';
        if ($needsAttention) {
            $sql .= ', last_escalated_at = NOW()';
        }
        $sql .= ' WHERE id = :id';
        $this->db->prepare($sql)->execute([':flag' => $needsAttention, ':id' => $conversationId]);
    }

    /** @return array<string, mixed> */
    public function clientSummary(array $conversation): array
    {
        if (($conversation['client_entity_type'] ?? '') === 'organization') {
            $orgId = (int)($conversation['client_organization_id'] ?? 0);
            $stmt = $this->db->prepare('SELECT id, name FROM organizations WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => $orgId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
            return [
                'entity_type' => 'organization',
                'entity_id' => $orgId,
                'display_name' => (string)($row['name'] ?? 'Organization'),
            ];
        }

        $contactId = (int)($conversation['client_contact_id'] ?? 0);
        $stmt = $this->db->prepare('SELECT id, name, email FROM clients WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $contactId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        return [
            'entity_type' => 'contact',
            'entity_id' => $contactId,
            'display_name' => (string)($row['name'] ?? 'Contact'),
            'email' => (string)($row['email'] ?? ''),
        ];
    }

    /** @return array<int> */
    public function listStaffUserIdsWithManagePermission(): array
    {
        $stmt = $this->db->query(
            "SELECT u.id FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.is_active = TRUE
               AND (
                 COALESCE(r.permissions->'permissions', '[]'::jsonb) @> '[\"*\"]'::jsonb
                 OR COALESCE(r.permissions->'permissions', '[]'::jsonb) @> '[\"client.chat.manage\"]'::jsonb
                 OR r.name IN ('super_admin', 'admin')
               )"
        );
        return array_map('intval', array_column($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [], 'id'));
    }

    public function checkRateLimit(int $conversationId, int $maxMessages = 10, int $windowSeconds = 300): bool
    {
        $stmt = $this->db->prepare('SELECT window_start, message_count FROM client_chat_rate_limits WHERE conversation_id = :cid');
        $stmt->execute([':cid' => $conversationId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        $now = new \DateTimeImmutable('now');
        if ($row === false) {
            $this->db->prepare(
                'INSERT INTO client_chat_rate_limits (conversation_id, window_start, message_count) VALUES (:cid, NOW(), 1)'
            )->execute([':cid' => $conversationId]);
            return true;
        }

        $windowStart = new \DateTimeImmutable((string)$row['window_start']);
        $elapsed = $now->getTimestamp() - $windowStart->getTimestamp();
        $count = (int)$row['message_count'];

        if ($elapsed >= $windowSeconds) {
            $this->db->prepare(
                'UPDATE client_chat_rate_limits SET window_start = NOW(), message_count = 1 WHERE conversation_id = :cid'
            )->execute([':cid' => $conversationId]);
            return true;
        }

        if ($count >= $maxMessages) {
            return false;
        }

        $this->db->prepare(
            'UPDATE client_chat_rate_limits SET message_count = message_count + 1 WHERE conversation_id = :cid'
        )->execute([':cid' => $conversationId]);
        return true;
    }

    /** @return array<int, array{question: string, answer: string}> */
    public function listFaqs(): array
    {
        $stmt = $this->db->query(
            'SELECT question, answer FROM client_assistant_faq WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC'
        );
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /** @return array<int, array{title: string, excerpt: string}> */
    public function listPublishedBlogExcerpts(int $limit = 8): array
    {
        $stmt = $this->db->prepare(
            "SELECT title, excerpt FROM blog_posts
             WHERE status = 'published'
             ORDER BY published_at DESC NULLS LAST, id DESC
             LIMIT :lim"
        );
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    private function createThread(?string $entityType, ?int $contactId, ?int $orgId, string $title): array
    {
        $stmt = $this->db->prepare(
            "INSERT INTO chat_conversations (
                type, title, client_entity_type, client_contact_id, client_organization_id,
                last_message_at, created_at, updated_at
             ) VALUES (
                'client_support', :title, :etype, :cid, :oid, NOW(), NOW(), NOW()
             ) RETURNING *"
        );
        $stmt->execute([
            ':title' => $title,
            ':etype' => $entityType,
            ':cid'   => $contactId,
            ':oid'   => $orgId,
        ]);
        $conv = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($conv === false) {
            throw new \RuntimeException('Failed to create client chat thread.');
        }

        $msgModel = new ChatMessageModel();
        $welcome = 'Hello! I am the CA Assistant. I can answer general questions about tax, GST, and our services using our published guides. '
            . 'If you need personalised help, ask to speak with our team and a CA will reply here.';
        $msgModel->insertBotMessage((int)$conv['id'], $welcome, ['prompt_version' => 'welcome_v1']);

        $convId = (int)$conv['id'];
        $this->touchLastMessage($convId);
        $refreshed = $this->find($convId);
        return $refreshed ?? $conv;
    }

    private function contactDisplayName(int $contactId): string
    {
        $stmt = $this->db->prepare('SELECT name FROM clients WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $contactId]);
        $name = $stmt->fetchColumn();
        return is_string($name) && $name !== '' ? $name : 'Contact';
    }

    private function organizationDisplayName(int $orgId): string
    {
        $stmt = $this->db->prepare('SELECT name FROM organizations WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $orgId]);
        $name = $stmt->fetchColumn();
        return is_string($name) && $name !== '' ? $name : 'Organization';
    }
}
