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
                    phone,
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
     * Find another client with the same normalized PAN (trim + uppercase).
     * Empty PAN is not considered; callers should skip when $normalizedPan is ''.
     *
     * @return array<string, mixed>|null  id, first_name, last_name, organization_name, pan, email, phone
     */
    public function findOtherByPan(string $normalizedPan, ?int $excludeClientId = null): ?array
    {
        $pan = strtoupper(trim($normalizedPan));
        if ($pan === '') {
            return null;
        }

        $sql = 'SELECT id, first_name, last_name, organization_name, pan, email, phone
                FROM clients
                WHERE UPPER(TRIM(pan)) = :pan
                  AND pan IS NOT NULL
                  AND TRIM(pan) <> \'\'';
        $params = [':pan' => $pan];
        if ($excludeClientId !== null && $excludeClientId > 0) {
            $sql .= ' AND id <> :exclude';
            $params[':exclude'] = $excludeClientId;
        }
        $sql .= ' LIMIT 1';

        $stmt = $this->db->prepare($sql);
        $stmt->bindValue(':pan', $pan);
        if (isset($params[':exclude'])) {
            $stmt->bindValue(':exclude', $params[':exclude'], PDO::PARAM_INT);
        }
        $stmt->execute();
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * Find a client by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT c.*, u.name AS created_by_name, cg.name AS group_name
             FROM clients c
             LEFT JOIN users u ON u.id = c.created_by
             LEFT JOIN client_groups cg ON cg.id = c.group_id
             WHERE c.id = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }

        try {
            $linkedOrgs              = $this->getLinkedOrgs($row['id']);
            $row['linked_org_ids']   = array_column($linkedOrgs, 'id');
            $row['linked_org_names'] = array_column($linkedOrgs, 'name');
        } catch (\Throwable $e) {
            error_log('[ClientModel] Linked orgs fetch failed for client ' . $row['id'] . ': ' . $e->getMessage());
            $row['linked_org_ids']   = [];
            $row['linked_org_names'] = [];
        }

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
            $where[]                  = 'c.contact_status = :contact_status';
            $params[':contact_status'] = $status;
        }

        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM clients c WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT c.*, u.name AS created_by_name, cg.name AS group_name
             FROM clients c
             LEFT JOIN users u ON u.id = c.created_by
             LEFT JOIN client_groups cg ON cg.id = c.group_id
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
            try {
                $contactIds   = array_map('intval', array_column($clients, 'id'));
                // Safe: IDs are already cast to int via intval(), no SQL injection risk
                $placeholders = implode(',', $contactIds);

                $orgStmt = $this->db->query(
                    "SELECT co.contact_id, o.id AS org_id, o.name AS org_name
                     FROM contact_organization co
                     JOIN organizations o ON o.id = co.organization_id
                     WHERE co.contact_id IN ({$placeholders})
                     ORDER BY o.name ASC"
                );
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
            } catch (\Throwable $e) {
                error_log('[ClientModel] Linked orgs batch-fetch failed: ' . $e->getMessage());
                foreach ($clients as &$client) {
                    $client['linked_org_ids']   = [];
                    $client['linked_org_names'] = [];
                }
                unset($client);
            }
        }

        return ['total' => $total, 'clients' => $clients];
    }

    /**
     * @param mixed $status   Raw contact_status from API / form.
     * @param mixed $isActive Fallback when $status is empty / unknown.
     */
    private static function normalizeContactStatus($status, $isActive = true): string
    {
        $s = is_string($status) ? strtolower(trim($status)) : '';
        if ($s === 'inactive' || $s === 'prospect' || $s === 'active') {
            return $s;
        }

        return ((bool)$isActive) ? 'active' : 'inactive';
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
                email, secondary_email, phone, secondary_phone, pan, gstin, website,
                address_line1, address_line2, city, state, pincode, country,
                notes, reference, group_id, is_active, contact_status, created_by,
                referring_affiliate_user_id, referral_start_date, commission_mode, client_facing_restricted
             ) VALUES (
                :type, :first_name, :last_name, :organization_name,
                :email, :secondary_email, :phone, :secondary_phone, :pan, :gstin, :website,
                :address_line1, :address_line2, :city, :state, :pincode, :country,
                :notes, :reference, :group_id, :is_active, :contact_status, :created_by,
                :referring_affiliate_user_id, :referral_start_date, :commission_mode, :client_facing_restricted
             ) RETURNING id'
        );
        $refAff = isset($data['referring_affiliate_user_id']) ? (int)$data['referring_affiliate_user_id'] : 0;
        $contactStatus = self::normalizeContactStatus($data['contact_status'] ?? null, $data['is_active'] ?? true);
        $stmt->execute([
            ':type'              => $data['type']              ?? 'individual',
            ':first_name'        => $data['first_name']        ?? null,
            ':last_name'         => $data['last_name']         ?? null,
            ':organization_name' => $data['organization_name'] ?? null,
            ':email'             => $data['email']             ?? null,
            ':secondary_email'   => $data['secondary_email']   ?? null,
            ':phone'             => $data['phone']             ?? null,
            ':secondary_phone'   => $data['secondary_phone']   ?? null,
            ':pan'               => $data['pan']               ?? null,
            ':gstin'             => $data['gstin']             ?? null,
            ':website'           => $data['website']           ?? null,
            ':address_line1'     => $data['address_line1']     ?? null,
            ':address_line2'     => $data['address_line2']     ?? null,
            ':city'              => $data['city']              ?? null,
            ':state'             => $data['state']             ?? null,
            ':pincode'           => $data['pincode']           ?? null,
            ':country'           => $data['country']           ?? 'India',
            ':notes'             => $data['notes']             ?? null,
            ':reference'         => $data['reference']         ?? null,
            ':group_id'          => self::optionalPositiveInt($data['group_id'] ?? null),
            ':is_active'         => ($contactStatus !== 'inactive') ? 'true' : 'false',
            ':contact_status'    => $contactStatus,
            ':created_by'        => $data['created_by']        ?? null,
            ':referring_affiliate_user_id' => $refAff > 0 ? $refAff : null,
            ':referral_start_date' => !empty($data['referral_start_date']) ? $data['referral_start_date'] : null,
            ':commission_mode'     => $data['commission_mode'] ?? 'referral_only',
            ':client_facing_restricted' => ((bool)($data['client_facing_restricted'] ?? false)) ? 'true' : 'false',
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
            'email', 'secondary_email', 'phone', 'secondary_phone', 'pan', 'gstin', 'website',
            'address_line1', 'address_line2', 'city', 'state', 'pincode', 'country',
            'notes', 'reference',
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
        if (array_key_exists('contact_status', $data)) {
            $cs                        = self::normalizeContactStatus($data['contact_status'], true);
            $setClauses[]              = 'contact_status = :contact_status';
            $params[':contact_status'] = $cs;
            $setClauses[]              = 'is_active = :is_active_sync';
            $params[':is_active_sync']  = ($cs !== 'inactive') ? 'true' : 'false';
        } elseif (array_key_exists('is_active', $data)) {
            $active               = (bool)$data['is_active'];
            $setClauses[]         = 'is_active = :is_active';
            $params[':is_active'] = $active ? 'true' : 'false';
            $setClauses[]         = 'contact_status = :contact_status_ia';
            $params[':contact_status_ia'] = $active ? 'active' : 'inactive';
        }
        if (array_key_exists('group_id', $data)) {
            $setClauses[]        = 'group_id = :group_id';
            $params[':group_id'] = self::optionalPositiveInt($data['group_id'] ?? null);
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
            'UPDATE clients SET is_active = :is_active,
                contact_status = :contact_status,
                updated_at = NOW() WHERE id = :id'
        );
        return $stmt->execute([
            ':is_active'        => $isActive ? 'true' : 'false',
            ':contact_status'   => $isActive ? 'active' : 'inactive',
            ':id'               => $id,
        ]);
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
        $ids = array_values(array_unique(array_filter(
            array_map(static fn($x) => (int)$x, $orgIds),
            static fn(int $id) => $id > 0
        )));

        $this->db->beginTransaction();
        try {
            $del = $this->db->prepare('DELETE FROM contact_organization WHERE contact_id = :cid');
            $del->execute([':cid' => $clientId]);

            if ($ids !== []) {
                // Plain INSERT: after DELETE there are no rows for this contact, so no
                // duplicate pairs. Avoids ON CONFLICT, which fails if UNIQUE is missing on prod.
                $ins = $this->db->prepare(
                    'INSERT INTO contact_organization (contact_id, organization_id) VALUES (:cid, :oid)'
                );
                foreach ($ids as $orgId) {
                    $ins->execute([':cid' => $clientId, ':oid' => $orgId]);
                }
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
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
     * @param mixed $v Raw JSON / form value (may be 0, "0", "", null).
     */
    private static function optionalPositiveInt(mixed $v): ?int
    {
        if ($v === null || $v === '' || $v === false) {
            return null;
        }
        $n = (int)$v;

        return $n > 0 ? $n : null;
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

    /**
     * Allowed keys for contact exception reports (subset of columns).
     *
     * @return list<string>
     */
    public static function exceptionReportAllowedKeys(): array
    {
        return ['gstin', 'pan', 'email', 'website'];
    }

    /**
     * Paginated contacts where ANY selected field is missing (NULL or blank).
     *
     * @param list<string> $missingKeys validated keys from exceptionReportAllowedKeys()
     *
     * @return array{total: int, rows: array<int, array<string, mixed>>}
     */
    public function exceptionPaginate(
        int $page,
        int $perPage,
        array $missingKeys,
        bool $activeOnly = true
    ): array {
        $where  = [];
        $params = [];

        if ($activeOnly) {
            $where[] = 'c.is_active = true';
        }

        $orParts = [];
        $colMap  = [
            'gstin'   => 'c.gstin',
            'pan'     => 'c.pan',
            'email'   => 'c.email',
            'website' => 'c.website',
        ];
        foreach ($missingKeys as $i => $key) {
            $col = $colMap[$key] ?? null;
            if ($col === null) {
                continue;
            }
            $orParts[] = "({$col} IS NULL OR TRIM({$col}) = '')";
        }
        if ($orParts === []) {
            return ['total' => 0, 'rows' => []];
        }
        $where[] = '(' . implode(' OR ', $orParts) . ')';
        $whereClause = implode(' AND ', $where);

        $offset = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM clients c WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT c.id, c.first_name, c.last_name, c.organization_name,
                    c.email, c.pan, c.gstin, c.website, c.is_active, c.contact_status,
                    cg.name AS group_name
             FROM clients c
             LEFT JOIN client_groups cg ON cg.id = c.group_id
             WHERE {$whereClause}
             ORDER BY c.created_at DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();

        foreach ($rows as &$row) {
            $row['display_name'] = self::displayName($row);
            $row['missing_fields'] = self::computeMissingFields($row, $missingKeys);
        }
        unset($row);

        return ['total' => $total, 'rows' => $rows];
    }

    /**
     * @param array<string, mixed> $row
     * @param list<string>         $keys
     *
     * @return list<string>
     */
    private static function computeMissingFields(array $row, array $keys): array
    {
        $out = [];
        foreach ($keys as $key) {
            $v = $row[$key] ?? null;
            if ($v === null || (is_string($v) && trim($v) === '')) {
                $out[] = $key;
            }
        }

        return $out;
    }
}
