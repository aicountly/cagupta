<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class WorkHoldAuditLogModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function insert(?int $clientId, ?int $organizationId, string $action, ?int $actorUserId, array $payload = []): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO work_hold_audit_log (client_id, organization_id, action, actor_user_id, payload)
             VALUES (:cid, :oid, :act, :uid, CAST(:payload AS jsonb))'
        );
        $stmt->execute([
            ':cid'     => ($clientId !== null && $clientId > 0) ? $clientId : null,
            ':oid'     => ($organizationId !== null && $organizationId > 0) ? $organizationId : null,
            ':act'     => $action,
            ':uid'     => $actorUserId,
            ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
    }

    /** @return array<int, array<string, mixed>> */
    public function listForEntity(?int $clientId, ?int $organizationId, int $limit = 80): array
    {
        $limit = max(1, min(200, $limit));
        if ($clientId !== null && $clientId > 0) {
            $stmt = $this->db->prepare(
                'SELECT w.*, u.name AS actor_name
                 FROM work_hold_audit_log w
                 LEFT JOIN users u ON u.id = w.actor_user_id
                 WHERE w.client_id = :cid AND w.organization_id IS NULL
                 ORDER BY w.id DESC
                 LIMIT :lim'
            );
            $stmt->bindValue(':cid', $clientId, PDO::PARAM_INT);
        } elseif ($organizationId !== null && $organizationId > 0) {
            $stmt = $this->db->prepare(
                'SELECT w.*, u.name AS actor_name
                 FROM work_hold_audit_log w
                 LEFT JOIN users u ON u.id = w.actor_user_id
                 WHERE w.organization_id = :oid AND w.client_id IS NULL
                 ORDER BY w.id DESC
                 LIMIT :lim'
            );
            $stmt->bindValue(':oid', $organizationId, PDO::PARAM_INT);
        } else {
            return [];
        }
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }
}
