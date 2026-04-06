<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * CredentialModel — CRUD operations for the `credentials_vault` table.
 */
class CredentialModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Find a credential by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT cv.*,
                    COALESCE(c.organization_name,
                             TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))),
                             'Unknown') AS client_name
             FROM credentials_vault cv
             LEFT JOIN clients c ON c.id = cv.client_id
             WHERE cv.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Return a paginated list of credentials.
     *
     * @return array{total: int, credentials: array<int, array<string, mixed>>}
     */
    public function paginate(
        int    $page     = 1,
        int    $perPage  = 20,
        int    $clientId = 0
    ): array {
        $where  = ['1=1'];
        $params = [];

        if ($clientId > 0) {
            $where[]              = 'cv.client_id = :client_id';
            $params[':client_id'] = $clientId;
        }

        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM credentials_vault cv WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT cv.*,
                    COALESCE(c.organization_name,
                             TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))),
                             'Unknown') AS client_name
             FROM credentials_vault cv
             LEFT JOIN clients c ON c.id = cv.client_id
             WHERE {$whereClause}
             ORDER BY cv.created_at DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit',  $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset,  PDO::PARAM_INT);
        $stmt->execute();

        return ['total' => $total, 'credentials' => $stmt->fetchAll()];
    }

    /**
     * Create a new credential record.
     *
     * @param array<string, mixed> $data
     * @return int The new credential's id.
     */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO credentials_vault (
                client_id, organization_id, portal_name,
                username, password_encrypted, url, notes, created_by
             ) VALUES (
                :client_id, :organization_id, :portal_name,
                :username, :password_encrypted, :url, :notes, :created_by
             ) RETURNING id'
        );
        $stmt->execute([
            ':client_id'          => $data['client_id']          ?? null,
            ':organization_id'    => $data['organization_id']    ?? null,
            ':portal_name'        => $data['portal_name']        ?? '',
            ':username'           => $data['username']           ?? null,
            ':password_encrypted' => $data['password_encrypted'] ?? null,
            ':url'                => $data['url']                ?? null,
            ':notes'              => $data['notes']              ?? null,
            ':created_by'         => $data['created_by']         ?? null,
        ]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Update an existing credential.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $setClauses = [];
        $params     = [':id' => $id];

        $allowed = ['portal_name', 'username', 'password_encrypted', 'url', 'notes'];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $setClauses[]       = "{$field} = :{$field}";
                $params[":{$field}"] = $data[$field];
            }
        }

        if (empty($setClauses)) {
            return false;
        }

        $setClauses[] = 'updated_at = NOW()';
        $setClause    = implode(', ', $setClauses);

        $stmt = $this->db->prepare("UPDATE credentials_vault SET {$setClause} WHERE id = :id");
        return $stmt->execute($params);
    }

    /**
     * Delete a credential record.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM credentials_vault WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }
}
