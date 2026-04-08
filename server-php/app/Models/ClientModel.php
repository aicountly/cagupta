<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * ClientModel — CRUD operations for the `clients` table.
 *
 * All queries use PDO prepared statements; no raw string interpolation.
 */
class ClientModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Fast type-ahead search — returns a minimal list for autocomplete dropdowns.
     *
     * Matches on name (first, last, organization), email, and PAN.
     * Returns at most $limit rows ordered by display name.
     *
     * @return array<int, array<string, mixed>>
     */
    public function search(string $q, int $limit = 20): array
    {
        $like = "%{$q}%";

        $stmt = $this->db->prepare(
            "SELECT id,
                    first_name,
                    last_name,
                    organization_name,
                    email,
                    pan,
                    is_active
             FROM clients
             WHERE is_active = true
               AND (
                       first_name        ILIKE :like
                    OR last_name         ILIKE :like2
                    OR organization_name ILIKE :like3
                    OR email             ILIKE :like4
                    OR pan               ILIKE :like5
               )
             ORDER BY COALESCE(organization_name,
                               TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,'')))) ASC
             LIMIT :limit"
        );
        $stmt->bindValue(':like',  $like);
        $stmt->bindValue(':like2', $like);
        $stmt->bindValue(':like3', $like);
        $stmt->bindValue(':like4', $like);
        $stmt->bindValue(':like5', $like);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /**
     * Find a client by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT c.*, u.name AS created_by_name
             FROM clients c
             LEFT JOIN users u ON u.id = c.created_by
             WHERE c.id = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }

        $linkedOrgs                = $this->getLinkedOrgs($row['id']);
        $row['linked_org_ids']   = array_column($linkedOrgs, 'id');
        $row['linked_org_names'] = array_column($linkedOrgs, 'name');

        return $row;
    }

    /**
     * Return a paginated list of clients.
     *
     * @return array{total: int, clients: array<int, array<string, mixed>>}
     */
    public function paginate(
        int    $page    = 1,
        int    $perPage = 20,
        string $search  = '',
        string $status  = ''
    ): array {
        $where  = ['1=1'];
        $params = [];

        if ($search !== '') {
            $where[]           = "(c.first_name ILIKE :search OR c.last_name ILIKE :search
                                   OR c.organization_name ILIKE :search OR c.email ILIKE :search
                                   OR c.pan ILIKE :search OR c.phone ILIKE :search)";
            $params[':search'] = "%{$search}%";
        }
        if ($status !== '') {
            $where[]             = 'c.is_active = :is_active';
            $params[':is_active'] = ($status === 'active') ? 'true' : 'false';
        }

        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM clients c WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT c.*, u.name AS created_by_name
             FROM clients c
             LEFT JOIN users u ON u.id = c.created_by
             WHERE {$whereClause}
             ORDER BY c.created_at DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit',  $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset,  PDO::PARAM_INT);
        $stmt->execute();
        $clients = $stmt->fetchAll();

        // Batch-fetch linked organizations to avoid N+1 queries
        if (!empty($clients)) {
            $contactIds   = array_map('intval', array_column($clients, 'id'));
            $paramNames   = array_map(fn($i) => ":cid{$i}", array_keys($contactIds));
            $placeholders = implode(',', $paramNames);

            $orgStmt = $this->db->prepare(
                "SELECT co.contact_id, o.id AS org_id, o.name AS org_name
                 FROM contact_organization co
                 JOIN organizations o ON o.id = co.organization_id
                 WHERE co.contact_id IN ({$placeholders})
                 ORDER BY o.name ASC"
            );
            foreach ($contactIds as $i => $cid) {
                $orgStmt->bindValue(":cid{$i}", $cid, PDO::PARAM_INT);
            }
            $orgStmt->execute();
            $allLinkedOrgs = $orgStmt->fetchAll();

            // Group by contact_id
            $orgsByContact = [];
            foreach ($allLinkedOrgs as $row) {
                $orgsByContact[(int)$row['contact_id']][] = $row;
            }

            foreach ($clients as &$client) {
                $orgs                       = $orgsByContact[(int)$client['id']] ?? [];
                $client['linked_org_ids']   = array_map(fn($o) => (int)$o['org_id'], $orgs);
                $client['linked_org_names'] = array_column($orgs, 'org_name');
            }
            unset($client);
        }

        return ['total' => $total, 'clients' => $clients];
    }

    /**
     * Create a new client record.
     *
     * @param array<string, mixed> $data
     * @return int The new client's id.
     */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO clients (
                type, first_name, last_name, organization_name,
                email, phone, pan, gstin,
                address_line1, address_line2, city, state, pincode, country,
                notes, reference, group_id, is_active, created_by
             ) VALUES (
                :type, :first_name, :last_name, :organization_name,
                :email, :phone, :pan, :gstin,
                :address_line1, :address_line2, :city, :state, :pincode, :country,
                :notes, :reference, :group_id, :is_active, :created_by
             ) RETURNING id'
        );
        $stmt->execute([
            ':type'              => $data['type']              ?? 'individual',
            ':first_name'        => $data['first_name']        ?? null,
            ':last_name'         => $data['last_name']         ?? null,
            ':organization_name' => $data['organization_name'] ?? null,
            ':email'             => $data['email']             ?? null,
            ':phone'             => $data['phone']             ?? null,
            ':pan'               => $data['pan']               ?? null,
            ':gstin'             => $data['gstin']             ?? null,
            ':address_line1'     => $data['address_line1']     ?? null,
            ':address_line2'     => $data['address_line2']     ?? null,
            ':city'              => $data['city']              ?? null,
            ':state'             => $data['state']             ?? null,
            ':pincode'           => $data['pincode']           ?? null,
            ':country'           => $data['country']           ?? 'India',
            ':notes'             => $data['notes']             ?? null,
            ':reference'         => $data['reference']         ?? null,
            ':group_id'          => isset($data['group_id']) && $data['group_id'] !== '' ? (int)$data['group_id'] : null,
            ':is_active'         => ((bool)($data['is_active'] ?? true)) ? 'true' : 'false',
            ':created_by'        => $data['created_by']        ?? null,
        ]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Update an existing client.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $setClauses = [];
        $params     = [':id' => $id];

        $allowed = [
            'type', 'first_name', 'last_name', 'organization_name',
            'email', 'phone', 'pan', 'gstin',
            'address_line1', 'address_line2', 'city', 'state', 'pincode', 'country',
            'notes', 'reference',
        ];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $setClauses[]       = "{$field} = :{$field}";
                $params[":{$field}"] = $data[$field];
            }
        }
        if (array_key_exists('is_active', $data)) {
            $setClauses[]       = 'is_active = :is_active';
            $params[':is_active'] = ((bool)$data['is_active']) ? 'true' : 'false';
        }
        if (array_key_exists('group_id', $data)) {
            $setClauses[]      = 'group_id = :group_id';
            $params[':group_id'] = isset($data['group_id']) && $data['group_id'] !== '' ? (int)$data['group_id'] : null;
        }

        if (empty($setClauses)) {
            return false;
        }

        $setClauses[] = 'updated_at = NOW()';
        $setClause    = implode(', ', $setClauses);

        $stmt = $this->db->prepare("UPDATE clients SET {$setClause} WHERE id = :id");
        return $stmt->execute($params);
    }

    /**
     * Update only the is_active status of a client.
     */
    public function updateStatus(int $id, bool $isActive): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE clients SET is_active = :is_active, updated_at = NOW() WHERE id = :id'
        );
        return $stmt->execute([':is_active' => $isActive ? 'true' : 'false', ':id' => $id]);
    }

    /**
     * Delete a client record permanently.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM clients WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }

    /**
     * Sync the linked organizations for a contact.
     * Replaces all existing links with the new set.
     *
     * @param array<int> $orgIds
     */
    public function syncLinkedOrgs(int $clientId, array $orgIds): void
    {
        // Remove all existing links
        $stmt = $this->db->prepare('DELETE FROM contact_organization WHERE contact_id = :cid');
        $stmt->execute([':cid' => $clientId]);

        // Insert new links
        if (!empty($orgIds)) {
            $stmt = $this->db->prepare(
                'INSERT INTO contact_organization (contact_id, organization_id)
                 VALUES (:cid, :oid)
                 ON CONFLICT (contact_id, organization_id) DO NOTHING'
            );
            foreach ($orgIds as $orgId) {
                $stmt->execute([':cid' => $clientId, ':oid' => (int)$orgId]);
            }
        }
    }

    /**
     * Get linked organizations for a single contact.
     *
     * @return array<int, array<string, mixed>>
     */
    private function getLinkedOrgs(int $clientId): array
    {
        $stmt = $this->db->prepare(
            'SELECT o.id, o.name
             FROM contact_organization co
             JOIN organizations o ON o.id = co.organization_id
             WHERE co.contact_id = :cid
             ORDER BY o.name ASC'
        );
        $stmt->execute([':cid' => $clientId]);
        return $stmt->fetchAll();
    }

    /**
     * Return a display name for a client row.
     *
     * @param array<string, mixed> $client
     */
    public static function displayName(array $client): string
    {
        if (!empty($client['organization_name'])) {
            return $client['organization_name'];
        }
        $parts = array_filter([
            $client['first_name'] ?? '',
            $client['last_name']  ?? '',
        ]);
        return implode(' ', $parts) ?: 'Unknown';
    }
}
