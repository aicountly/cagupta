<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class ClientMasterNameChangeRequestModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @param array<string, mixed> $proposedValues
     */
    public function insertPending(
        string $entityType,
        int $entityId,
        string $currentName,
        array $proposedValues,
        int $requestedByUserId,
        ?string $requestReason = null
    ): int {
        $stmt = $this->db->prepare(
            'INSERT INTO client_master_name_change_requests (
                entity_type, entity_id, status, current_name, proposed_values,
                request_reason, requested_by_user_id
             ) VALUES (
                :etype, :eid, \'pending\', :cname, CAST(:prop AS jsonb),
                :reason, :uid
             ) RETURNING id'
        );
        $stmt->execute([
            ':etype'  => $entityType,
            ':eid'    => $entityId,
            ':cname'  => $currentName,
            ':prop'   => json_encode($proposedValues, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            ':reason' => $requestReason !== null && trim($requestReason) !== '' ? trim($requestReason) : null,
            ':uid'    => $requestedByUserId,
        ]);

        return (int)$stmt->fetchColumn();
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM client_master_name_change_requests WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /** @return array<string, mixed>|null */
    public function findPendingForEntity(string $entityType, int $entityId): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM client_master_name_change_requests
             WHERE entity_type = :etype AND entity_id = :eid AND status = 'pending'
             ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([':etype' => $entityType, ':eid' => $entityId]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /** @return array<int, array<string, mixed>> */
    public function listPendingWithDetails(): array
    {
        $stmt = $this->db->query(
            "SELECT r.*,
                    u.name AS requested_by_name,
                    u.email AS requested_by_email
             FROM client_master_name_change_requests r
             LEFT JOIN users u ON u.id = r.requested_by_user_id
             WHERE r.status = 'pending'
             ORDER BY r.created_at ASC"
        );

        return $stmt ? $stmt->fetchAll() : [];
    }

    public function markApproved(int $id, int $decidedByUserId, ?string $decisionNotes = null): void
    {
        $stmt = $this->db->prepare(
            "UPDATE client_master_name_change_requests
             SET status = 'approved',
                 decided_by_user_id = :db,
                 decided_at = NOW(),
                 decision_notes = :notes
             WHERE id = :id AND status = 'pending'"
        );
        $notes = $decisionNotes !== null && trim($decisionNotes) !== '' ? trim($decisionNotes) : null;
        $stmt->execute([':db' => $decidedByUserId, ':notes' => $notes, ':id' => $id]);
    }

    public function markRejected(int $id, int $decidedByUserId, string $reason): void
    {
        $stmt = $this->db->prepare(
            "UPDATE client_master_name_change_requests
             SET status = 'rejected',
                 decided_by_user_id = :db,
                 decided_at = NOW(),
                 reject_reason = :rs
             WHERE id = :id AND status = 'pending'"
        );
        $stmt->execute([':db' => $decidedByUserId, ':rs' => trim($reason), ':id' => $id]);
    }

    /**
     * Public summary for API responses.
     *
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    public static function toPendingSummary(array $row): array
    {
        $prop = $row['proposed_values'] ?? [];
        if (is_string($prop)) {
            $prop = json_decode($prop, true) ?: [];
        }
        if (!is_array($prop)) {
            $prop = [];
        }

        return [
            'approval_id'   => (int)$row['id'],
            'entity_type'   => (string)($row['entity_type'] ?? ''),
            'entity_id'     => (int)($row['entity_id'] ?? 0),
            'current_name'  => (string)($row['current_name'] ?? ''),
            'proposed_name' => self::proposedDisplayName((string)($row['entity_type'] ?? ''), $prop),
            'proposed_values' => $prop,
            'request_reason' => $row['request_reason'] ?? null,
            'created_at'    => $row['created_at'] ?? null,
        ];
    }

    /**
     * @param array<string, mixed> $proposed
     */
    public static function proposedDisplayName(string $entityType, array $proposed): string
    {
        if ($entityType === 'contact') {
            return ClientModel::displayName([
                'organization_name' => $proposed['organization_name'] ?? null,
                'first_name'        => $proposed['first_name'] ?? null,
                'last_name'         => $proposed['last_name'] ?? null,
            ]);
        }
        if ($entityType === 'organization' || $entityType === 'client_group') {
            return trim((string)($proposed['name'] ?? ''));
        }

        return '';
    }
}
