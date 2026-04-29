<?php
declare(strict_types=1);

namespace App\Controllers\Client;

use App\Controllers\BaseController;
use App\Models\ServiceLogModel;
use App\Models\ServiceModel;

/**
 * ServiceLogController (Client portal) — read-only access to client-visible logs.
 *
 * Routes (prefix /api/client):
 *   GET /services/:id/logs  → index
 *
 * Only returns entries with visibility = 'client'.
 * The service itself must belong to the authenticated client entity.
 */
final class ServiceLogController extends BaseController
{
    private ServiceLogModel $logs;
    private ServiceModel    $services;

    public function __construct()
    {
        $this->logs     = new ServiceLogModel();
        $this->services = new ServiceModel();
    }

    // ── GET /api/client/services/:id/logs ────────────────────────────────────

    /**
     * Return client-visible log entries for one service.
     * Access is denied if the service does not belong to the authenticated client.
     */
    public function index(int $serviceId): never
    {
        $u = $this->assertClient();

        $service = $this->services->find($serviceId);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        // Verify the client owns this service
        if (!$this->canViewService($u, $service)) {
            $this->error('Access denied.', 403);
        }

        // Clients may only see 'client' visibility entries
        $rows = $this->logs->listForService($serviceId, 'client');

        $this->success($rows, 'Service logs retrieved');
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /** @return array<string, mixed> */
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
     * Check that the service belongs to the authenticated client.
     *
     * @param array<string, mixed> $u
     * @param array<string, mixed> $service
     */
    private function canViewService(array $u, array $service): bool
    {
        $contactId = (int)($u['contact_id'] ?? 0);
        $orgId     = (int)($u['organization_id'] ?? 0);

        $svcClientId = (int)($service['client_id']       ?? 0);
        $svcOrgId    = (int)($service['organization_id'] ?? 0);

        if ($contactId > 0 && $svcClientId === $contactId) {
            return true;
        }
        if ($orgId > 0 && $svcOrgId === $orgId) {
            return true;
        }

        return false;
    }
}
