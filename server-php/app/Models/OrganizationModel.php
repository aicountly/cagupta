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
     * `type` is a PostgreSQL keyword; quote the column in SQL fragments.
     */
    private static function sqlColumn(string $field): string
    {
        return $field === 'type' ? '"type"' : $field;
    }

    /**
     * Bind parameters with correct PDO types (booleans for PG BOOL, etc.).
     *
     * @param array<string, mixed> $params
     */
    private function executeWithTypedBindings(\PDOStatement $stmt, array $params): bool
    {
        foreach ($params as $name => $value) {
            if ($value === null) {
                $stmt->bindValue($name, null, PDO::PARAM_NULL);
            } elseif (is_bool($value)) {
                $stmt->bindValue($name, $value, PDO::PARAM_BOOL);
            } elseif (is_int($value)) {
                $stmt->bindValue($name, $value, PDO::PARAM_INT);
            } else {
                $stmt->bindValue($name, $value);
            }
        }

        return $stmt->execute();
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
                             NULL) AS primary_contact_name,
                    cg.name AS group_name
             FROM organizations o
             LEFT JOIN users u ON u.id = o.created_by
             LEFT JOIN clients pc ON pc.id = o.primary_contact_id
             LEFT JOIN client_groups cg ON cg.id = o.group_id
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
                                   OR o.pan ILIKE :search OR o.cin ILIKE :search OR o.email ILIKE :search)";
            $params[':search'] = "%{$search}%";
        }
        if ($status !== '' && in_array($status, ['active', 'inactive', 'prospect'], true)) {
            $where[]                 = 'o.organization_status = :org_status';
            $params[':org_status'] = $status;
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
                             NULL) AS primary_contact_name,
                    cg.name AS group_name
             FROM organizations o
             LEFT JOIN users u ON u.id = o.created_by
             LEFT JOIN clients pc ON pc.id = o.primary_contact_id
             LEFT JOIN client_groups cg ON cg.id = o.group_id
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
                name, "type", gstin, pan, cin, email, secondary_email, phone, secondary_phone,
                address, city, state, country, pincode, website, notes,
                reference, group_id, primary_contact_id, organization_status, is_active, created_by,
                referring_affiliate_user_id, referral_start_date, commission_mode, client_facing_restricted
             ) VALUES (
                :name, :type, :gstin, :pan, :cin, :email, :secondary_email, :phone, :secondary_phone,
                :address, :city, :state, :country, :pincode, :website, :notes,
                :reference, :group_id, :primary_contact_id, :organization_status, :is_active, :created_by,
                :referring_affiliate_user_id, :referral_start_date, :commission_mode, :client_facing_restricted
             ) RETURNING id'
        );
        $refAff = isset($data['referring_affiliate_user_id']) ? (int)$data['referring_affiliate_user_id'] : 0;
        $this->executeWithTypedBindings($stmt, [
            ':name'               => $data['name'],
            ':type'               => $data['type']       ?? null,
            ':gstin'              => $data['gstin']      ?? null,
            ':pan'                => $data['pan']        ?? null,
            ':cin'                => $data['cin']        ?? null,
            ':email'              => $data['email']      ?? null,
            ':secondary_email'    => $data['secondary_email'] ?? null,
            ':phone'              => $data['phone']      ?? null,
            ':secondary_phone'    => $data['secondary_phone'] ?? null,
            ':address'            => $data['address']    ?? null,
            ':city'               => $data['city']       ?? null,
            ':state'              => $data['state']      ?? null,
            ':country'            => $data['country']    ?? 'India',
            ':pincode'            => $data['pincode']    ?? null,
            ':website'            => $data['website']    ?? null,
            ':notes'              => $data['notes']      ?? null,
            ':reference'          => $data['reference']  ?? null,
            ':group_id'           => self::optionalPositiveInt($data['group_id'] ?? null),
            ':primary_contact_id' => self::optionalPositiveInt($data['primary_contact_id'] ?? null),
            ':organization_status' => $data['organization_status'] ?? 'active',
            ':is_active'          => (bool)($data['is_active'] ?? true),
            ':created_by'         => $data['created_by'] ?? null,
            ':referring_affiliate_user_id' => $refAff > 0 ? $refAff : null,
            ':referral_start_date' => !empty($data['referral_start_date']) ? $data['referral_start_date'] : null,
            ':commission_mode'     => $data['commission_mode'] ?? 'referral_only',
            ':client_facing_restricted' => (bool)($data['client_facing_restricted'] ?? false),
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
            'name', 'type', 'gstin', 'pan', 'cin', 'email', 'secondary_email', 'phone', 'secondary_phone',
            'address', 'city', 'state', 'country', 'pincode', 'website', 'notes', 'reference',
            'referral_start_date', 'commission_mode', 'organization_status',
        ];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $col                 = self::sqlColumn($field);
                $setClauses[]        = "{$col} = :{$field}";
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
            $params[':client_facing_restricted'] = (bool) $data['client_facing_restricted'];
        }
        if (array_key_exists('primary_contact_id', $data)) {
            $setClauses[]                   = 'primary_contact_id = :primary_contact_id';
            $params[':primary_contact_id'] = self::optionalPositiveInt($data['primary_contact_id'] ?? null);
        }
        if (array_key_exists('is_active', $data)) {
            $setClauses[]       = 'is_active = :is_active';
            $params[':is_active'] = (bool) $data['is_active'];
        }
        if (array_key_exists('group_id', $data)) {
            $setClauses[]        = 'group_id = :group_id';
            $params[':group_id'] = self::optionalPositiveInt($data['group_id'] ?? null);
        }

        if (empty($setClauses)) {
            // #region agent log
            foreach ([dirname(__DIR__, 3), dirname(__DIR__, 2)] as $dir) {
                $p = $dir . DIRECTORY_SEPARATOR . 'debug-a4583e.log';
                @file_put_contents($p, json_encode([
                'sessionId'    => 'a4583e',
                'hypothesisId' => 'H_empty_set',
                'location'     => 'OrganizationModel.php:update',
                'message'      => 'no SET clauses; update skipped',
                'data'         => ['id' => $id, 'incomingKeys' => array_keys($data)],
                'timestamp'    => (int) round(microtime(true) * 1000),
                ], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);
            }
            // #endregion
            return false;
        }

        $setClauses[] = 'updated_at = NOW()';
        $setClause    = implode(', ', $setClauses);

        $stmt = $this->db->prepare("UPDATE organizations SET {$setClause} WHERE id = :id");
        // #region agent log
        $line = json_encode([
            'sessionId'    => 'a4583e',
            'hypothesisId' => 'H_model_execute',
            'location'     => 'OrganizationModel.php:update:before_execute',
            'message'      => 'about to execute org UPDATE',
            'data'         => ['id' => $id, 'setFields' => array_map(static function (string $c): string {
                return trim(explode('=', $c)[0] ?? '');
            }, array_slice($setClauses, 0, -1))],
            'timestamp'    => (int) round(microtime(true) * 1000),
        ], JSON_UNESCAPED_UNICODE) . "\n";
        foreach ([dirname(__DIR__, 3), dirname(__DIR__, 2)] as $dir) {
            @file_put_contents($dir . DIRECTORY_SEPARATOR . 'debug-a4583e.log', $line, FILE_APPEND);
        }
        // #endregion
        return $this->executeWithTypedBindings($stmt, $params);
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
     * Update only the is_active status of an organization.
     */
    public function updateStatus(int $id, bool $isActive): bool
    {
        $orgStatus = $isActive ? 'active' : 'inactive';
        $stmt      = $this->db->prepare(
            'UPDATE organizations SET is_active = :is_active, organization_status = :organization_status, updated_at = NOW() WHERE id = :id'
        );

        return $this->executeWithTypedBindings($stmt, [
            ':is_active'            => $isActive,
            ':organization_status' => $orgStatus,
            ':id'                   => $id,
        ]);
    }

    /**
     * Fast type-ahead search for organizations.
     *
     * @return array<int, array<string, mixed>>
     */
    public function search(string $q, int $limit = 20): array
    {
        $stmt = $this->db->prepare(
            "SELECT id, name, pan, gstin, cin, email, phone
             FROM organizations
             WHERE is_active = TRUE
               AND (name ILIKE :q OR pan ILIKE :q OR gstin ILIKE :q OR cin ILIKE :q OR email ILIKE :q)
             ORDER BY name ASC
             LIMIT :limit"
        );
        $stmt->bindValue(':q',     "%{$q}%");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    /**
     * Find another organization that already uses the same PAN, GSTIN, or CIN (case-insensitive, trimmed).
     * Empty-string inputs are ignored (not compared).
     *
     * @return array<string, mixed>|null Row with id, name, pan, gstin, cin, city, state or null if no conflict.
     */
    public function findConflictingByIdentifiers(string $pan, string $gstin, string $cin, ?int $excludeOrgId): ?array
    {
        $clauses = [];
        $params  = [];

        if ($pan !== '') {
            $clauses[]              = "NULLIF(TRIM(UPPER(COALESCE(pan, ''))), '') = :match_pan";
            $params[':match_pan'] = $pan;
        }
        if ($gstin !== '') {
            $clauses[]                 = "NULLIF(TRIM(UPPER(COALESCE(gstin, ''))), '') = :match_gstin";
            $params[':match_gstin'] = $gstin;
        }
        if ($cin !== '') {
            $clauses[]              = "NULLIF(TRIM(UPPER(COALESCE(cin, ''))), '') = :match_cin";
            $params[':match_cin'] = $cin;
        }

        if ($clauses === []) {
            return null;
        }

        $where = '(' . implode(' OR ', $clauses) . ')';
        if ($excludeOrgId !== null) {
            $where .= ' AND id <> :exclude_id';
            $params[':exclude_id'] = $excludeOrgId;
        }

        $sql  = "SELECT id, name, pan, gstin, cin, city, state FROM organizations WHERE {$where} LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * Delete an organization record permanently.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM organizations WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }

    /**
     * @return list<string>
     */
    public static function exceptionReportAllowedKeys(): array
    {
        return ['gstin', 'pan', 'cin', 'email', 'website'];
    }

    /**
     * Paginated organizations where ANY selected field is missing.
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
            $where[] = 'o.is_active = true';
        }

        $orParts = [];
        $colMap  = [
            'gstin'   => 'o.gstin',
            'pan'     => 'o.pan',
            'cin'     => 'o.cin',
            'email'   => 'o.email',
            'website' => 'o.website',
        ];
        foreach ($missingKeys as $key) {
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
            "SELECT COUNT(*) FROM organizations o WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT o.id, o.name, o.email, o.pan, o.gstin, o.cin, o.website, o.is_active,
                    cg.name AS group_name
             FROM organizations o
             LEFT JOIN client_groups cg ON cg.id = o.group_id
             WHERE {$whereClause}
             ORDER BY o.created_at DESC
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
            $row['missing_fields'] = self::computeMissingOrgFields($row, $missingKeys);
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
    private static function computeMissingOrgFields(array $row, array $keys): array
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
