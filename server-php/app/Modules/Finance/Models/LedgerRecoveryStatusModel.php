<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * LedgerRecoveryStatusModel — NPA / bad-debt classification per ledger entity.
 *
 * One row per client or organization. Classification only; ledger balances unchanged.
 */
class LedgerRecoveryStatusModel
{
    public const STATUS_NPA      = 'npa';
    public const STATUS_BAD_DEBT = 'bad_debt';

    public const BUCKET_ACTIVE   = 'active';
    public const BUCKET_NPA      = 'npa';
    public const BUCKET_BAD_DEBT = 'bad_debt';

    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /** @return array<string, mixed>|null */
    public function getByEntity(string $entityType, int $entityId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT lrs.*,
                    npa_u.name AS npa_marked_by_name,
                    bd_u.name AS bad_debt_marked_by_name
             FROM ledger_recovery_status lrs
             LEFT JOIN users npa_u ON npa_u.id = lrs.npa_marked_by
             LEFT JOIN users bd_u ON bd_u.id = lrs.bad_debt_marked_by
             WHERE lrs.entity_type = :entity_type
               AND lrs.entity_id = :entity_id
             LIMIT 1'
        );
        $stmt->execute([
            ':entity_type' => $entityType,
            ':entity_id'   => $entityId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * Bulk-fetch status rows for many entities.
     *
     * @param list<array{0: string, 1: int}> $entityPairs [entity_type, entity_id]
     * @return array<string, array<string, mixed>> keyed by "client:1" / "organization:5"
     */
    public function mapForEntities(array $entityPairs): array
    {
        if ($entityPairs === []) {
            return [];
        }

        $valueParts = [];
        $params     = [];
        foreach ($entityPairs as $i => [$et, $eid]) {
            $tk = ':et' . $i;
            $ek = ':eid' . $i;
            $valueParts[] = "({$tk}, {$ek})";
            $params[$tk]  = $et;
            $params[$ek]  = $eid;
        }

        $valuesClause = implode(',', $valueParts);
        $sql          = "
            SELECT lrs.*,
                   npa_u.name AS npa_marked_by_name,
                   bd_u.name AS bad_debt_marked_by_name
            FROM ledger_recovery_status lrs
            JOIN (VALUES {$valuesClause}) AS pairs(et, eid)
                ON lrs.entity_type = pairs.et AND lrs.entity_id = pairs.eid::integer
            LEFT JOIN users npa_u ON npa_u.id = lrs.npa_marked_by
            LEFT JOIN users bd_u ON bd_u.id = lrs.bad_debt_marked_by
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $out = [];
        foreach ($rows as $row) {
            $key       = $row['entity_type'] . ':' . $row['entity_id'];
            $out[$key] = $row;
        }

        return $out;
    }

    /**
     * @return array<string, mixed>
     */
    public function markNpa(
        string $entityType,
        int $entityId,
        string $reason,
        int $markedByUserId,
        float $receivableBalance
    ): array {
        if ($receivableBalance <= 0.01) {
            throw new \InvalidArgumentException('Entity receivable balance must be greater than zero to mark as NPA.');
        }

        $existing = $this->getByEntity($entityType, $entityId);
        if ($existing !== null) {
            throw new \InvalidArgumentException('Entity is already classified as NPA or bad debt.');
        }

        $reason = trim($reason);
        if ($reason === '') {
            throw new \InvalidArgumentException('NPA reason is required.');
        }

        $stmt = $this->db->prepare(
            'INSERT INTO ledger_recovery_status
                (entity_type, entity_id, status, npa_reason, npa_marked_at, npa_marked_by)
             VALUES
                (:entity_type, :entity_id, :status, :npa_reason, NOW(), :npa_marked_by)
             RETURNING *'
        );
        $stmt->execute([
            ':entity_type'   => $entityType,
            ':entity_id'     => $entityId,
            ':status'        => self::STATUS_NPA,
            ':npa_reason'    => $reason,
            ':npa_marked_by' => $markedByUserId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

        return $this->formatForApi($this->enrichRow($row));
    }

    /**
     * @return array<string, mixed>
     */
    public function markBadDebt(
        string $entityType,
        int $entityId,
        string $reason,
        int $markedByUserId
    ): array {
        $existing = $this->getByEntity($entityType, $entityId);
        if ($existing === null || ($existing['status'] ?? '') !== self::STATUS_NPA) {
            throw new \InvalidArgumentException('Entity must be marked as NPA before marking as bad debt.');
        }

        $reason = trim($reason);
        if ($reason === '') {
            throw new \InvalidArgumentException('Bad debt reason is required.');
        }

        $stmt = $this->db->prepare(
            'UPDATE ledger_recovery_status
             SET status = :status,
                 bad_debt_reason = :bad_debt_reason,
                 bad_debt_marked_at = NOW(),
                 bad_debt_marked_by = :bad_debt_marked_by,
                 updated_at = NOW()
             WHERE entity_type = :entity_type
               AND entity_id = :entity_id
               AND status = :current_status
             RETURNING *'
        );
        $stmt->execute([
            ':status'             => self::STATUS_BAD_DEBT,
            ':bad_debt_reason'    => $reason,
            ':bad_debt_marked_by' => $markedByUserId,
            ':entity_type'        => $entityType,
            ':entity_id'          => $entityId,
            ':current_status'     => self::STATUS_NPA,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            throw new \InvalidArgumentException('Entity must be marked as NPA before marking as bad debt.');
        }

        return $this->formatForApi($this->enrichRow($row));
    }

    public static function assertBucket(string $bucket): string
    {
        $bucket = strtolower(trim($bucket));
        if ($bucket === '') {
            $bucket = self::BUCKET_ACTIVE;
        }
        if (!in_array($bucket, [self::BUCKET_ACTIVE, self::BUCKET_NPA, self::BUCKET_BAD_DEBT], true)) {
            throw new \InvalidArgumentException('bucket must be active, npa, or bad_debt.');
        }

        return $bucket;
    }

    /**
     * @param array<string, mixed>|null $statusRow raw DB row or null when unclassified
     */
    public static function entityMatchesBucket(?array $statusRow, string $bucket): bool
    {
        $bucket = self::assertBucket($bucket);
        $status = $statusRow !== null ? (string)($statusRow['status'] ?? '') : '';

        return match ($bucket) {
            self::BUCKET_ACTIVE   => $statusRow === null,
            self::BUCKET_NPA      => $status === self::STATUS_NPA,
            self::BUCKET_BAD_DEBT => $status === self::STATUS_BAD_DEBT,
            default               => false,
        };
    }

    /**
     * @param array<string, mixed>|null $row
     * @return array<string, mixed>|null
     */
    public function formatForApi(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }

        return [
            'id'                   => (int)$row['id'],
            'entityType'           => (string)$row['entity_type'],
            'entityId'             => (int)$row['entity_id'],
            'status'               => (string)$row['status'],
            'npaReason'            => $row['npa_reason'] ?? null,
            'npaMarkedAt'          => $row['npa_marked_at'] ?? null,
            'npaMarkedBy'          => isset($row['npa_marked_by']) ? (int)$row['npa_marked_by'] : null,
            'npaMarkedByName'      => $row['npa_marked_by_name'] ?? null,
            'badDebtReason'        => $row['bad_debt_reason'] ?? null,
            'badDebtMarkedAt'      => $row['bad_debt_marked_at'] ?? null,
            'badDebtMarkedBy'      => isset($row['bad_debt_marked_by']) ? (int)$row['bad_debt_marked_by'] : null,
            'badDebtMarkedByName'  => $row['bad_debt_marked_by_name'] ?? null,
        ];
    }

    /** @param array<string, mixed> $row */
    private function enrichRow(array $row): array
    {
        $full = $this->getByEntity((string)$row['entity_type'], (int)$row['entity_id']);

        return $full ?? $row;
    }
}
