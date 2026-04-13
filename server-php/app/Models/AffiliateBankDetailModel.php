<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class AffiliateBankDetailModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listByUserId(int $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, user_id, account_holder_name, bank_name, account_number_last4, ifsc,
                    is_primary, verification_status, verified_at, created_at
             FROM affiliate_bank_details WHERE user_id = :uid ORDER BY is_primary DESC, id ASC'
        );
        $stmt->execute([':uid' => $userId]);

        return $stmt->fetchAll();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM affiliate_bank_details WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function insert(array $data): int
    {
        $num   = trim((string)($data['account_number'] ?? ''));
        $last4 = strlen($num) >= 4 ? substr($num, -4) : $num;

        $stmt = $this->db->prepare(
            'INSERT INTO affiliate_bank_details (
                user_id, account_holder_name, bank_name, account_number_last4, account_number_enc, ifsc, is_primary, verification_status
            ) VALUES (:uid, :holder, :bank, :l4, :enc, :ifsc, :prim, \'pending\') RETURNING id'
        );
        $stmt->execute([
            ':uid'   => $data['user_id'],
            ':holder'=> $data['account_holder_name'],
            ':bank'  => $data['bank_name'] ?? null,
            ':l4'    => $last4,
            ':enc'   => $num,
            ':ifsc'  => strtoupper(trim((string)$data['ifsc'])),
            ':prim'  => !empty($data['is_primary']),
        ]);
        $newId = (int)$stmt->fetchColumn();

        if (!empty($data['is_primary'])) {
            $this->clearPrimaryExcept($data['user_id'], $newId);
        }

        return $newId;
    }

    private function clearPrimaryExcept(int $userId, int $keepId): void
    {
        $this->db->prepare(
            'UPDATE affiliate_bank_details SET is_primary = FALSE WHERE user_id = :uid AND id != :kid'
        )->execute([':uid' => $userId, ':kid' => $keepId]);
    }

    public function setVerification(int $id, string $status, ?int $verifiedBy): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE affiliate_bank_details SET verification_status = :st, verified_by = :vb,
             verified_at = CASE WHEN :st2 = \'verified\' THEN NOW() ELSE verified_at END,
             updated_at = NOW() WHERE id = :id'
        );

        return $stmt->execute([
            ':st'  => $status,
            ':st2' => $status,
            ':vb'  => $verifiedBy,
            ':id'  => $id,
        ]);
    }

    public function delete(int $id, int $userId): bool
    {
        $stmt = $this->db->prepare('DELETE FROM affiliate_bank_details WHERE id = :id AND user_id = :uid');

        return $stmt->execute([':id' => $id, ':uid' => $userId]);
    }
}
