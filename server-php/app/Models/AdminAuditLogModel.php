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
}
