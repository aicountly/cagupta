<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class PartnerProfileModel
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
        $stmt = $this->db->prepare('SELECT * FROM partner_profiles WHERE user_id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    public function insertPending(int $userId, ?string $specialty = null): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO partner_profiles (user_id, status, specialty)
             VALUES (:uid, \'pending\', :spec)
             ON CONFLICT (user_id) DO NOTHING'
        );
        $stmt->execute([
            ':uid'  => $userId,
            ':spec' => $specialty,
        ]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listByStatus(string $status, int $page = 1, int $perPage = 50): array
    {
        $offset = ($page - 1) * $perPage;
        $stmt   = $this->db->prepare(
            "SELECT pp.*, u.name, u.email, u.is_active
             FROM partner_profiles pp
             JOIN users u ON u.id = pp.user_id
             WHERE pp.status = :st
             ORDER BY pp.created_at DESC
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
            "SELECT pp.*, u.name, u.email, u.is_active
             FROM partner_profiles pp
             JOIN users u ON u.id = pp.user_id
             ORDER BY pp.created_at DESC
             LIMIT :lim OFFSET :off"
        );
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    public function countAll(): int
    {
        return (int)$this->db->query('SELECT COUNT(*) FROM partner_profiles')->fetchColumn();
    }

    public function setStatus(int $userId, string $status, ?int $approvedBy): bool
    {
        $sql = 'UPDATE partner_profiles SET status = :st, approved_by = :ab, approved_at = CASE WHEN :st2 = \'approved\' THEN COALESCE(approved_at, NOW()) ELSE approved_at END, updated_at = NOW() WHERE user_id = :uid';
        $stmt = $this->db->prepare($sql);

        return $stmt->execute([
            ':st'  => $status,
            ':st2' => $status,
            ':ab'  => $approvedBy,
            ':uid' => $userId,
        ]);
    }

    public function updateProfile(int $userId, array $data): bool
    {
        $sets = ['updated_at = NOW()'];
        $params = [':uid' => $userId];

        if (array_key_exists('specialty', $data)) {
            $sets[] = 'specialty = :spec';
            $params[':spec'] = $data['specialty'];
        }
        if (array_key_exists('bio', $data)) {
            $sets[] = 'bio = :bio';
            $params[':bio'] = $data['bio'];
        }
        if (array_key_exists('notes', $data)) {
            $sets[] = 'notes = :notes';
            $params[':notes'] = $data['notes'];
        }

        $stmt = $this->db->prepare('UPDATE partner_profiles SET ' . implode(', ', $sets) . ' WHERE user_id = :uid');

        return $stmt->execute($params);
    }
}
