<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Libraries\BrevoMailer;
use App\Models\ClientModel;
use App\Models\OrganizationModel;
use App\Models\ServiceLogModel;
use App\Models\ServiceModel;

/**
 * ServiceLogController — activity log entries for service engagements.
 *
 * Routes (prefix /api/admin):
 *   GET    /services/pending-followups               → pendingFollowUps
 *   GET    /services/:sid/logs                       → index
 *   POST   /services/:sid/logs                       → store
 *   PATCH  /services/:sid/logs/:lid                  → update
 *   DELETE /services/:sid/logs/:lid                  → destroy (super_admin only)
 *   POST   /services/:sid/logs/:lid/remind           → sendReminder
 *   GET    /services/logs/overdue-count              → overdueCount
 */
class ServiceLogController extends BaseController
{
    private ServiceLogModel $logs;
    private ServiceModel    $services;

    public function __construct()
    {
        $this->logs     = new ServiceLogModel();
        $this->services = new ServiceModel();
    }

    // ── GET /api/admin/services/pending-followups ─────────────────────────────

    /**
     * Cross-service pending follow-ups for the super-admin dashboard.
     * Query: days_ahead (default 30)
     */
    public function pendingFollowUps(): never
    {
        $daysAhead = max(1, min(365, (int)$this->query('days_ahead', 30)));
        $rows      = $this->logs->pendingFollowUps($daysAhead);

        $today = (new \DateTimeImmutable('today'))->format('Y-m-d');
        foreach ($rows as &$row) {
            $fd = (string)($row['follow_up_date'] ?? '');
            $row['is_overdue']   = $fd !== '' && $fd < $today;
            $row['is_due_today'] = $fd === $today;
        }
        unset($row);

        $this->success($rows, 'Pending follow-ups retrieved');
    }

    // ── GET /api/admin/services/logs/overdue-count ────────────────────────────

    /**
     * Returns the count of overdue unresolved follow-ups.
     * Lightweight — used by the sidebar badge.
     */
    public function overdueCount(): never
    {
        $count = $this->logs->overdueCount();
        $this->success(['count' => $count], 'Overdue count retrieved');
    }

    // ── GET /api/admin/services/:sid/logs ─────────────────────────────────────

    /**
     * List all log entries visible to the authenticated user for a service.
     */
    public function index(int $serviceId): never
    {
        $service = $this->services->find($serviceId);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        $minVisibility = $this->resolveMinVisibility();
        $rows          = $this->logs->listForService($serviceId, $minVisibility);

        $this->success($rows, 'Service logs retrieved');
    }

    // ── POST /api/admin/services/:sid/logs ────────────────────────────────────

