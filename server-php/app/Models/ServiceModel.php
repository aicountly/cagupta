<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * ServiceModel — CRUD operations for the `services` table.
 */
class ServiceModel
{
    private PDO $db;

    /** Subselects for assignee list (expects main table alias `s` = services). */
    private const SQL_ASSIGNEE_IDS_JSON = <<<'SQL'
(SELECT COALESCE(json_agg(sa.user_id ORDER BY u_asg.name NULLS LAST), '[]'::json)::text
 FROM service_assignees sa
 JOIN users u_asg ON u_asg.id = sa.user_id
 WHERE sa.service_id = s.id)
SQL;

    private const SQL_ASSIGNEE_NAMES_AGG = <<<'SQL'
(COALESCE(
  NULLIF((SELECT string_agg(u_asg2.name::text, ', ' ORDER BY u_asg2.name)
          FROM service_assignees sa2
          JOIN users u_asg2 ON u_asg2.id = sa2.user_id
          WHERE sa2.service_id = s.id), ''),
  NULL::text
))
SQL;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Find a service by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $aid = self::SQL_ASSIGNEE_IDS_JSON;
        $an  = self::SQL_ASSIGNEE_NAMES_AGG;
        $stmt = $this->db->prepare(
            "SELECT s.*,
                    c.first_name, c.last_name, c.organization_name,
                    COALESCE(c.organization_name,
                             NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                             o.name,
                             s.client_name,
                             'Unknown') AS client_name,
                    u.name AS assigned_to_name,
                    cb.name AS created_by_name,
                    {$aid} AS assignee_user_ids_json,
                    {$an} AS assignee_names_agg
             FROM services s
             LEFT JOIN clients c         ON c.id = s.client_id
             LEFT JOIN organizations o ON o.id = s.organization_id
             LEFT JOIN users   u       ON u.id = s.assigned_to
             LEFT JOIN users   cb      ON cb.id = s.created_by
             WHERE s.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        return $row ? $this->attachAssigneeFields($row) : null;
    }

