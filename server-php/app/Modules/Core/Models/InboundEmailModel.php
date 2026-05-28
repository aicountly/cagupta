<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class InboundEmailModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Insert an inbound email row and return its ID.
     * On duplicate MessageId (PostgreSQL SQLSTATE 23505) returns the existing row's ID
     * and sets $isDuplicate = true instead of throwing.
     *
     * @param array<string, mixed> $row
     * @return array{int, bool} [id, isDuplicate]
     */
    public function insertOrGetExisting(array $row): array
    {
        $params = [
            ':mid'         => $row['message_id'] ?? null,
            ':from_em'     => $row['from_email'],
            ':from_nm'     => $row['from_name'] ?? null,
            ':to_em'       => $row['to_emails'] ?? '',
            ':subj'        => $row['subject'] ?? null,
            ':txt'         => $row['body_text'] ?? null,
            ':html'        => $row['body_html'] ?? null,
            ':raw'         => json_encode($row['raw_payload'] ?? [], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
            ':received_at' => $row['received_at'] ?? null,
            ':mc'          => isset($row['matched_client_id']) ? (int)$row['matched_client_id'] : null,
        ];

        try {
            $stmt = $this->db->prepare(
                'INSERT INTO inbound_emails (
                    message_id, from_email, from_name, to_emails, subject,
                    body_text, body_html, raw_payload, received_at, matched_client_id
                ) VALUES (
                    :mid, :from_em, :from_nm, :to_em, :subj,
                    :txt, :html, CAST(:raw AS jsonb), COALESCE(CAST(:received_at AS timestamptz), NOW()), :mc
                ) RETURNING id'
            );
            $stmt->execute($params);
            return [(int)$stmt->fetchColumn(), false];
        } catch (\PDOException $e) {
            // 23505 = unique_violation (duplicate message_id)
            if (str_starts_with((string)$e->getCode(), '23505') || str_contains($e->getMessage(), '23505')) {
                $mid = $params[':mid'];
                if ($mid !== null && $mid !== '') {
                    $s2 = $this->db->prepare('SELECT id FROM inbound_emails WHERE message_id = :mid LIMIT 1');
                    $s2->execute([':mid' => $mid]);
                    $existingId = $s2->fetchColumn();
                    if ($existingId !== false) {
                        return [(int)$existingId, true];
                    }
                }
            }
            throw $e;
        }
    }

    /**
     * @param array<string, mixed> $row
     * @deprecated Use insertOrGetExisting() instead
     */
    public function insert(array $row): int
    {
        [$id] = $this->insertOrGetExisting($row);
        return $id;
    }

    /** @return array<int, array<string, mixed>> */
    public function paginate(int $page, int $perPage, bool $archived = false): array
    {
        $off = ($page - 1) * $perPage;
        $w   = $archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL';
        $cnt = $this->db->query(
            "SELECT COUNT(*) FROM inbound_emails WHERE {$w}"
        )->fetchColumn();
        $stmt = $this->db->prepare(
            "SELECT e.*, c.organization_name, c.first_name, c.last_name
             FROM inbound_emails e
             LEFT JOIN clients c ON c.id = e.matched_client_id
             WHERE {$w}
             ORDER BY e.received_at DESC
             LIMIT :lim OFFSET :off"
        );
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $off, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return ['total' => (int)$cnt, 'rows' => $rows];
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT e.*, c.organization_name, c.first_name, c.last_name, c.email AS client_email_match
             FROM inbound_emails e
             LEFT JOIN clients c ON c.id = e.matched_client_id
             WHERE e.id = :id'
        );
        $stmt->execute([':id' => $id]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC);

        return $r ?: null;
    }

    public function markRead(int $id, bool $read): void
    {
        $sql = $read
            ? 'UPDATE inbound_emails SET read_at = COALESCE(read_at, NOW()) WHERE id = :id'
            : 'UPDATE inbound_emails SET read_at = NULL WHERE id = :id';
        $this->db->prepare($sql)->execute([':id' => $id]);
    }

    public function setArchived(int $id, bool $archived): void
    {
        $sql = $archived
            ? 'UPDATE inbound_emails SET archived_at = COALESCE(archived_at, NOW()) WHERE id = :id'
            : 'UPDATE inbound_emails SET archived_at = NULL WHERE id = :id';
        $this->db->prepare($sql)->execute([':id' => $id]);
    }

    /** @param array<int, array<string, mixed>> $atts */
    public function addAttachments(int $inboundEmailId, array $atts): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO inbound_email_attachments (inbound_email_id, filename, content_type, size_bytes, external_ref, stored_url)
             VALUES (:eid, :fn, :ct, :sz, :er, :su)'
        );
        foreach ($atts as $a) {
            $stmt->execute([
                ':eid' => $inboundEmailId,
                ':fn'  => $a['filename'] ?? null,
                ':ct'  => $a['content_type'] ?? null,
                ':sz'  => isset($a['size_bytes']) ? (int)$a['size_bytes'] : null,
                ':er'  => $a['external_ref'] ?? null,
                ':su'  => $a['stored_url'] ?? null,
            ]);
        }
    }
}
