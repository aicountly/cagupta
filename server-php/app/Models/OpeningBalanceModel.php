<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * OpeningBalanceModel — CRUD for the `opening_balances` table.
 *
 * Each row represents the opening debit or credit balance for a client
 * under a specific billing profile.  There is at most one row per
 * (client_id, billing_profile_code) pair.
 */
class OpeningBalanceModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Return all opening balances for a client, keyed by billing_profile_code.
     *
     * @return array<int, array<string, mixed>>
     */
    public function forClient(int $clientId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM opening_balances
             WHERE client_id = :client_id
             ORDER BY billing_profile_code ASC'
        );
        $stmt->execute([':client_id' => $clientId]);
        return $stmt->fetchAll();
    }

    /**
     * Find a single opening balance row by client + billing profile.
     *
     * @return array<string, mixed>|null
     */
    public function findByClientAndProfile(int $clientId, string $profileCode): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM opening_balances
             WHERE client_id = :client_id AND billing_profile_code = :profile_code
             LIMIT 1'
        );
        $stmt->execute([':client_id' => $clientId, ':profile_code' => $profileCode]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Upsert an opening balance (insert or update).
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>  The saved row.
     */
    public function upsert(int $clientId, string $profileCode, float $amount, string $type): array
    {
        $stmt = $this->db->prepare(
            'INSERT INTO opening_balances (client_id, billing_profile_code, amount, type)
             VALUES (:client_id, :profile_code, :amount, :type)
             ON CONFLICT (client_id, billing_profile_code)
             DO UPDATE SET amount = EXCLUDED.amount,
                           type   = EXCLUDED.type,
                           updated_at = NOW()
             RETURNING *'
        );
        $stmt->execute([
            ':client_id'    => $clientId,
            ':profile_code' => $profileCode,
            ':amount'       => $amount,
            ':type'         => $type,
        ]);
        return $stmt->fetch();
    }

    /**
     * Delete an opening balance.
     */
    public function delete(int $clientId, string $profileCode): bool
    {
        $stmt = $this->db->prepare(
            'DELETE FROM opening_balances
             WHERE client_id = :client_id AND billing_profile_code = :profile_code'
        );
        return $stmt->execute([':client_id' => $clientId, ':profile_code' => $profileCode]);
    }
}