    /**
     * Return a paginated list of services.
     *
     * @return array{total: int, services: array<int, array<string, mixed>>}
     */
    public function paginate(
        int    $page    = 1,
        int    $perPage = 20,
        string $search  = '',
        string $status  = '',
        int    $clientId = 0,
        int    $orgId    = 0,
        ?int   $actorUserId = null,
        bool   $isSuperAdmin = false,
        ?int   $scopeUserId = null
    ): array {
        $where  = ['1=1'];
        $params = [];

        if ($search !== '') {
            $where[]           = "(s.service_type ILIKE :search
                                   OR c.first_name ILIKE :search
                                   OR c.last_name  ILIKE :search
                                   OR c.organization_name ILIKE :search
                                   OR o.name ILIKE :search
                                   OR s.client_name ILIKE :search)";
            $params[':search'] = "%{$search}%";
        }
        if ($status !== '' && strtolower($status) !== 'all') {
            $where[]           = 's.status = :status';
            $params[':status'] = $status;
        }
        if ($clientId > 0) {
            $where[]              = 's.client_id = :filter_client_id';
            $params[':filter_client_id'] = $clientId;
        }
        if ($orgId > 0) {
            $where[]              = 's.organization_id = :filter_org_id';
            $params[':filter_org_id'] = $orgId;
        }
        $this->applyServiceVisibilityScope($where, $params, $actorUserId, $isSuperAdmin, $scopeUserId, 's');

        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*)
             FROM services s
             LEFT JOIN clients c         ON c.id = s.client_id
             LEFT JOIN organizations o ON o.id = s.organization_id
             WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $aid = self::SQL_ASSIGNEE_IDS_JSON;
        $an  = self::SQL_ASSIGNEE_NAMES_AGG;
        $stmt = $this->db->prepare(
            "SELECT s.*,
                    COALESCE(c.organization_name,
                             NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                             o.name,
                             s.client_name,
                             'Unknown') AS client_name,
                    u.name AS assigned_to_name,
                    {$aid} AS assignee_user_ids_json,
                    {$an} AS assignee_names_agg
             FROM services s
             LEFT JOIN clients c         ON c.id = s.client_id
             LEFT JOIN organizations o ON o.id = s.organization_id
             LEFT JOIN users   u       ON u.id = s.assigned_to
             WHERE {$whereClause}
             ORDER BY s.created_at DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit',  $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset,  PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();
        foreach ($rows as $i => $r) {
            $rows[$i] = $this->attachAssigneeFields($r);
        }

        return ['total' => $total, 'services' => $rows];
    }

    /**
     * @param array<int, string>            $where
     * @param array<string, int|string>     $params
     */
    private function applyServiceVisibilityScope(
        array &$where,
        array &$params,
        ?int $actorUserId,
        bool $isSuperAdmin,
        ?int $scopeUserId,
        string $serviceAlias = 's'
    ): void {
        $scopedUserId = null;
        if ($isSuperAdmin) {
            if ($scopeUserId !== null && $scopeUserId > 0) {
                $scopedUserId = $scopeUserId;
            }
        } elseif ($actorUserId !== null && $actorUserId > 0) {
            $scopedUserId = $actorUserId;
        }
        if ($scopedUserId === null) {
            return;
        }

        $where[] = "(
            {$serviceAlias}.assigned_to = :scope_uid
            OR EXISTS (
                SELECT 1 FROM service_assignees sa_scope
                WHERE sa_scope.service_id = {$serviceAlias}.id
                  AND sa_scope.user_id = :scope_uid
            )
        )";
        $params[':scope_uid'] = $scopedUserId;
    }

    /**
     * Replace junction rows and sync legacy `services.assigned_to` to the first assignee (or null).
     *
     * @param array<int> $userIds Unique staff user ids (positive integers).
     */
    public function replaceAssignees(int $serviceId, array $userIds): void
    {
        $seen = [];
        $clean = [];
        foreach ($userIds as $uid) {
            $n = (int)$uid;
            if ($n <= 0 || isset($seen[$n])) {
                continue;
            }
            $seen[$n] = true;
            $clean[] = $n;
        }

        $this->db->beginTransaction();
        try {
            $del = $this->db->prepare('DELETE FROM service_assignees WHERE service_id = :sid');
            $del->execute([':sid' => $serviceId]);

            $ins = $this->db->prepare(
                'INSERT INTO service_assignees (service_id, user_id) VALUES (:sid, :uid)'
            );
            foreach ($clean as $uid) {
                $ins->execute([':sid' => $serviceId, ':uid' => $uid]);
            }

            $lead = $clean[0] ?? null;
            $upd = $this->db->prepare(
                'UPDATE services SET assigned_to = :a, updated_at = NOW() WHERE id = :id'
            );
            $upd->execute([':a' => $lead, ':id' => $serviceId]);

            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function attachAssigneeFields(array $row): array
    {
        $json = $row['assignee_user_ids_json'] ?? null;
        unset($row['assignee_user_ids_json']);

        $ids = [];
        if (is_string($json) && $json !== '') {
            $decoded = json_decode($json, true);
            if (is_array($decoded)) {
                foreach ($decoded as $id) {
                    if (is_numeric($id)) {
                        $ids[] = (int)$id;
                    }
                }
            }
        }
        $row['assignee_user_ids'] = $ids;

        $namesAgg = isset($row['assignee_names_agg']) ? trim((string)$row['assignee_names_agg']) : '';
        unset($row['assignee_names_agg']);
        if ($namesAgg === '' && !empty($row['assigned_to_name'])) {
            $namesAgg = (string)$row['assigned_to_name'];
        }
        $row['assignee_names'] = $namesAgg;

        return $row;
    }

    /**
     * Create a new service record.
     *
     * @param array<string, mixed> $data
     * @return int The new service's id.
     */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO services (
                client_id, organization_id, service_type, description,
                financial_year, due_date, status, priority, assigned_to,
                fees, notes, created_by,
                client_type, client_name,
                category_id, category_name,
                subcategory_id, subcategory_name,
                engagement_type_id, engagement_type_name,
                tasks,
                referring_affiliate_user_id, referral_start_date, commission_mode, client_facing_restricted
             ) VALUES (
                :client_id, :organization_id, :service_type, :description,
                :financial_year, :due_date, :status, :priority, :assigned_to,
                :fees, :notes, :created_by,
                :client_type, :client_name,
                :category_id, :category_name,
                :subcategory_id, :subcategory_name,
                :engagement_type_id, :engagement_type_name,
                :tasks,
                :referring_affiliate_user_id, :referral_start_date, :commission_mode, :client_facing_restricted
             ) RETURNING id'
        );
        $params = [
            ':client_id'           => $data['client_id']           ?? null,
            ':organization_id'     => $data['organization_id']     ?? null,
            ':service_type'        => $data['service_type']        ?? null,
            ':description'         => $data['description']         ?? null,
            ':financial_year'      => $data['financial_year']      ?? null,
            ':due_date'            => $data['due_date']            ?? null,
            ':status'              => $data['status']              ?? 'not_started',
            ':priority'            => $data['priority']            ?? 'medium',
            ':assigned_to'         => $data['assigned_to']         ?? null,
            ':fees'                => $data['fees']                ?? null,
            ':notes'               => $data['notes']               ?? null,
            ':created_by'          => $data['created_by']          ?? null,
            ':client_type'         => $data['client_type']         ?? 'contact',
            ':client_name'         => $data['client_name']         ?? null,
            ':category_id'         => $data['category_id']         ?? null,
            ':category_name'       => $data['category_name']       ?? null,
            ':subcategory_id'      => $data['subcategory_id']      ?? null,
            ':subcategory_name'    => $data['subcategory_name']    ?? null,
            ':engagement_type_id'  => $data['engagement_type_id']  ?? null,
            ':engagement_type_name'=> $data['engagement_type_name'] ?? null,
            ':tasks'               => isset($data['tasks']) ? json_encode($data['tasks']) : '[]',
            ':referring_affiliate_user_id' => isset($data['referring_affiliate_user_id']) && (int)$data['referring_affiliate_user_id'] > 0
                ? (int)$data['referring_affiliate_user_id'] : null,
            ':referral_start_date' => !empty($data['referral_start_date']) ? $data['referral_start_date'] : null,
            ':commission_mode'     => $data['commission_mode'] ?? 'referral_only',
            ':client_facing_restricted' => !empty($data['client_facing_restricted']) ? 'true' : 'false',
        ];
        $stmt->execute($params);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Update an existing service.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $setClauses = [];
        $params     = [':id' => $id];

        $allowed = [
            'status', 'assigned_to', 'due_date', 'fees', 'notes', 'priority', 'service_type', 'financial_year',
        ];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $setClauses[]       = "{$field} = :{$field}";
                $params[":{$field}"] = $data[$field];
            }
        }
        if (array_key_exists('client_facing_restricted', $data)) {
            $setClauses[]                       = 'client_facing_restricted = :client_facing_restricted';
            $params[':client_facing_restricted'] = ((bool)$data['client_facing_restricted']) ? 'true' : 'false';
        }
        if (array_key_exists('tasks', $data)) {
            $setClauses[]    = 'tasks = :tasks';
            $params[':tasks'] = json_encode($data['tasks']);
        }

        if (empty($setClauses)) {
            return false;
        }

        $setClauses[] = 'updated_at = NOW()';
        $setClause    = implode(', ', $setClauses);

        $stmt = $this->db->prepare("UPDATE services SET {$setClause} WHERE id = :id");
        return $stmt->execute($params);
    }

    /**
     * Delete a service record permanently.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM services WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }

    /**
     * Find another open engagement (not completed/cancelled) with the same engagement type,
     * same client (contact or organization), and the given staff user on the team or as lead.
     *
     * @return array<string, mixed>|null Service row as from find(), or null if no conflict.
     */
    public function findOpenEngagementConflictForAssignee(
        int $engagementTypeId,
        string $clientType,
        ?int $clientId,
        ?int $organizationId,
        int $assigneeUserId,
        ?int $excludeServiceId
    ): ?array {
        if ($engagementTypeId <= 0 || $assigneeUserId <= 0) {
            return null;
        }

        $ct = strtolower(trim($clientType));
        if ($ct === 'organization') {
            $oid = ($organizationId !== null && $organizationId > 0) ? $organizationId : -1;
            $whereClient = "s.client_type = 'organization' AND s.organization_id = :client_ref";
            $clientRef   = $oid;
        } else {
            $cid = ($clientId !== null && $clientId > 0) ? $clientId : -1;
            $whereClient = "s.client_type = 'contact' AND s.client_id = :client_ref";
            $clientRef   = $cid;
        }

        $excl = ($excludeServiceId !== null && $excludeServiceId > 0) ? $excludeServiceId : -1;

        $sql = "SELECT s.id FROM services s
                WHERE s.engagement_type_id = :etid
                  AND s.status NOT IN ('completed', 'cancelled')
                  AND {$whereClient}
                  AND (
                    s.assigned_to = :uid
                    OR EXISTS (
                      SELECT 1 FROM service_assignees sa
                      WHERE sa.service_id = s.id AND sa.user_id = :uid
                    )
                  )
                  AND (:excl < 0 OR s.id <> :excl)
                LIMIT 1";

        $stmt = $this->db->prepare($sql);
        $stmt->execute([
            ':etid'        => $engagementTypeId,
            ':client_ref' => $clientRef,
            ':uid'        => $assigneeUserId,
            ':excl'       => $excl,
        ]);
        $foundId = $stmt->fetchColumn();
        if ($foundId === false || $foundId === null) {
            return null;
        }

        return $this->find((int)$foundId);
    }

    /**
     * Count service engagements that reference an engagement type.
     */
    public function countByEngagementTypeId(int $engagementTypeId): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) FROM services WHERE engagement_type_id = :eid'
        );
        $stmt->execute([':eid' => $engagementTypeId]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Count service engagements that reference a subcategory.
     */
    public function countBySubcategoryId(int $subcategoryId): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) FROM services WHERE subcategory_id = :sid'
        );
        $stmt->execute([':sid' => $subcategoryId]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Count service engagements tied to a category (directly, via subcategory, or engagement type).
     */
    /**
     * Services linked to an affiliate referrer.
     *
     * @return array{total: int, services: array<int, array<string, mixed>>}
     */
    public function paginateForReferringAffiliate(int $affiliateUserId, int $page = 1, int $perPage = 30): array
    {
        $whereClause = 's.referring_affiliate_user_id = :aid';
        $params      = [':aid' => $affiliateUserId];
        $offset      = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM services s WHERE {$whereClause}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT s.*,
                    COALESCE(c.organization_name,
                             NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                             o.name,
                             s.client_name,
                             'Unknown') AS client_name
             FROM services s
             LEFT JOIN clients c ON c.id = s.client_id
             LEFT JOIN organizations o ON o.id = s.organization_id
             WHERE {$whereClause}
             ORDER BY s.created_at DESC
             LIMIT :limit OFFSET :offset"
        );
        $stmt->bindValue(':aid', $affiliateUserId, PDO::PARAM_INT);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return ['total' => $total, 'services' => $stmt->fetchAll()];
    }

    public function countReferencingCategoryTree(int $categoryId): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) FROM services s
             WHERE (s.category_id IS NOT NULL AND s.category_id = :cid)
                OR (s.subcategory_id IS NOT NULL AND s.subcategory_id IN (
                        SELECT id FROM service_subcategories WHERE category_id = :cid
                    ))
                OR (s.engagement_type_id IS NOT NULL AND s.engagement_type_id IN (
                        SELECT id FROM engagement_types WHERE category_id = :cid
                    ))'
        );
        $stmt->execute([':cid' => $categoryId]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function decodeTasksJson(mixed $tasksRaw): array
    {
        if (is_array($tasksRaw)) {
            return $tasksRaw;
        }
        if (is_string($tasksRaw) && $tasksRaw !== '') {
            $decoded = json_decode($tasksRaw, true);

            return is_array($decoded) ? $decoded : [];
        }

        return [];
    }

    public function tasksAllDone(mixed $tasksRaw): bool
    {
        $tasks = $this->decodeTasksJson($tasksRaw);
        if ($tasks === []) {
            return false;
        }
        foreach ($tasks as $t) {
            if (!is_array($t)) {
                return false;
            }
            $st = isset($t['status']) ? (string)$t['status'] : '';
            if ($st !== 'done') {
                return false;
            }
        }

        return true;
    }

    /**
     * Eligible for billing queue when engagement is completed OR all tasks are done (non-empty task list).
     *
     * @param array<string, mixed> $row
     */
    public function isEligibleForBillingOpen(array $row): bool
    {
        if (($row['status'] ?? '') === 'completed') {
            return true;
        }

        return $this->tasksAllDone($row['tasks'] ?? []);
    }

    /**
     * First time an engagement becomes billable, promote billing_closure from NULL to 'open'.
     */
    public function promoteBillingOpenIfEligible(int $id): void
    {
        $row = $this->find($id);
        if ($row === null) {
            return;
        }
        $bc = $row['billing_closure'] ?? null;
        if ($bc !== null && $bc !== '') {
            return;
        }
        if (!$this->isEligibleForBillingOpen($row)) {
            return;
        }
        $stmt = $this->db->prepare(
            "UPDATE services SET billing_closure = 'open', updated_at = NOW()
             WHERE id = :id AND billing_closure IS NULL"
        );
        $stmt->execute([':id' => $id]);
    }

    /**
     * Sum active, non-cancelled invoice subtotals for a service engagement.
     */
    public function sumInvoiceAmountBilledForService(int $serviceId): float
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(COALESCE(subtotal, amount, 0)), 0)
             FROM txn
             WHERE service_id = :sid
               AND txn_type = 'invoice'
               AND status = 'active'
               AND (invoice_status IS NULL OR invoice_status <> 'cancelled')"
        );
        $stmt->execute([':sid' => $serviceId]);
        $v = $stmt->fetchColumn();

        return round((float)$v, 2);
    }

    /**
     * Paginated billing report with invoice aggregates.
     *
     * @return array{total: int, rows: array<int, array<string, mixed>>}
     */
    public function billingReportPaginate(
        int $page,
        int $perPage,
        string $completion,
        string $closure,
        string $search
    ): array {
        $completion = strtolower(trim($completion));
        if (!in_array($completion, ['engagement', 'tasks', 'any'], true)) {
            $completion = 'any';
        }
        $closure = strtolower(trim($closure));
        if (!in_array($closure, ['pending', 'built', 'non_billable'], true)) {
            $closure = 'pending';
        }

        $completionSql = match ($completion) {
            'engagement' => "s.status = 'completed'",
            'tasks' => "(jsonb_array_length(COALESCE(s.tasks, '[]'::jsonb)) > 0 AND NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(s.tasks, '[]'::jsonb)) el
                WHERE COALESCE(el->>'status', '') <> 'done'
            ))",
            default => "(s.status = 'completed' OR (
                jsonb_array_length(COALESCE(s.tasks, '[]'::jsonb)) > 0 AND NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(COALESCE(s.tasks, '[]'::jsonb)) el
                    WHERE COALESCE(el->>'status', '') <> 'done'
                )
            ))",
        };

        $closureSql = match ($closure) {
            'built' => "s.billing_closure = 'built'",
            'non_billable' => "s.billing_closure = 'non_billable'",
            default => "s.billing_closure = 'open'",
        };

        $where  = ['1=1', '(' . $completionSql . ')', '(' . $closureSql . ')'];
        $params = [];

        if ($search !== '') {
            $where[]          = "(s.service_type ILIKE :search
                OR COALESCE(c.organization_name,
                    NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                    o.name,
                    s.client_name,
                    '') ILIKE :search)";
            $params[':search'] = '%' . $search . '%';
        }

        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $from = "FROM services s
            LEFT JOIN clients c ON c.id = s.client_id
            LEFT JOIN organizations o ON o.id = s.organization_id
            LEFT JOIN (
                SELECT t.service_id AS sid,
                    COUNT(*)::int AS invoice_count,
                    COALESCE(SUM(COALESCE(t.subtotal, t.amount, 0)), 0) AS amount_billed
                FROM txn t
                WHERE t.txn_type = 'invoice'
                  AND t.status = 'active'
                  AND (t.invoice_status IS NULL OR t.invoice_status <> 'cancelled')
                  AND t.service_id IS NOT NULL
                GROUP BY t.service_id
            ) inv ON inv.sid = s.id
            WHERE {$whereClause}";

        $countStmt = $this->db->prepare("SELECT COUNT(*) {$from}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $sql = "SELECT s.*,
                COALESCE(inv.invoice_count, 0)::int AS invoice_count,
                COALESCE(inv.amount_billed, 0) AS amount_billed,
                (s.status = 'completed') AS engagement_completed,
                (CASE WHEN jsonb_array_length(COALESCE(s.tasks, '[]'::jsonb)) > 0 AND NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(COALESCE(s.tasks, '[]'::jsonb)) el
                    WHERE COALESCE(el->>'status', '') <> 'done'
                ) THEN TRUE ELSE FALSE END) AS all_tasks_done,
                COALESCE(c.organization_name,
                    NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                    o.name,
                    s.client_name,
                    'Unknown') AS display_client_name
            {$from}
            ORDER BY s.updated_at DESC NULLS LAST, s.id DESC
            LIMIT :limit OFFSET :offset";

        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();

        return ['total' => $total, 'rows' => $rows];
    }

    /**
     * Invoice txn rows linked to a service (for history modal).
     *
     * @return array<int, array<string, mixed>>
     */
    public function listBillingInvoiceTxns(int $serviceId): array
    {
        $stmt = $this->db->prepare(
            "SELECT id, invoice_number, txn_date, subtotal, amount, narration, invoice_status, txn_type, status
             FROM txn
             WHERE service_id = :sid
               AND txn_type = 'invoice'
               AND status = 'active'
             ORDER BY txn_date DESC, id DESC"
        );
        $stmt->execute([':sid' => $serviceId]);

        return $stmt->fetchAll();
    }

    /**
     * Mark billing closure from open → built or non_billable.
     *
     * @return array<string, mixed>|null Updated service row or null if not found / invalid state.
     */
    public function applyBillingClosure(int $id, string $closure, ?string $reason): ?array
    {
        $closure = strtolower(trim($closure));
        if (!in_array($closure, ['built', 'non_billable'], true)) {
            return null;
        }
        $row = $this->find($id);
        if ($row === null) {
            return null;
        }
        if (($row['billing_closure'] ?? null) !== 'open') {
            return null;
        }

        if ($closure === 'built') {
            $sum = $this->sumInvoiceAmountBilledForService($id);
            $stmt = $this->db->prepare(
                "UPDATE services SET
                    billing_closure = 'built',
                    billing_built_at = NOW(),
                    billing_built_amount = :amt,
                    updated_at = NOW()
                 WHERE id = :id AND billing_closure = 'open'"
            );
            $stmt->execute([':id' => $id, ':amt' => $sum]);
        } else {
            $stmt = $this->db->prepare(
                "UPDATE services SET
                    billing_closure = 'non_billable',
                    non_billable_at = NOW(),
                    non_billable_reason = :reason,
                    updated_at = NOW()
                 WHERE id = :id AND billing_closure = 'open'"
            );
            $stmt->execute([
                ':id'     => $id,
                ':reason' => ($reason !== null && trim($reason) !== '') ? trim($reason) : null,
            ]);
        }

        return $this->find($id);
    }

    /**
     * Referral start date for commission tiers: client/org master, then legacy service column, then fallback.
     *
     * @param array<string, mixed> $service
     */
    public function resolveReferralStartDateForCommission(array $service, string $fallbackDate): string
    {
        $clientType = strtolower(trim((string)($service['client_type'] ?? 'contact')));
        $cid        = (int)($service['client_id'] ?? 0);
        $oid        = (int)($service['organization_id'] ?? 0);

        if ($clientType === 'organization' && $oid > 0) {
            $stmt = $this->db->prepare('SELECT referral_start_date FROM organizations WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => $oid]);
            $row = $stmt->fetch();
            if ($row && !empty($row['referral_start_date'])) {
                return (string)$row['referral_start_date'];
            }
        } elseif ($cid > 0) {
            $stmt = $this->db->prepare('SELECT referral_start_date FROM clients WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => $cid]);
            $row = $stmt->fetch();
            if ($row && !empty($row['referral_start_date'])) {
                return (string)$row['referral_start_date'];
            }
        }

        $legacy = (string)($service['referral_start_date'] ?? '');
        if ($legacy !== '') {
            return $legacy;
        }

        return $fallbackDate;
    }

    /**
     * KPI counts and week movement for Services & Tasks (aligns with web serviceKpiFilters.js; uses client as_of for “today”).
     *
     * Due-date KPIs: weekDelta = current bucket count vs same rules with anchor = as_of minus 7 days.
     * Status KPIs: weekDelta = engagements in that status with updated_at in the 7 days ending as_of (activity proxy).
     *
     * @return array{asOf: string, counts: array<string, int>, weekDelta: array<string, int>, weekDeltaMode: array<string, string>}
     */
    public function computeKpiSnapshot(
        string $asOfYmd,
        ?int $actorUserId = null,
        bool $isSuperAdmin = false,
        ?int $scopeUserId = null
    ): array
    {
        $d = \DateTimeImmutable::createFromFormat('Y-m-d', $asOfYmd);
        if ($d === false) {
            throw new \InvalidArgumentException('as_of must be YYYY-MM-DD');
        }

        $today     = $d;
        $weekEnd   = $today->modify('+7 days');
        $weekAgo   = $today->modify('-7 days');
        $waEnd     = $weekAgo->modify('+7 days');

        $todayS    = $today->format('Y-m-d');
        $weekEndS  = $weekEnd->format('Y-m-d');
        $waS       = $weekAgo->format('Y-m-d');
        $waEndS    = $waEnd->format('Y-m-d');

        $open = "status NOT IN ('completed', 'cancelled')";
        $scopeWhere = ['1=1'];
        $scopeParams = [];
        $this->applyServiceVisibilityScope(
            $scopeWhere,
            $scopeParams,
            $actorUserId,
            $isSuperAdmin,
            $scopeUserId,
            'services'
        );
        $scopeSql = implode(' AND ', $scopeWhere);

        $cDue = $this->scalarCount(
            "SELECT COUNT(*) FROM services WHERE {$scopeSql} AND {$open}
             AND due_date IS NOT NULL AND due_date >= :a AND due_date <= :b",
            array_merge($scopeParams, [':a' => $todayS, ':b' => $weekEndS])
        );
        $cDueThen = $this->scalarCount(
            "SELECT COUNT(*) FROM services WHERE {$scopeSql} AND {$open}
             AND due_date IS NOT NULL AND due_date >= :a AND due_date <= :b",
            array_merge($scopeParams, [':a' => $waS, ':b' => $waEndS])
        );

        $cOv = $this->scalarCount(
            "SELECT COUNT(*) FROM services WHERE {$scopeSql} AND {$open} AND due_date IS NOT NULL AND due_date < :t",
            array_merge($scopeParams, [':t' => $todayS])
        );
        $cOvThen = $this->scalarCount(
            "SELECT COUNT(*) FROM services WHERE {$scopeSql} AND {$open} AND due_date IS NOT NULL AND due_date < :t",
            array_merge($scopeParams, [':t' => $waS])
        );

        $cPend  = $this->scalarCount("SELECT COUNT(*) FROM services WHERE {$scopeSql} AND status = 'pending_info'", $scopeParams);
        $cComp  = $this->scalarCount("SELECT COUNT(*) FROM services WHERE {$scopeSql} AND status = 'completed'", $scopeParams);
        $actPend = $this->scalarCount(
            "SELECT COUNT(*) FROM services WHERE {$scopeSql} AND status = 'pending_info' AND updated_at >= (CAST(:d AS date) - INTERVAL '7 days')",
            array_merge($scopeParams, [':d' => $asOfYmd])
        );
        $actComp = $this->scalarCount(
            "SELECT COUNT(*) FROM services WHERE {$scopeSql} AND status = 'completed' AND updated_at >= (CAST(:d AS date) - INTERVAL '7 days')",
            array_merge($scopeParams, [':d' => $asOfYmd])
        );

        return [
            'asOf' => $asOfYmd,
            'counts' => [
                'due-week'      => $cDue,
                'overdue'       => $cOv,
                'pending-info'  => $cPend,
                'completed'     => $cComp,
            ],
            'weekDelta' => [
                'due-week'      => $cDue - $cDueThen,
                'overdue'       => $cOv - $cOvThen,
                'pending-info'  => $actPend,
                'completed'     => $actComp,
            ],
            'weekDeltaMode' => [
                'due-week'      => 'net_vs_week_ago',
                'overdue'       => 'net_vs_week_ago',
                'pending-info'  => 'activity_7d',
                'completed'     => 'activity_7d',
            ],
        ];
    }

    private function scalarCount(string $sql, array $params): int
    {
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (int)$stmt->fetchColumn();
    }
}
