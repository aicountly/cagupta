<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Libraries\WorkHoldNotifier;
use App\Models\ClientModel;
use App\Models\OrganizationModel;
use App\Models\ServiceModel;
use App\Models\UserModel;
use App\Models\WorkHoldAuditLogModel;
use App\Models\WorkHoldExceptionModel;

/**
 * Accounts work-hold: status, exceptions, audit; mutations restricted to super_admin / accounts roles.
 */
class WorkHoldController extends BaseController
{
    private ClientModel $clients;
    private OrganizationModel $orgs;
    private WorkHoldExceptionModel $exceptions;
    private WorkHoldAuditLogModel $audit;
    private ServiceModel $services;
    private UserModel $users;

    public function __construct()
    {
        $this->clients     = new ClientModel();
        $this->orgs        = new OrganizationModel();
        $this->exceptions  = new WorkHoldExceptionModel();
        $this->audit       = new WorkHoldAuditLogModel();
        $this->services    = new ServiceModel();
        $this->users       = new UserModel();
    }

    // ── GET /api/admin/contacts/:id/work-hold ─────────────────────────────────

    public function showForContact(int $id): never
    {
        $row = $this->clients->find($id);
        if ($row === null) {
            $this->error('Contact not found.', 404);
        }
        $this->success($this->buildPayloadForClientRow($id, $row));
    }

    // ── PUT /api/admin/contacts/:id/work-hold ─────────────────────────────────

    public function updateForContact(int $id): never
    {
        $row = $this->clients->find($id);
        if ($row === null) {
            $this->error('Contact not found.', 404);
        }
        $this->applyHoldMutationFromBody($id, null, $row);
    }

    // ── POST /api/admin/contacts/:id/work-hold/exceptions ─────────────────────

    public function storeExceptionForContact(int $id): never
    {
        $row = $this->clients->find($id);
        if ($row === null) {
            $this->error('Contact not found.', 404);
        }
        if (empty($row['work_hold_active'])) {
            $this->error('Work hold is not active for this contact.', 422);
        }
        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : null;
        $body = $this->getJsonBody();
        $kind = strtolower(trim((string)($body['exception_kind'] ?? '')));
        if (!in_array($kind, ['service', 'window'], true)) {
            $this->error('exception_kind must be service or window.', 422);
        }
        $notes = isset($body['notes']) ? trim((string)$body['notes']) : null;
        if ($notes === '') {
            $notes = null;
        }

        if ($kind === 'service') {
            $sid = (int)($body['service_id'] ?? 0);
            if ($sid <= 0) {
                $this->error('service_id is required for a service exception.', 422);
            }
            $this->assertServiceBelongsToContact($sid, $id);
            $eid = $this->exceptions->createForClient($id, [
                'exception_kind' => 'service',
                'service_id'     => $sid,
                'expires_at'     => null,
                'notes'          => $notes,
                'created_by'     => $actorId,
            ]);
            $this->audit->insert($id, null, 'exception_service_added', $actorId, [
                'exception_id' => $eid,
                'service_id'   => $sid,
            ]);
            WorkHoldNotifier::notify(
                'Work hold exception (service)',
                "Contact #{$id}: one-service exception added for service #{$sid}.",
                ['contact_id' => $id, 'exception_id' => $eid]
            );
            $this->success(['id' => $eid], 'Exception created', 201);
        }

        $expRaw = trim((string)($body['expires_at'] ?? ''));
        if ($expRaw === '') {
            $this->error('expires_at is required for a window exception.', 422);
        }
        try {
            $expAt = new \DateTimeImmutable($expRaw);
        } catch (\Exception) {
            $this->error('expires_at must be a valid date/time.', 422);
        }
        if ($expAt <= new \DateTimeImmutable('now')) {
            $this->error('expires_at must be in the future.', 422);
        }
        $expStr = $expAt->format('Y-m-d H:i:s');
        $eid = $this->exceptions->createForClient($id, [
            'exception_kind' => 'window',
            'service_id'     => null,
            'expires_at'     => $expStr,
            'notes'          => $notes,
            'created_by'     => $actorId,
        ]);
        $this->audit->insert($id, null, 'exception_window_added', $actorId, [
            'exception_id' => $eid,
            'expires_at'   => $expStr,
        ]);
        WorkHoldNotifier::notify(
            'Work hold exception (window)',
            "Contact #{$id}: temporary window until {$expStr} (UTC).",
            ['contact_id' => $id, 'exception_id' => $eid]
        );
        $this->success(['id' => $eid], 'Exception created', 201);
    }

