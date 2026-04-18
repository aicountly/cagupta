<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class ClientSessionModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    public function create(
        string $token,
        string $identifier,
        string $entityType,
        int $entityId,
        ?int $contextContactId,
        ?int $contextOrgId,
        \DateTimeImmutable $expiresAt,
        ?string $ipAddress,
        ?string $userAgent
    ): void {
        $stmt = $this->db->prepare(
            "INSERT INTO client_sessions (
                token, login_identifier, entity_type, entity_id, context_contact_id, context_org_id,
                ip_address, user_agent, expires_at
            ) VALUES (
                :token, :identifier, :entity_type, :entity_id, :context_contact_id, :context_org_id,
                :ip_address, :user_agent, :expires_at
            )"
        );
        $stmt->execute([
            ':token'              => $token,
            ':identifier'         => strtolower(trim($identifier)),
            ':entity_type'        => $entityType,
            ':entity_id'          => $entityId,
            ':context_contact_id' => $contextContactId,
            ':context_org_id'     => $contextOrgId,
            ':ip_address'         => $ipAddress ?: null,
            ':user_agent'         => $userAgent ?: null,
            ':expires_at'         => $expiresAt->format('Y-m-d H:i:sO'),
        ]);
    }

    public function findByToken(string $token): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT *
             FROM client_sessions
             WHERE token = :token
               AND expires_at > NOW()
             LIMIT 1"
        );
        $stmt->execute([':token' => $token]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function deleteByToken(string $token): void
    {
        $this->db->prepare('DELETE FROM client_sessions WHERE token = :token')
            ->execute([':token' => $token]);
    }
}
