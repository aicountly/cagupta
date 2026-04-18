<?php
declare(strict_types=1);

namespace App\Controllers\Client;

use App\Config\Database;
use App\Controllers\BaseController;
use App\Models\ServiceModel;
use App\Models\TxnModel;
use PDO;

final class ClientPortalController extends BaseController
{
    private ServiceModel $services;
    private TxnModel $txn;
    private PDO $db;

    public function __construct()
    {
        $this->services = new ServiceModel();
        $this->txn = new TxnModel();
        $this->db = Database::getConnection();
    }

    /** GET /api/client/me */
    public function me(): never
    {
        $u = $this->assertClient();
        $this->success([
            'entity_type' => $u['entity_type'] ?? 'contact',
            'entity_id' => (int)($u['entity_id'] ?? 0),
            'contact_id' => $u['contact_id'] ?? null,
            'organization_id' => $u['organization_id'] ?? null,
            'available_organizations' => $this->allowedOrgIds($u, true),
        ]);
    }

    /** GET /api/client/services */
    public function services(): never
    {
        $u = $this->assertClient();
        $group = strtolower(trim((string)$this->query('group', 'active')));
        $page = max(1, (int)$this->query('page', 1));
        $perPage = min(100, max(1, (int)$this->query('per_page', 20)));
        $search = trim((string)$this->query('search', ''));

        $where = ['1=1'];
        $params = [];
        $this->applyScope($u, $where, $params);
        if ($group === 'completed') {
            $where[] = "s.status = 'completed'";
        } else {
            $where[] = "COALESCE(s.status, '') <> 'completed'";
        }
        if ($search !== '') {
            $where[] = '(s.service_type ILIKE :search OR s.client_name ILIKE :search)';
            $params[':search'] = '%' . $search . '%';
        }

        $whereSql = implode(' AND ', $where);
        $offset = ($page - 1) * $perPage;
        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM services s WHERE {$whereSql}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT s.*
             FROM services s
             WHERE {$whereSql}
             ORDER BY s.updated_at DESC NULLS LAST, s.id DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();

        $this->success($rows, 'Services retrieved', 200, [
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => (int)ceil($total / $perPage),
            ],
        ]);
    }

    /** GET /api/client/services/:id */
    public function serviceShow(int $id): never
    {
        $u = $this->assertClient();
        $row = $this->services->find($id);
        if ($row === null) {
            $this->error('Service not found.', 404);
        }
        if (!$this->canViewService($u, $row)) {
            $this->error('Access denied.', 403);
        }
        $this->success($row, 'Service detail retrieved');
    }

    /** GET /api/client/ledger */
    public function ledger(): never
    {
        $u = $this->assertClient();
        $targetOrg = (int)$this->query('organization_id', 0);
        if ($targetOrg > 0) {
            $allowed = array_map(static fn (array $r): int => (int)$r['id'], $this->allowedOrgIds($u, true));
            if (!in_array($targetOrg, $allowed, true)) {
                $this->error('Organization access denied.', 403);
            }
            $this->success($this->txn->getLedgerByOrganization($targetOrg), 'Ledger retrieved');
        }

        $contactId = (int)($u['contact_id'] ?? 0);
        if ($contactId <= 0) {
            $this->error('No contact ledger is linked to this login.', 422);
        }
        $this->success($this->txn->getLedgerByClient($contactId), 'Ledger retrieved');
    }

    private function assertClient(): array
    {
        $u = $this->authUser();
        if ($u === null) {
            $this->error('Not authenticated.', 401);
        }
        if (($u['role_name'] ?? '') !== 'client') {
            $this->error('Client access only.', 403);
        }
        return $u;
    }

    /**
     * @param array<string, mixed> $u
     * @param string[] $where
     * @param array<string, mixed> $params
     */
    private function applyScope(array $u, array &$where, array &$params): void
    {
        $contactId = (int)($u['contact_id'] ?? 0);
        $orgIds = array_map(static fn (array $r): int => (int)$r['id'], $this->allowedOrgIds($u, true));
        $parts = [];
        if ($contactId > 0) {
            $parts[] = 's.client_id = :scope_contact_id';
            $params[':scope_contact_id'] = $contactId;
        }
        if ($orgIds !== []) {
            $ph = [];
            foreach ($orgIds as $idx => $oid) {
                $key = ':scope_org_' . $idx;
                $ph[] = $key;
                $params[$key] = $oid;
            }
            $parts[] = 's.organization_id IN (' . implode(',', $ph) . ')';
        }
        if ($parts === []) {
            $where[] = '1=0';
            return;
        }
        $where[] = '(' . implode(' OR ', $parts) . ')';
    }

    /**
     * @param array<string, mixed> $u
     * @return array<int, array<string, mixed>>
     */
    private function allowedOrgIds(array $u, bool $withNames = false): array
    {
        $directOrgId = (int)($u['organization_id'] ?? 0);
        if ($directOrgId > 0) {
            if (!$withNames) {
                return [['id' => $directOrgId]];
            }
            $stmt = $this->db->prepare('SELECT id, name FROM organizations WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => $directOrgId]);
            $row = $stmt->fetch();
            return $row ? [['id' => (int)$row['id'], 'name' => (string)$row['name']]] : [];
        }

        $contactId = (int)($u['contact_id'] ?? 0);
        if ($contactId <= 0) {
            return [];
        }
        $select = $withNames ? 'o.id, o.name' : 'o.id';
        $stmt = $this->db->prepare(
            "SELECT {$select}
             FROM contact_organization co
             JOIN organizations o ON o.id = co.organization_id
             WHERE co.contact_id = :contact_id
               AND o.is_active = TRUE
             ORDER BY o.name ASC"
        );
        $stmt->execute([':contact_id' => $contactId]);
        return $stmt->fetchAll();
    }

    /**
     * @param array<string, mixed> $u
     * @param array<string, mixed> $service
     */
    private function canViewService(array $u, array $service): bool
    {
        $contactId = (int)($u['contact_id'] ?? 0);
        if ($contactId > 0 && (int)($service['client_id'] ?? 0) === $contactId) {
            return true;
        }
        $svcOrg = (int)($service['organization_id'] ?? 0);
        if ($svcOrg <= 0) {
            return false;
        }
        $allowed = array_map(static fn (array $r): int => (int)$r['id'], $this->allowedOrgIds($u, false));
        return in_array($svcOrg, $allowed, true);
    }
}