    // ── GET /api/admin/organizations/:id/work-hold ────────────────────────────

    public function showForOrganization(int $id): never
    {
        $row = $this->orgs->find($id);
        if ($row === null) {
            $this->error('Organization not found.', 404);
        }
        $this->success($this->buildPayloadForOrgRow($id, $row));
    }

    // ── PUT /api/admin/organizations/:id/work-hold ─────────────────────────────

    public function updateForOrganization(int $id): never
    {
        $row = $this->orgs->find($id);
        if ($row === null) {
            $this->error('Organization not found.', 404);
        }
        $this->applyHoldMutationFromBody(null, $id, $row);
    }

    // ── POST /api/admin/organizations/:id/work-hold/exceptions ────────────────

    public function storeExceptionForOrganization(int $id): never
    {
        $row = $this->orgs->find($id);
        if ($row === null) {
            $this->error('Organization not found.', 404);
        }
        if (empty($row['work_hold_active'])) {
            $this->error('Work hold is not active for this organization.', 422);
        }
        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : null;
        $body = $this->getJsonBody();
        $kind = strtolower(trim((string)($body['exception_kind'] ?? '')));
        if (!in_array($kind, ['service', 'window'], true)) {
            $this->error('exception_kind must be service or window.', 422);
        }
        $notes = isset($body['notes']) ? trim((string)$body['notes']) : null;
        if ($notes === '') {
            $notes = null;
        }

        if ($kind === 'service') {
            $sid = (int)($body['service_id'] ?? 0);
            if ($sid <= 0) {
                $this->error('service_id is required for a service exception.', 422);
            }
            $this->assertServiceBelongsToOrganization($sid, $id);
            $eid = $this->exceptions->createForOrganization($id, [
                'exception_kind' => 'service',
                'service_id'     => $sid,
                'expires_at'     => null,
                'notes'          => $notes,
                'created_by'     => $actorId,
            ]);
            $this->audit->insert(null, $id, 'exception_service_added', $actorId, [
                'exception_id' => $eid,
                'service_id'   => $sid,
            ]);
            WorkHoldNotifier::notify(
                'Work hold exception (service)',
                "Organization #{$id}: one-service exception added for service #{$sid}.",
                ['organization_id' => $id, 'exception_id' => $eid]
            );
            $this->success(['id' => $eid], 'Exception created', 201);
        }

        $expRaw = trim((string)($body['expires_at'] ?? ''));
        if ($expRaw === '') {
            $this->error('expires_at is required for a window exception.', 422);
        }
        try {
            $expAt = new \DateTimeImmutable($expRaw);
        } catch (\Exception) {
            $this->error('expires_at must be a valid date/time.', 422);
        }
        if ($expAt <= new \DateTimeImmutable('now')) {
            $this->error('expires_at must be in the future.', 422);
        }
        $expStr = $expAt->format('Y-m-d H:i:s');
        $eid = $this->exceptions->createForOrganization($id, [
            'exception_kind' => 'window',
            'service_id'     => null,
            'expires_at'     => $expStr,
            'notes'          => $notes,
            'created_by'     => $actorId,
        ]);
        $this->audit->insert(null, $id, 'exception_window_added', $actorId, [
            'exception_id' => $eid,
            'expires_at'   => $expStr,
        ]);
        WorkHoldNotifier::notify(
            'Work hold exception (window)',
            "Organization #{$id}: temporary window until {$expStr} (UTC).",
            ['organization_id' => $id, 'exception_id' => $eid]
        );
        $this->success(['id' => $eid], 'Exception created', 201);
    }