    /**
     * Create a new log entry.
     *
     * Body: {
     *   log_type:       'note'|'follow_up'|'document_request'|'internal_message'
     *   message:        string (required)
     *   visibility?:    'internal'|'affiliate'|'client'
     *   follow_up_date?: YYYY-MM-DD (required for follow_up type)
     * }
     */
    public function store(int $serviceId): never
    {
        $service = $this->services->find($serviceId);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        $actor = $this->authUser();
        $body  = $this->getJsonBody();

        $logType = strtolower(trim((string)($body['log_type'] ?? 'note')));
        $message = trim((string)($body['message'] ?? ''));

        if ($message === '') {
            $this->error('message is required.', 422);
        }

        $allowedTypes = ['note', 'follow_up', 'document_request', 'internal_message', 'reminder'];
        if (!in_array($logType, $allowedTypes, true)) {
            $this->error("log_type must be one of: " . implode(', ', $allowedTypes) . '.', 422);
        }

        $visibility = strtolower(trim((string)($body['visibility'] ?? 'internal')));
        if (!in_array($visibility, ['internal', 'affiliate', 'client'], true)) {
            $this->error("visibility must be 'internal', 'affiliate', or 'client'.", 422);
        }

        $followUpDate = null;
        if ($logType === 'follow_up') {
            $raw = trim((string)($body['follow_up_date'] ?? ''));
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
                $this->error('follow_up_date (YYYY-MM-DD) is required for follow_up type.', 422);
            }
            $followUpDate = $raw;
        } elseif (isset($body['follow_up_date']) && trim((string)$body['follow_up_date']) !== '') {
            $raw = trim((string)$body['follow_up_date']);
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
                $followUpDate = $raw;
            }
        }

        $newId = $this->logs->insert([
            'service_id'     => $serviceId,
            'log_type'       => $logType,
            'message'        => $message,
            'visibility'     => $visibility,
            'follow_up_date' => $followUpDate,
            'created_by'     => $actor ? (int)$actor['id'] : null,
        ]);

        $entry = $this->logs->find($newId);
        $this->success($entry, 'Log entry created', 201);
    }

    // ── PATCH /api/admin/services/:sid/logs/:lid ──────────────────────────────

    /**
     * Update a log entry: edit message, change visibility, resolve, pin/unpin.
     *
     * Body: {
     *   message?:        string
     *   visibility?:     'internal'|'affiliate'|'client'
     *   follow_up_date?: YYYY-MM-DD|null
     *   is_pinned?:      bool
     *   resolve?:        bool   (true = mark resolved)
     * }
     */
    public function update(int $serviceId, int $logId): never
    {
        $entry = $this->resolveEntry($serviceId, $logId);
        $actor = $this->authUser();
        $body  = $this->getJsonBody();
        $data  = [];

        if (array_key_exists('message', $body)) {
            $msg = trim((string)$body['message']);
            if ($msg === '') {
                $this->error('message cannot be empty.', 422);
            }
            $data['message'] = $msg;
        }

        if (array_key_exists('visibility', $body)) {
            $v = strtolower(trim((string)$body['visibility']));
            if (!in_array($v, ['internal', 'affiliate', 'client'], true)) {
                $this->error("visibility must be 'internal', 'affiliate', or 'client'.", 422);
            }
            // internal_message cannot change its visibility
            if ((string)($entry['log_type'] ?? '') === 'internal_message') {
                $this->error("internal_message entries are always internal — visibility cannot be changed.", 422);
            }
            $data['visibility'] = $v;
        }

        if (array_key_exists('follow_up_date', $body)) {
            $raw = $body['follow_up_date'];
            if ($raw === null || $raw === '') {
                $data['follow_up_date'] = null;
            } elseif (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$raw)) {
                $data['follow_up_date'] = (string)$raw;
            } else {
                $this->error('follow_up_date must be YYYY-MM-DD or null.', 422);
            }
        }

        if (array_key_exists('is_pinned', $body)) {
            $data['is_pinned'] = (bool)$body['is_pinned'];
        }

        if (!empty($body['resolve']) && !$entry['is_resolved']) {
            $actorId = $actor ? (int)$actor['id'] : 0;
            $this->logs->markResolved($logId, $actorId);
            // Return after resolving; other field changes will apply first if any
        }

        if ($data !== []) {
            $this->logs->update($logId, $data);
        }

        $updated = $this->logs->find($logId);
        $this->success($updated, 'Log entry updated');
    }

    // ── DELETE /api/admin/services/:sid/logs/:lid ─────────────────────────────

    /**
     * Permanently delete a log entry. Super admin only.
     */
    public function destroy(int $serviceId, int $logId): never
    {
        $actor = $this->authUser();
        if ($actor === null || !$this->isSuperAdminEmail((string)($actor['email'] ?? ''))) {
            $this->error('Only super admin can delete log entries.', 403);
        }

        $this->resolveEntry($serviceId, $logId);
        $this->logs->delete($logId);
        $this->success(null, 'Log entry deleted');
    }

    // ── POST /api/admin/services/:sid/logs/:lid/remind ────────────────────────

    /**
     * Send a reminder email to the client/affiliate for a log entry.
     * Only meaningful for entries with visibility = 'client' or 'affiliate'
     * and a follow_up_date set.
     *
     * Records reminder_sent_at on the log entry.
     */
    public function sendReminder(int $serviceId, int $logId): never
    {
        $entry   = $this->resolveEntry($serviceId, $logId);
        $service = $this->services->find($serviceId);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        $visibility = (string)($entry['visibility'] ?? 'internal');
        if ($visibility === 'internal') {
            $this->error('Reminders can only be sent for entries visible to clients or affiliates.', 422);
        }

        // Resolve recipient email from the service's client/org
        [$toEmail, $toName] = $this->resolveRecipient($service);
        if ($toEmail === '') {
            $this->error('No client email address found for this service.', 422);
        }

        $serviceType = (string)($service['service_type'] ?? 'Service');
        $clientName  = (string)($service['client_name']  ?? 'Valued Client');
        $followUpDate = (string)($entry['follow_up_date'] ?? '');
        $message      = (string)($entry['message']        ?? '');

        $htmlBody = $this->buildReminderHtml([
            'toName'       => $toName ?: $clientName,
            'serviceType'  => $serviceType,
            'message'      => nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8')),
            'followUpDate' => $followUpDate,
        ]);

        $subject = "Follow-up reminder — {$serviceType}";
        $sent    = false;
        try {
            $sent = BrevoMailer::send($toEmail, $toName ?: $clientName, $subject, $htmlBody);
        } catch (\Throwable $e) {
            error_log('[ServiceLogController] Reminder email failed: ' . $e->getMessage());
        }

        if ($sent) {
            $this->logs->markReminderSent($logId);
        }

        $updated = $this->logs->find($logId);
        $this->success($updated, $sent ? 'Reminder sent.' : 'Reminder email could not be delivered, but recorded.');
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Determine the minimum visibility level the authenticated actor can see.
     * Staff roles see everything (internal). Affiliates see affiliate + client.
     */
    private function resolveMinVisibility(): string
    {
        $actor = $this->authUser();
        if ($actor === null) {
            return 'client';
        }

        $role = strtolower(trim((string)($actor['role_name'] ?? '')));
        if ($role === 'affiliate') {
            return 'affiliate';
        }

        // super_admin, admin, manager, staff, viewer
        return 'internal';
    }

    /**
     * Load and verify that a log entry belongs to the given service.
     *
     * @return array<string, mixed>
     */
    private function resolveEntry(int $serviceId, int $logId): array
    {
        $entry = $this->logs->find($logId);
        if ($entry === null) {
            $this->error('Log entry not found.', 404);
        }
        if ((int)$entry['service_id'] !== $serviceId) {
            $this->error('Log entry does not belong to this service.', 404);
        }

        return $entry;
    }

    /**
     * Try to resolve a primary email address for the service's client/org.
     *
     * @return array{string, string}  [email, name]
     */
    private function resolveRecipient(array $service): array
    {
        $clientType = strtolower(trim((string)($service['client_type'] ?? 'contact')));

        if ($clientType === 'organization') {
            $orgId = (int)($service['organization_id'] ?? 0);
            if ($orgId > 0) {
                $orgs = new OrganizationModel();
                $org  = $orgs->find($orgId);
                if ($org !== null) {
                    $email = trim((string)($org['email'] ?? ''));
                    if ($email === '') {
                        $email = trim((string)($org['secondary_email'] ?? ''));
                    }
                    return [$email, (string)($org['name'] ?? '')];
                }
            }
        }

        $clientId = (int)($service['client_id'] ?? 0);
        if ($clientId > 0) {
            $clients = new ClientModel();
            $client  = $clients->find($clientId);
            if ($client !== null) {
                $email = trim((string)($client['email'] ?? ''));
                if ($email === '') {
                    $email = trim((string)($client['secondary_email'] ?? ''));
                }
                return [$email, (string)($client['name'] ?? '')];
            }
        }

        return ['', (string)($service['client_name'] ?? '')];
    }

    /**
     * Build the HTML body for a reminder email.
     *
     * @param array<string, string> $vars
     */
    private function buildReminderHtml(array $vars): string
    {
        $toName      = htmlspecialchars($vars['toName']      ?? '', ENT_QUOTES, 'UTF-8');
        $serviceType = htmlspecialchars($vars['serviceType'] ?? '', ENT_QUOTES, 'UTF-8');
        $followUpDate = htmlspecialchars($vars['followUpDate'] ?? '', ENT_QUOTES, 'UTF-8');
        $message     = $vars['message'] ?? '';

        $dueLine = $followUpDate !== ''
            ? "<p style='margin:0 0 12px;'><strong>Follow-up due:</strong> {$followUpDate}</p>"
            : '';

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;background:#f6f7fb;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6e8f0;">
    <div style="background:#ffffff;padding:16px 24px;text-align:center;border-bottom:3px solid #F37920;">
      <img src="https://carahulgupta.in/cropped_logo.png" alt="CA Rahul Gupta" height="48" style="display:block;margin:0 auto;" />
    </div>
    <div style="background:#F37920;padding:20px 24px;">
      <h2 style="margin:0;color:#fff;font-size:18px;">Follow-up Reminder</h2>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;">Dear {$toName},</p>
      <p style="margin:0 0 16px;">
        This is a reminder regarding your <strong>{$serviceType}</strong> engagement with our office.
      </p>
      {$dueLine}
      <div style="background:#f8fafc;border-left:4px solid #F37920;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:20px;">
        <p style="margin:0;font-size:14px;color:#334155;">{$message}</p>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
        Please take the necessary action or contact our office if you have any questions.
      </p>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #e6e8f0;font-size:12px;color:#94a3b8;text-align:center;">
      CA Rahul Gupta &mdash; Office Portal &mdash; office@carahulgupta.in
    </div>
  </div>
</body>
</html>
HTML;
    }
}
