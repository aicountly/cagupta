<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\ServiceModel;
use App\Models\TimeEntryModel;
use App\Models\TimesheetOverflowRequestModel;

/**
 * Superadmin-only queue for timesheet entries beyond the engagement cap (3 × standard hours).
 */
final class TimesheetOverflowApprovalController extends BaseController
{
    private TimesheetOverflowRequestModel $requests;
    private TimeEntryModel $entries;
    private ServiceModel $services;

    public function __construct()
    {
        $this->requests = new TimesheetOverflowRequestModel();
        $this->entries  = new TimeEntryModel();
        $this->services = new ServiceModel();
    }

    /** GET /api/admin/approvals/timesheet-overflow */
    public function index(): never
    {
        $rows = $this->requests->listPendingWithContext();
        $this->success($rows);
    }

    /**
     * POST /api/admin/approvals/timesheet-overflow/:id/approve
     * Body: { approved_duration_minutes?: int } — omit to approve as requested; set to modify minutes (approved_modified).
     */
    public function approve(int $id): never
    {
        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : 0;
        if (!$this->isSuperAdminActor($actor)) {
            $this->error('Only Super Admin may approve timesheet overflow requests.', 403);
        }

        $req = $this->requests->find($id);
        if ($req === null || ($req['status'] ?? '') !== 'pending') {
            $this->error('Request not found or already decided.', 404);
        }

        $body              = $this->getJsonBody();
        $modifyMinutesRaw = $body['approved_duration_minutes'] ?? null;
        $modifyMinutes    = ($modifyMinutesRaw !== null && $modifyMinutesRaw !== '')
            ? (int)$modifyMinutesRaw
            : null;

        $requested = (int)$req['duration_minutes_requested'];
        $approvedM = $requested;
        $status    = 'approved';
        if ($modifyMinutes !== null) {
            if ($modifyMinutes <= 0 || $modifyMinutes > 1440) {
                $this->error('approved_duration_minutes must be between 1 and 1440.', 422);
            }
            $approvedM = $modifyMinutes;
            $status    = 'approved_modified';
        }

        $notes = isset($body['decision_notes']) ? trim((string)$body['decision_notes']) : null;
        if ($notes === '') {
            $notes = null;
        }

        $service = $this->services->find((int)$req['service_id']);
        if ($service === null) {
            $this->error('Service no longer exists.', 422);
        }

        $this->requests->beginTransaction();
        try {
            $this->requests->markApproved($id, $actorId, $status, $approvedM, $notes);

            $kind = (string)$req['source_kind'];
            if ($kind === 'manual_create') {
                $row = $this->entries->createWithValidation($service, [
                    'user_id'           => (int)$req['user_id'],
                    'work_date'         => (string)$req['work_date'],
                    'duration_minutes'  => $approvedM,
                    'activity_type'     => (string)$req['activity_type'],
                    'is_billable'       => !empty($req['is_billable']),
                    'notes'             => $req['notes'] ?? null,
                    'task_id'           => $req['task_id'] ?? null,
                ]);
                if ($row === null) {
                    throw new \RuntimeException('could not create time entry');
                }
            } elseif ($kind === 'timer_stop') {
                $teId = (int)($req['time_entry_id'] ?? 0);
                if ($teId <= 0) {
                    throw new \RuntimeException('missing time entry');
                }
                if ($this->entries->find($teId) === null) {
                    throw new \RuntimeException('time entry missing');
                }
                $this->entries->clearOverflowLinkSetDuration($teId, $approvedM);
            } elseif ($kind === 'entry_edit') {
                $teId = (int)($req['time_entry_id'] ?? 0);
                if ($teId <= 0) {
                    throw new \RuntimeException('missing time entry');
                }
                $applied = $this->entries->applyOverflowApprovedEdit($service, $teId, [
                    'duration_minutes' => $approvedM,
                    'work_date'        => (string)$req['work_date'],
                    'activity_type'    => (string)$req['activity_type'],
                    'is_billable'      => !empty($req['is_billable']),
                    'notes'            => $req['notes'] ?? null,
                    'task_id'          => $req['task_id'] ?? null,
                    'timer_status'     => 'submitted',
                ]);
                if ($applied === null) {
                    throw new \RuntimeException('could not apply edit');
                }
            }

            $this->requests->insertAudit($id, 'approved', $actorId, [
                'status'       => $status,
                'minutes'      => $approvedM,
                'requested'    => $requested,
                'decision_notes' => $notes,
            ]);
            $this->requests->commit();
        } catch (\Throwable $e) {
            $this->requests->rollBack();
            error_log('[TimesheetOverflowApproval] approve failed: ' . $e->getMessage());
            $this->error('Could not approve request.', 500);
        }

        $this->success($this->requests->find($id), 'Request approved');
    }

    /** POST /api/admin/approvals/timesheet-overflow/:id/reject */
    public function reject(int $id): never
    {
        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : 0;
        if (!$this->isSuperAdminActor($actor)) {
            $this->error('Only Super Admin may reject timesheet overflow requests.', 403);
        }

        $req = $this->requests->find($id);
        if ($req === null || ($req['status'] ?? '') !== 'pending') {
            $this->error('Request not found or already decided.', 404);
        }

        $body   = $this->getJsonBody();
        $reason = trim((string)($body['reason'] ?? ''));
        if ($reason === '') {
            $this->error('reason is required.', 422);
        }

        $this->requests->beginTransaction();
        try {
            if (($req['source_kind'] ?? '') === 'timer_stop' && !empty($req['time_entry_id'])) {
                $this->entries->deleteById((int)$req['time_entry_id']);
            }

            $this->requests->markRejected($id, $actorId, $reason);
            $this->requests->insertAudit($id, 'rejected', $actorId, ['reason' => $reason]);
            $this->requests->commit();
        } catch (\Throwable $e) {
            $this->requests->rollBack();
            error_log('[TimesheetOverflowApproval] reject failed: ' . $e->getMessage());
            $this->error('Could not reject request.', 500);
        }

        $this->success(['id' => $id, 'status' => 'rejected'], 'Request rejected');
    }

    /** @param array<string, mixed>|null $actor */
    private function isSuperAdminActor(?array $actor): bool
    {
        if ($actor === null) {
            return false;
        }
        if ($this->isSuperAdminEmail((string)($actor['email'] ?? ''))) {
            return true;
        }

        return ($actor['role_name'] ?? '') === 'super_admin';
    }
}