    // ── DELETE /api/admin/work-hold/exceptions/:id ────────────────────────────

    public function destroyException(int $id): never
    {
        $ex = $this->exceptions->find($id);
        if ($ex === null) {
            $this->error('Exception not found.', 404);
        }
        $cid = isset($ex['client_id']) ? (int)$ex['client_id'] : 0;
        $oid = isset($ex['organization_id']) ? (int)$ex['organization_id'] : 0;
        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : null;

        $this->exceptions->delete($id);
        if ($cid > 0) {
            $this->audit->insert($cid, null, 'exception_removed', $actorId, [
                'exception_id'   => $id,
                'exception_kind' => $ex['exception_kind'] ?? null,
            ]);
        } elseif ($oid > 0) {
            $this->audit->insert(null, $oid, 'exception_removed', $actorId, [
                'exception_id'   => $id,
                'exception_kind' => $ex['exception_kind'] ?? null,
            ]);
        }
        WorkHoldNotifier::notify(
            'Work hold exception removed',
            "Exception #{$id} was revoked.",
            ['exception_id' => $id]
        );
        $this->success(['deleted' => true], 'Exception removed');
    }

    /**
     * @param array<string, mixed> $row clients.find row
     * @return array<string, mixed>
     */
    private function buildPayloadForClientRow(int $id, array $row): array
    {
        return [
            'hold'        => $this->formatHoldSlice($row),
            'exceptions'  => $this->formatExceptionRows($this->exceptions->listForEntity($id, null)),
            'audit'       => $this->formatAuditRows($this->audit->listForEntity($id, null)),
        ];
    }

    /**
     * @param array<string, mixed> $row organizations.find row
     * @return array<string, mixed>
     */
    private function buildPayloadForOrgRow(int $id, array $row): array
    {
        return [
            'hold'        => $this->formatHoldSlice($row),
            'exceptions'  => $this->formatExceptionRows($this->exceptions->listForEntity(null, $id)),
            'audit'       => $this->formatAuditRows($this->audit->listForEntity(null, $id)),
        ];
    }

    /**
     * @param array<string, mixed> $entityRow
     * @return array{active: bool, notes: ?string, set_at: mixed, set_by_user_id: ?int, set_by_name: ?string}
     */
    private function formatHoldSlice(array $entityRow): array
    {
        $uid = isset($entityRow['work_hold_set_by']) ? (int)$entityRow['work_hold_set_by'] : 0;
        $name = null;
        if ($uid > 0) {
            $u = $this->users->find($uid);
            $name = $u ? (string)($u['name'] ?? '') : null;
            if ($name === '') {
                $name = null;
            }
        }

        return [
            'active'          => !empty($entityRow['work_hold_active']),
            'notes'           => $entityRow['work_hold_notes'] ?? null,
            'set_at'          => $entityRow['work_hold_set_at'] ?? null,
            'set_by_user_id'  => $uid > 0 ? $uid : null,
            'set_by_name'     => $name,
        ];
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function formatExceptionRows(array $rows): array
    {
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id'             => (int)($r['id'] ?? 0),
                'exception_kind' => $r['exception_kind'] ?? '',
                'service_id'     => isset($r['service_id']) ? (int)$r['service_id'] : null,
                'expires_at'     => $r['expires_at'] ?? null,
                'notes'          => $r['notes'] ?? null,
                'created_at'     => $r['created_at'] ?? null,
                'created_by'     => isset($r['created_by']) ? (int)$r['created_by'] : null,
            ];
        }

