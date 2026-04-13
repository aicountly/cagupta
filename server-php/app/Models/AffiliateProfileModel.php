<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class AffiliateProfileModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function findByUserId(int $userId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM affiliate_profiles WHERE user_id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    public function insertPending(int $userId, ?int $parentAffiliateUserId = null): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO affiliate_profiles (user_id, status, parent_affiliate_user_id)
             VALUES (:uid, \'pending\', :parent)
             ON CONFLICT (user_id) DO NOTHING'
        );
        $stmt->execute([
            ':uid'    => $userId,
            ':parent' => $parentAffiliateUserId,
        ]);
    }

    /** Sub-affiliate self-registration: set parent when profile row is new. */
    public function insertPendingWithParent(int $userId, int $parentAffiliateUserId): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO affiliate_profiles (user_id, status, parent_affiliate_user_id)
             VALUES (:uid, \'pending\', :parent)
             ON CONFLICT (user_id) DO UPDATE SET
                parent_affiliate_user_id = COALESCE(affiliate_profiles.parent_affiliate_user_id, EXCLUDED.parent_affiliate_user_id),
                updated_at = NOW()'
        );
        $stmt->execute([
            ':uid'    => $userId,
            ':parent' => $parentAffiliateUserId,
        ]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listByStatus(string $status, int $page = 1, int $perPage = 50): array
    {
        $offset = ($page - 1) * $perPage;
        $stmt   = $this->db->prepare(
            "SELECT ap.*, u.name, u.email, u.is_active
             FROM affiliate_profiles ap
             JOIN users u ON u.id = ap.user_id
             WHERE ap.status = :st
             ORDER BY ap.created_at DESC
             LIMIT :lim OFFSET :off"
        );
        $stmt->bindValue(':st', $status);
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listAll(int $page = 1, int $perPage = 50): array
    {
        $offset = ($page - 1) * $perPage;
        $stmt   = $this->db->prepare(
            "SELECT ap.*, u.name, u.email, u.is_active
             FROM affiliate_profiles ap
             JOIN users u ON u.id = ap.user_id
             ORDER BY ap.created_at DESC
             LIMIT :lim OFFSET :off"
        );
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    public function setStatus(int $userId, string $status, ?int $approvedBy): bool
    {
        $sql = 'UPDATE affiliate_profiles SET status = :st, approved_by = :ab, approved_at = CASE WHEN :st2 = \'approved\' THEN COALESCE(approved_at, NOW()) ELSE approved_at END, updated_at = NOW() WHERE user_id = :uid';
        $stmt = $this->db->prepare($sql);

        return $stmt->execute([
            ':st'  => $status,
            ':st2' => $status,
            ':ab'  => $approvedBy,
            ':uid' => $userId,
        ]);
    }

    public function updateNotes(int $userId, ?string $notes): bool
    {
        $stmt = $this->db->prepare('UPDATE affiliate_profiles SET notes = :n, updated_at = NOW() WHERE user_id = :uid');

        return $stmt->execute([':n' => $notes, ':uid' => $userId]);
    }
}
