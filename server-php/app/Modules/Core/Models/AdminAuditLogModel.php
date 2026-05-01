<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

class AdminAuditLogModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @param array<string, mixed> $metadata
     * @param array<string, mixed>|null $beforeSnapshot
     * @param array<string, mixed>|null $afterSnapshot
     */
    public function insert(
        ?int $actorUserId,
        string $action,
        string $entityType,
        int $entityId,
        array $metadata = [],
        ?array $beforeSnapshot = null,
        ?array $afterSnapshot = null
    ): void {
        $stmt = $this->db->prepare(
            'INSERT INTO admin_audit_log (actor_user_id, action, entity_type, entity_id, metadata, before_snapshot, after_snapshot)
             VALUES (:actor, :action, :etype, :eid, CAST(:meta AS jsonb), CAST(:before AS jsonb), CAST(:after AS jsonb))'
        );
        $stmt->execute([
            ':actor'  => $actorUserId,
            ':action' => $action,
            ':etype'  => $entityType,
            ':eid'    => $entityId,
            ':meta'   => json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            ':before' => $beforeSnapshot === null ? 'null' : json_encode($beforeSnapshot, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            ':after'  => $afterSnapshot === null ? 'null' : json_encode($afterSnapshot, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
    }

    /**
     * Recent audit rows for one entity (e.g. a service engagement).
     *
     * @return array<int, array<string, mixed>>
     */
    public function listForEntity(string $entityType, int $entityId, int $limit, int $offset): array
    {
        $stmt = $this->db->prepare(
            'SELECT a.id, a.actor_user_id, a.action, a.entity_type, a.entity_id,
                    a.metadata, a.before_snapshot, a.after_snapshot, a.created_at,
                    u.name AS actor_name
             FROM admin_audit_log a
             LEFT JOIN users u ON u.id = a.actor_user_id
             WHERE a.entity_type = :etype AND a.entity_id = :eid
             ORDER BY a.created_at DESC, a.id DESC
             LIMIT :lim OFFSET :off'
        );
        $stmt->bindValue(':etype', $entityType, PDO::PARAM_STR);
        $stmt->bindValue(':eid', $entityId, PDO::PARAM_INT);
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }
}
