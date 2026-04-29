<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * ServiceLogModel — CRUD for the `service_logs` table.
 *
 * Visibility levels (hierarchical):
 *   internal  → staff only (all entries visible)
 *   affiliate → affiliate + client entries visible
 *   client    → client entries only
 */
class ServiceLogModel
{
    private PDO $db;

    /** Ordered visibility hierarchy (broadest first). */
    private const VISIBILITY_ORDER = ['internal', 'affiliate', 'client'];

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    /**
     * Return all log entries for a service, filtered to the caller's visibility level.
     *
     * $minVisibility controls the minimum visibility of entries to return:
     *   'internal'  → return all entries (internal + affiliate + client)
     *   'affiliate' → return affiliate + client entries
     *   'client'    → return client entries only
     *
     * Pinned entries are sorted first; within each group, newest entries appear first.
     *
     * @return array<int, array<string, mixed>>
     */
    public function listForService(int $serviceId, string $minVisibility = 'internal'): array
    {
        $allowed = match ($minVisibility) {
            'client'    => ['client'],
            'affiliate' => ['affiliate', 'client'],
            default     => ['internal', 'affiliate', 'client'],
        };

        $inPlaceholders = implode(
            ', ',
            array_map(fn(int $i) => ":vis{$i}", array_keys($allowed))
        );

        $stmt = $this->db->prepare(
            "SELECT sl.*,
                    u.name  AS created_by_name,
                    r.name  AS created_by_role,
                    ru.name AS resolved_by_name
             FROM service_logs sl
             LEFT JOIN users u  ON u.id  = sl.created_by
             LEFT JOIN roles r  ON r.id  = u.role_id
             LEFT JOIN users ru ON ru.id = sl.resolved_by
             WHERE sl.service_id = :service_id
               AND sl.visibility IN ({$inPlaceholders})
             ORDER BY sl.is_pinned DESC, sl.created_at DESC, sl.id DESC"
        );

        $params = [':service_id' => $serviceId];
        foreach ($allowed as $i => $v) {
            $params[":vis{$i}"] = $v;
        }
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * Find a single log entry by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT sl.*,
                    u.name  AS created_by_name,
                    ru.name AS resolved_by_name
             FROM service_logs sl
             LEFT JOIN users u  ON u.id  = sl.created_by
             LEFT JOIN users ru ON ru.id = sl.resolved_by
             WHERE sl.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * Insert a new log entry and return the new id.
     *
     * @param array<string, mixed> $data
     */
    public function insert(array $data): int
    {
        $logType    = (string)($data['log_type']   ?? 'note');
        $visibility = (string)($data['visibility'] ?? 'internal');

        // internal_message is always internal; enforce regardless of what was passed.
        if ($logType === 'internal_message') {
            $visibility = 'internal';
        }

        $stmt = $this->db->prepare(
            "INSERT INTO service_logs
                 (service_id, log_type, message, visibility, follow_up_date, created_by)
             VALUES
                 (:service_id, :log_type, :message, :visibility, :follow_up_date, :created_by)
             RETURNING id"
        );
        $stmt->execute([
            ':service_id'     => (int)$data['service_id'],
            ':log_type'       => $logType,
            ':message'        => (string)$data['message'],
            ':visibility'     => $visibility,
            ':follow_up_date' => isset($data['follow_up_date']) && $data['follow_up_date'] !== ''
                                     ? (string)$data['follow_up_date']
                                     : null,
            ':created_by'     => isset($data['created_by']) ? (int)$data['created_by'] : null,
        ]);

        return (int)$stmt->fetchColumn();
    }

    /**
     * Update allowed fields of a log entry.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): void
    {
        $sets   = [];
        $params = [':id' => $id];

        $allowed = ['message', 'visibility', 'follow_up_date', 'is_pinned'];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $sets[]              = "{$field} = :{$field}";
                $params[":{$field}"] = $data[$field];
            }
        }

        if ($sets === []) {
            return;
        }

        $sets[] = 'updated_at = NOW()';

        $this->db->prepare(
            'UPDATE service_logs SET ' . implode(', ', $sets) . ' WHERE id = :id'
        )->execute($params);
    }

    /**
     * Mark a log entry as resolved.
     */
    public function markResolved(int $id, int $resolvedBy): void
    {
        $this->db->prepare(
            "UPDATE service_logs
             SET is_resolved = TRUE, resolved_at = NOW(), resolved_by = :resolved_by, updated_at = NOW()
             WHERE id = :id"
        )->execute([':id' => $id, ':resolved_by' => $resolvedBy]);
    }

    /**
     * Record that a reminder email was sent for this log entry.
     */
    public function markReminderSent(int $id): void
    {
        $this->db->prepare(
            "UPDATE service_logs SET reminder_sent_at = NOW(), updated_at = NOW() WHERE id = :id"
        )->execute([':id' => $id]);
    }

    /**
     * Hard-delete a log entry.
     */
    public function delete(int $id): void
    {
        $this->db->prepare('DELETE FROM service_logs WHERE id = :id')->execute([':id' => $id]);
    }

    // ── Cross-service pending follow-ups (super-admin dashboard) ──────────────

    /**
     * Return all unresolved follow-up log entries due within $daysAhead days
     * (or already overdue), across all services, ordered by due date ascending.
     *
     * @return array<int, array<string, mixed>>
     */
    public function pendingFollowUps(int $daysAhead = 30): array
    {
        $cutoff = (new \DateTimeImmutable('today'))->modify("+{$daysAhead} days")->format('Y-m-d');

        $stmt = $this->db->prepare(
            "SELECT
                sl.id,
                sl.service_id,
                sl.log_type,
                sl.message,
                sl.visibility,
                sl.follow_up_date,
                sl.reminder_sent_at,
                sl.is_pinned,
                sl.created_at,
                u.name  AS created_by_name,
                s.service_type,
                s.financial_year,
                s.status  AS service_status,
                s.client_name,
                s.client_type,
                COALESCE(c.name, o.name) AS client_display_name,
                (
                    SELECT STRING_AGG(su.name, ', ' ORDER BY su.name)
                    FROM service_assignees sa
                    JOIN users su ON su.id = sa.user_id
                    WHERE sa.service_id = s.id
                ) AS assignee_names
             FROM service_logs sl
             JOIN services s ON s.id = sl.service_id
             LEFT JOIN clients       c ON c.id = s.client_id        AND s.client_type = 'contact'
             LEFT JOIN organizations o ON o.id = s.organization_id  AND s.client_type = 'organization'
             LEFT JOIN users u ON u.id = sl.created_by
             WHERE sl.is_resolved = FALSE
               AND sl.follow_up_date IS NOT NULL
               AND sl.follow_up_date <= :cutoff
             ORDER BY sl.follow_up_date ASC, sl.id ASC"
        );
        $stmt->execute([':cutoff' => $cutoff]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * Return the count of overdue (past today) unresolved follow-ups.
     * Used for the sidebar badge.
     */
    public function overdueCount(): int
    {
        $today = (new \DateTimeImmutable('today'))->format('Y-m-d');
        $stmt  = $this->db->prepare(
            "SELECT COUNT(*) FROM service_logs
             WHERE is_resolved = FALSE
               AND follow_up_date IS NOT NULL
               AND follow_up_date < :today"
        );
        $stmt->execute([':today' => $today]);

        return (int)$stmt->fetchColumn();
    }
}
