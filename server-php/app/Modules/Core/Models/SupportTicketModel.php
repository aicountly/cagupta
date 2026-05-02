<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class SupportTicketModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    public function nextPublicId(): string
    {
        $year = (int)date('Y');
        $stmt = $this->db->prepare(
            "SELECT public_id FROM support_tickets
             WHERE public_id LIKE :pfx
             ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([':pfx' => 'CG-' . $year . '-%']);
        $last = $stmt->fetchColumn();
        $n    = 0;
        if (is_string($last) && preg_match('/-(\d+)$/', $last, $m)) {
            $n = (int)$m[1];
        }

        return sprintf('CG-%d-%05d', $year, $n + 1);
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO support_tickets (
                public_id, status, subject, primary_inbound_email_id, created_from,
                related_client_id
            ) VALUES (
                :pid, :st, :subj, :ieid, :cf, :rc
            ) RETURNING id'
        );
        $stmt->execute([
            ':pid'  => $data['public_id'],
            ':st'   => $data['status'] ?? 'open',
            ':subj' => $data['subject'] ?? null,
            ':ieid' => $data['primary_inbound_email_id'] ?? null,
            ':cf'   => $data['created_from'] ?? 'email',
            ':rc'   => $data['related_client_id'] ?? null,
        ]);

        return (int)$stmt->fetchColumn();
    }

    public function addMessage(int $ticketId, string $direction, ?string $text, ?string $html, ?int $sentByUserId, ?string $emailMsgId = null): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO support_ticket_messages (support_ticket_id, direction, body_text, body_html, sent_by_user_id, email_message_id)
             VALUES (:tid, :dir, :tx, :ht, :uid, :mid)'
        );
        $stmt->execute([
            ':tid' => $ticketId,
            ':dir' => $direction,
            ':tx'  => $text,
            ':ht'  => $html,
            ':uid' => $sentByUserId,
            ':mid' => $emailMsgId,
        ]);
    }

    /** @return array{ok: bool, current?: array<string, mixed>} */
    public function tryPick(int $ticketId, int $userId): array
    {
        $t = $this->find($ticketId);
        if ($t === null) {
            return ['ok' => false];
        }
        $pickedBy = isset($t['picked_by_user_id']) ? (int)$t['picked_by_user_id'] : 0;
        if ($pickedBy > 0 && $pickedBy !== $userId) {
            return ['ok' => false, 'current' => $t];
        }
        $stmt = $this->db->prepare(
            'UPDATE support_tickets SET
                status = CASE WHEN status = \'open\' THEN \'picked\' ELSE status END,
                picked_by_user_id = :uid,
                picked_at = COALESCE(picked_at, NOW()),
                updated_at = NOW()
             WHERE id = :id AND (picked_by_user_id IS NULL OR picked_by_user_id = :uid2)'
        );
        $stmt->execute([':id' => $ticketId, ':uid' => $userId, ':uid2' => $userId]);

        return ['ok' => $stmt->rowCount() > 0, 'current' => $this->find($ticketId) ?: []];
    }

    public function assertPicker(int $ticketId, int $userId): bool
    {
        $t = $this->find($ticketId);
        if ($t === null) {
            return false;
        }
        $pickedBy = isset($t['picked_by_user_id']) ? (int)$t['picked_by_user_id'] : 0;

        return $pickedBy === 0 || $pickedBy === $userId;
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT t.*, u.name AS picked_by_name, u.email AS picked_by_email
             FROM support_tickets t
             LEFT JOIN users u ON u.id = t.picked_by_user_id
             WHERE t.id = :id'
        );
        $stmt->execute([':id' => $id]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC);

        return $r ?: null;
    }

    /** @return array<int, array<string, mixed>> */
    public function listMessages(int $ticketId): array
    {
        $stmt = $this->db->prepare(
            'SELECT m.*, u.name AS sent_by_name
             FROM support_ticket_messages m
             LEFT JOIN users u ON u.id = m.sent_by_user_id
             WHERE m.support_ticket_id = :id
             ORDER BY m.id ASC'
        );
        $stmt->execute([':id' => $ticketId]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /** @return array{total: int, rows: array<int, array<string, mixed>>} */
    public function paginate(int $page, int $perPage, string $status = ''): array
    {
        $where = ['1=1'];
        $params = [];
        if ($status !== '' && $status !== 'all') {
            $where[]            = 't.status = :st';
            $params[':st']      = $status;
        }
        $whereClause = implode(' AND ', $where);
        $off         = ($page - 1) * $perPage;
        $cstmt       = $this->db->prepare("SELECT COUNT(*) FROM support_tickets t WHERE {$whereClause}");
        foreach ($params as $k => $v) {
            $cstmt->bindValue($k, $v);
        }
        $cstmt->execute();
        $total = (int)$cstmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT t.*, pu.name AS picked_by_name
             FROM support_tickets t
             LEFT JOIN users pu ON pu.id = t.picked_by_user_id
             WHERE {$whereClause}
             ORDER BY t.updated_at DESC
             LIMIT :lim OFFSET :off"
        );
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $off, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return ['total' => $total, 'rows' => $rows];
    }

    public function updateStatus(int $id, string $status, ?string $resolutionNotes, int $userId): bool
    {
        if (!$this->assertPicker($id, $userId)) {
            return false;
        }
        if (!in_array($status, ['open', 'picked', 'resolved', 'closed'], true)) {
            return false;
        }
        $stmt = $this->db->prepare(
            'UPDATE support_tickets SET status = :st, resolution_notes = COALESCE(:rn, resolution_notes), updated_at = NOW() WHERE id = :id'
        );

        return $stmt->execute([':st' => $status, ':rn' => $resolutionNotes, ':id' => $id]);
    }

    public function setRelatedClient(int $id, ?int $clientId): bool
    {
        $stmt = $this->db->prepare('UPDATE support_tickets SET related_client_id = :c, updated_at = NOW() WHERE id = :id');

        return $stmt->execute([':c' => $clientId, ':id' => $id]);
    }
}