        return $out;
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function formatAuditRows(array $rows): array
    {
        $out = [];
        foreach ($rows as $r) {
            $payload = $r['payload'] ?? [];
            if (is_string($payload)) {
                $decoded = json_decode($payload, true);
                $payload = is_array($decoded) ? $decoded : [];
            }
            $out[] = [
                'id'            => (int)($r['id'] ?? 0),
                'action'        => (string)($r['action'] ?? ''),
                'actor_user_id' => isset($r['actor_user_id']) ? (int)$r['actor_user_id'] : null,
                'actor_name'    => $r['actor_name'] ?? null,
                'payload'       => $payload,
                'created_at'    => $r['created_at'] ?? null,
            ];
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $row client or org row from find()
     */
    private function applyHoldMutationFromBody(?int $clientId, ?int $organizationId, array $row): never
    {
        $body = $this->getJsonBody();
        if (!array_key_exists('active', $body)) {
            $this->error('active is required (boolean).', 422);
        }
        $active = filter_var($body['active'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($active === null) {
            $this->error('active must be a boolean.', 422);
        }
        $notes = isset($body['notes']) ? trim((string)$body['notes']) : null;
        if ($notes === '') {
            $notes = null;
        }

        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : null;
        $before = !empty($row['work_hold_active']);

        if ($clientId !== null) {
            $this->clients->setWorkHold($clientId, $active, $notes, $actorId);
        } else {
            $this->orgs->setWorkHold((int)$organizationId, $active, $notes, $actorId);
        }

        if ($active && !$before) {
            $label = $clientId !== null ? 'contact' : 'organization';
            $eid = $clientId ?? $organizationId;
            if ($clientId !== null) {
                $this->audit->insert($clientId, null, 'hold_activated', $actorId, ['notes' => $notes]);
            } else {
                $this->audit->insert(null, (int)$organizationId, 'hold_activated', $actorId, ['notes' => $notes]);
            }
            WorkHoldNotifier::notify(
                'Work hold activated',
                ucfirst($label) . " #{$eid} was placed on work hold.",
                [$label . '_id' => $eid]
            );
        } elseif (!$active && $before) {
            if ($clientId !== null) {
                $this->audit->insert($clientId, null, 'hold_released', $actorId, []);
            } else {
                $this->audit->insert(null, (int)$organizationId, 'hold_released', $actorId, []);
            }
            WorkHoldNotifier::notify(
                'Work hold released',
                ($clientId !== null ? 'Contact' : 'Organization') . ' #' . ($clientId ?? $organizationId) . ' hold was released.',
                []
            );
        } elseif ($active && $before) {
            if ($clientId !== null) {
                $this->audit->insert($clientId, null, 'hold_updated', $actorId, ['notes' => $notes]);
            } else {
                $this->audit->insert(null, (int)$organizationId, 'hold_updated', $actorId, ['notes' => $notes]);
            }
        }

        $fresh = $clientId !== null
            ? $this->clients->find($clientId)
            : $this->orgs->find((int)$organizationId);
        if ($fresh === null) {
            $this->error('Record not found after update.', 500);
        }
        $payload = $clientId !== null
            ? $this->buildPayloadForClientRow($clientId, $fresh)
            : $this->buildPayloadForOrgRow((int)$organizationId, $fresh);
        $this->success($payload, 'Work hold updated');
    }

    private function assertServiceBelongsToContact(int $serviceId, int $clientId): void
    {
        $svc = $this->services->find($serviceId);
        if ($svc === null) {
            $this->error('Service not found.', 404);
        }
        $ct = strtolower(trim((string)($svc['client_type'] ?? 'contact')));
        if ($ct !== 'contact' || (int)($svc['client_id'] ?? 0) !== $clientId) {
            $this->error('Service does not belong to this contact.', 422);
        }
    }

    private function assertServiceBelongsToOrganization(int $serviceId, int $organizationId): void
    {
        $svc = $this->services->find($serviceId);
        if ($svc === null) {
            $this->error('Service not found.', 404);
        }
        $ct = strtolower(trim((string)($svc['client_type'] ?? 'contact')));
        if ($ct !== 'organization' || (int)($svc['organization_id'] ?? 0) !== $organizationId) {
            $this->error('Service does not belong to this organization.', 422);
        }
    }
}
