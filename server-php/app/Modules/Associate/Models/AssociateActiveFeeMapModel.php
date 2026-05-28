<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class AssociateActiveFeeMapModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /** @return array<int, array<string, mixed>> */
    public function listForAssociate(int $associateUserId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM associate_active_fee_map
             WHERE associate_user_id = :u
             ORDER BY effective_from DESC, id DESC'
        );
        $stmt->execute([':u' => $associateUserId]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function insertRow(array $row): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO associate_active_fee_map (
                associate_user_id, client_id, service_id, fixed_amount, effective_from, effective_to, notes
            ) VALUES (:au, :cid, :sid, :fx, :efr, :eto, :nt)
             RETURNING id'
        );
        $stmt->execute([
            ':au'  => (int)$row['associate_user_id'],
            ':cid' => isset($row['client_id']) && (int)$row['client_id'] > 0 ? (int)$row['client_id'] : null,
            ':sid' => isset($row['service_id']) && (int)$row['service_id'] > 0 ? (int)$row['service_id'] : null,
            ':fx'  => (float)$row['fixed_amount'],
            ':efr' => $row['effective_from'] ?? date('Y-m-d'),
            ':eto' => $row['effective_to'] ?? null,
            ':nt'  => $row['notes'] ?? null,
        ]);

        return (int)$stmt->fetchColumn();
    }

    public function deleteRow(int $id): void
    {
        $this->db->prepare('DELETE FROM associate_active_fee_map WHERE id = :id')->execute([':id' => $id]);
    }

    /**
     * Best matching fixed payout for an active-model associate on this invoice context.
     */
    public function resolveFixedAmount(
        int $associateUserId,
        int $clientId,
        int $orgId,
        int $serviceId,
        string $txnDateYmd
    ): ?float {
        $stmt = $this->db->prepare(
            'SELECT fixed_amount FROM associate_active_fee_map
             WHERE associate_user_id = :au
               AND (effective_to IS NULL OR effective_to >= CAST(:td AS date))
               AND effective_from <= CAST(:td2 AS date)
               AND (
                    (service_id IS NOT NULL AND service_id = :sid)
                 OR (client_id IS NOT NULL AND client_id = :cid AND service_id IS NULL)
                 OR (client_id IS NULL AND service_id IS NULL)
               )
             ORDER BY
               CASE WHEN service_id IS NOT NULL THEN 2 WHEN client_id IS NOT NULL THEN 1 ELSE 0 END DESC,
               effective_from DESC
             LIMIT 1'
        );
        $cid = $clientId > 0 ? $clientId : 0;
        if ($cid <= 0 && $orgId > 0) {
            // Org-only invoice: try match via client's org — fee map is contact-scoped; skip org-only for v1
            $cid = 0;
        }
        $stmt->execute([
            ':au'  => $associateUserId,
            ':td'  => $txnDateYmd,
            ':td2' => $txnDateYmd,
            ':sid' => $serviceId,
            ':cid' => $cid,
        ]);
        $v = $stmt->fetchColumn();
        if ($v === false) {
            return null;
        }
        $f = (float)$v;

        return $f > 0 ? round($f, 2) : null;
    }
}
