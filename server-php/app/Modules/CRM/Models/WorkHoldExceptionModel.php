<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class WorkHoldExceptionModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Exceptions that currently lift a hold for this entity (service match or non-expired window).
     *
     * @return array<int, array<string, mixed>>
     */
    public function listCurrentlyEffective(?int $clientId, ?int $organizationId, int $serviceId): array
    {
        if (($clientId === null || $clientId <= 0) && ($organizationId === null || $organizationId <= 0)) {
            return [];
        }
        if ($clientId !== null && $clientId > 0) {
            $stmt = $this->db->prepare(
                "SELECT * FROM work_hold_exceptions
                 WHERE client_id = :cid
                   AND organization_id IS NULL
                   AND (
                       (exception_kind = 'service' AND service_id = :sid)
                       OR (exception_kind = 'window' AND expires_at > NOW())
                   )
                 ORDER BY id ASC"
            );
            $stmt->execute([':cid' => $clientId, ':sid' => $serviceId]);
        } else {
            $oid = (int)$organizationId;
            $stmt = $this->db->prepare(
                "SELECT * FROM work_hold_exceptions
                 WHERE organization_id = :oid
                   AND client_id IS NULL
                   AND (
                       (exception_kind = 'service' AND service_id = :sid)
                       OR (exception_kind = 'window' AND expires_at > NOW())
                   )
                 ORDER BY id ASC"
            );
            $stmt->execute([':oid' => $oid, ':sid' => $serviceId]);
        }

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /** All rows for UI (caller may filter expired windows). */
    public function listForEntity(?int $clientId, ?int $organizationId): array
    {
        if (($clientId === null || $clientId <= 0) && ($organizationId === null || $organizationId <= 0)) {
            return [];
        }
        if ($clientId !== null && $clientId > 0) {
            $stmt = $this->db->prepare(
                'SELECT * FROM work_hold_exceptions WHERE client_id = :cid AND organization_id IS NULL ORDER BY id DESC'
            );
            $stmt->execute([':cid' => $clientId]);
        } else {
            $stmt = $this->db->prepare(
                'SELECT * FROM work_hold_exceptions WHERE organization_id = :oid AND client_id IS NULL ORDER BY id DESC'
            );
            $stmt->execute([':oid' => (int)$organizationId]);
        }

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM work_hold_exceptions WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * @param array{exception_kind: string, service_id?: int|null, expires_at?: string|null, notes?: string|null, created_by?: int|null} $data
     */
    public function createForClient(int $clientId, array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO work_hold_exceptions (client_id, organization_id, exception_kind, service_id, expires_at, notes, created_by)
             VALUES (:cid, NULL, :kind, :sid, :exp, :notes, :cb) RETURNING id'
        );
        $stmt->execute([
            ':cid'   => $clientId,
            ':kind'  => $data['exception_kind'],
            ':sid'   => $data['service_id'] ?? null,
            ':exp'   => $data['expires_at'] ?? null,
            ':notes' => $data['notes'] ?? null,
            ':cb'    => $data['created_by'] ?? null,
        ]);

        return (int)$stmt->fetchColumn();
    }

    /**
     * @param array{exception_kind: string, service_id?: int|null, expires_at?: string|null, notes?: string|null, created_by?: int|null} $data
     */
    public function createForOrganization(int $organizationId, array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO work_hold_exceptions (client_id, organization_id, exception_kind, service_id, expires_at, notes, created_by)
             VALUES (NULL, :oid, :kind, :sid, :exp, :notes, :cb) RETURNING id'
        );
        $stmt->execute([
            ':oid'   => $organizationId,
            ':kind'  => $data['exception_kind'],
            ':sid'   => $data['service_id'] ?? null,
            ':exp'   => $data['expires_at'] ?? null,
            ':notes' => $data['notes'] ?? null,
            ':cb'    => $data['created_by'] ?? null,
        ]);

        return (int)$stmt->fetchColumn();
    }

    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM work_hold_exceptions WHERE id = :id');

        return $stmt->execute([':id' => $id]);
    }

    /** Delete expired window exceptions (housekeeping). Returns rows deleted. */
    public function purgeExpiredWindows(): int
    {
        $stmt = $this->db->prepare(
            "DELETE FROM work_hold_exceptions
             WHERE exception_kind = 'window' AND expires_at <= NOW()"
        );
        $stmt->execute();

        return $stmt->rowCount();
    }
}
