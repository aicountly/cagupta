<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * OrganizationModel — CRUD operations for the `organizations` table.
 *
 * All queries use PDO prepared statements; no raw string interpolation.
 */
class OrganizationModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Find an organization by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT o.*, u.name AS created_by_name,
                    COALESCE(pc.organization_name,
                             TRIM(CONCAT(COALESCE(pc.first_name,\'\'),\' \',COALESCE(pc.last_name,\'\'))),
                             NULL) AS primary_contact_name
             FROM organizations o
             LEFT JOIN users u ON u.id = o.created_by
             LEFT JOIN clients pc ON pc.id = o.primary_contact_id
             WHERE o.id = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Return a paginated list of organizations.
     *
     * @return array{total: int, organizations: array<int, array<string, mixed>>}
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
            $where[]           = "(o.name ILIKE :search OR o.gstin ILIKE :search
                                   OR o.pan ILIKE :search OR o.email ILIKE :search)";
            $params[':search'] = "%{$search}%";
        }
        if ($status !== '') {
            $where[]             = 'o.is_active = :is_active';
            $params[':is_active'] = ($status === 'active') ? 'true' : 'false';
        }

        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM organizations o WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT o.*, u.name AS created_by_name,
                    COALESCE(pc.organization_name,
                             TRIM(CONCAT(COALESCE(pc.first_name,''),' ',COALESCE(pc.last_name,''))),
                             NULL) AS primary_contact_name
             FROM organizations o
             LEFT JOIN users u ON u.id = o.created_by
             LEFT JOIN clients pc ON pc.id = o.primary_contact_id
             WHERE {$whereClause}
             ORDER BY o.created_at DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit',  $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset,  PDO::PARAM_INT);
        $stmt->execute();

        return ['total' => $total, 'organizations' => $stmt->fetchAll()];
    }

    /**
     * Create a new organization record.
     *
     * @param array<string, mixed> $data
     * @return int The new organization's id.
     */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO organizations (
                name, type, gstin, pan, email, phone,
                address, city, state, country, pincode, website, notes,
                reference, group_id, primary_contact_id, is_active, created_by,
                referring_affiliate_user_id, referral_start_date, commission_mode, client_facing_restricted
             ) VALUES (
                :name, :type, :gstin, :pan, :email, :phone,
                :address, :city, :state, :country, :pincode, :website, :notes,
                :reference, :group_id, :primary_contact_id, :is_active, :created_by,
                :referring_affiliate_user_id, :referral_start_date, :commission_mode, :client_facing_restricted
             ) RETURNING id'
        );
        $refAff = isset($data['referring_affiliate_user_id']) ? (int)$data['referring_affiliate_user_id'] : 0;
        $stmt->execute([
            ':name'               => $data['name'],
            ':type'               => $data['type']       ?? null,
            ':gstin'              => $data['gstin']      ?? null,
            ':pan'                => $data['pan']        ?? null,
            ':email'              => $data['email']      ?? null,
            ':phone'              => $data['phone']      ?? null,
            ':address'            => $data['address']    ?? null,
            ':city'               => $data['city']       ?? null,
            ':state'              => $data['state']      ?? null,
            ':country'            => $data['country']    ?? 'India',
            ':pincode'            => $data['pincode']    ?? null,
            ':website'            => $data['website']    ?? null,
            ':notes'              => $data['notes']      ?? null,
            ':reference'          => $data['reference']  ?? null,
            ':group_id'           => isset($data['group_id']) && $data['group_id'] !== '' ? (int)$data['group_id'] : null,
            ':primary_contact_id' => isset($data['primary_contact_id']) && $data['primary_contact_id'] !== '' ? (int)$data['primary_contact_id'] : null,
            ':is_active'          => ((bool)($data['is_active'] ?? true)) ? 'true' : 'false',
            ':created_by'         => $data['created_by'] ?? null,
            ':referring_affiliate_user_id' => $refAff > 0 ? $refAff : null,
            ':referral_start_date' => !empty($data['referral_start_date']) ? $data['referral_start_date'] : null,
            ':commission_mode'     => $data['commission_mode'] ?? 'referral_only',
            ':client_facing_restricted' => ((bool)($data['client_facing_restricted'] ?? false)) ? 'true' : 'false',
        ]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Update an existing organization.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $setClauses = [];
        $params     = [':id' => $id];

        $allowed = [
            'name', 'type', 'gstin', 'pan', 'email', 'phone',
            'address', 'city', 'state', 'country', 'pincode', 'website', 'notes', 'reference',
            'referral_start_date', 'commission_mode',
        ];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $setClauses[]       = "{$field} = :{$field}";
                $params[":{$field}"] = $data[$field];
            }
        }
        if (array_key_exists('referring_affiliate_user_id', $data)) {
            $ra = (int)$data['referring_affiliate_user_id'];
            $setClauses[]                    = 'referring_affiliate_user_id = :referring_affiliate_user_id';
            $params[':referring_affiliate_user_id'] = $ra > 0 ? $ra : null;
        }
        if (array_key_exists('client_facing_restricted', $data)) {
            $setClauses[]                       = 'client_facing_restricted = :client_facing_restricted';
            $params[':client_facing_restricted'] = ((bool)$data['client_facing_restricted']) ? 'true' : 'false';
        }
        if (array_key_exists('primary_contact_id', $data)) {
            $setClauses[]               = 'primary_contact_id = :primary_contact_id';
            $params[':primary_contact_id'] = isset($data['primary_contact_id']) && $data['primary_contact_id'] !== '' ? (int)$data['primary_contact_id'] : null;
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

        $stmt = $this->db->prepare("UPDATE organizations SET {$setClause} WHERE id = :id");
        return $stmt->execute($params);
    }

    /**
     * Update only the is_active status of an organization.
     */
    public function updateStatus(int $id, bool $isActive): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE organizations SET is_active = :is_active, updated_at = NOW() WHERE id = :id'
        );
        return $stmt->execute([':is_active' => $isActive ? 'true' : 'false', ':id' => $id]);
    }

    /**
     * Fast type-ahead search for organizations.
     *
     * @return array<int, array<string, mixed>>
     */
    public function search(string $q, int $limit = 20): array
    {
        $stmt = $this->db->prepare(
            "SELECT id, name, pan, gstin, email, phone
             FROM organizations
             WHERE is_active = TRUE
               AND (name ILIKE :q OR pan ILIKE :q OR gstin ILIKE :q OR email ILIKE :q)
             ORDER BY name ASC
             LIMIT :limit"
        );
        $stmt->bindValue(':q',     "%{$q}%");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    /**
     * Delete an organization record permanently.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM organizations WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }
}
