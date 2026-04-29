<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\LeaveModel;
use App\Models\ServiceModel;
use App\Models\ServiceTemporaryAssignmentModel;
use App\Models\UserModel;

/**
 * LeaveController — manages staff leave periods and temporary service handovers.
 *
 * Routes (see Routes.php):
 *   GET    /api/admin/leaves                          → index
 *   POST   /api/admin/leaves                          → store
 *   GET    /api/admin/leaves/my-charges               → myTemporaryCharges
 *   GET    /api/admin/leaves/:id                      → show
 *   PATCH  /api/admin/leaves/:id                      → update
 *   POST   /api/admin/leaves/:id/handover             → handover
 *   DELETE /api/admin/leaves/:id/assignments/:aid     → revokeAssignment
 */
class LeaveController extends BaseController
{
    private LeaveModel $leaves;
    private ServiceTemporaryAssignmentModel $assignments;
    private ServiceModel $services;
    private UserModel $users;

    public function __construct()
    {
        $this->leaves      = new LeaveModel();
        $this->assignments = new ServiceTemporaryAssignmentModel();
        $this->services    = new ServiceModel();
        $this->users       = new UserModel();
    }

    // ── GET /api/admin/leaves ────────────────────────────────────────────────

    /**
     * List all leave records.
     * Query: status (active|cancelled|''), user_id
     */
    public function index(): never
    {
        $status = trim((string)$this->query('status', ''));
        $userId = (int)$this->query('user_id', 0);

        $rows = $this->leaves->list($status, $userId);

        // Attach full assignments + summary counts to each row
        foreach ($rows as &$row) {
            $assignments = $this->assignments->listForLeave((int)$row['id']);
            $row['assignments']             = $assignments;
            $row['assignment_count']        = count($assignments);
            $row['active_assignment_count'] = count(array_filter($assignments, fn($a) => $a['revoked_at'] === null));
        }
        unset($row);

        $this->success($rows, 'Leaves retrieved');
    }

    // ── POST /api/admin/leaves ───────────────────────────────────────────────

    /**
     * Create a leave record for an employee.
     *
     * Body: { user_id, start_date, end_date, reason? }
     */
    public function store(): never
    {
        $body   = $this->getJsonBody();
        $actor  = $this->authUser();
        $errors = [];

        $userId = (int)($body['user_id'] ?? 0);
        if ($userId <= 0) {
            $errors[] = 'user_id is required.';
        }

        $startDate = trim((string)($body['start_date'] ?? ''));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate)) {
            $errors[] = 'start_date is required (YYYY-MM-DD).';
        }

        $endDate = trim((string)($body['end_date'] ?? ''));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate)) {
            $errors[] = 'end_date is required (YYYY-MM-DD).';
        }

        if ($errors !== []) {
            $this->error(implode(' ', $errors), 422);
        }

        if ($startDate > $endDate) {
            $this->error('end_date must be on or after start_date.', 422);
        }

        // Validate user exists
        if ($this->users->find($userId) === null) {
            $this->error('User not found.', 422);
        }

        // Block overlapping active leaves for the same user
        if ($this->leaves->hasOverlap($userId, $startDate, $endDate)) {
            $this->error('This user already has an active leave that overlaps the requested period.', 409);
        }

        $leaveId = $this->leaves->insert([
            'user_id'    => $userId,
            'start_date' => $startDate,
            'end_date'   => $endDate,
            'reason'     => $body['reason'] ?? null,
            'created_by' => $actor ? (int)$actor['id'] : null,
        ]);

        $leave = $this->leaves->find($leaveId);
        $this->success($leave, 'Leave created', 201);
    }

    // ── GET /api/admin/leaves/my-charges ────────────────────────────────────

    /**
     * Return services the authenticated user currently holds as temporary charge.
     * Only returns assignments active today (start_date <= today <= end_date)
     * and not revoked.
     *
     * This endpoint requires only `services.view` permission, not `users.manage`.
     */
    public function myTemporaryCharges(): never
    {
        $actor = $this->authUser();
        if ($actor === null) {
            $this->error('Unauthorized.', 401);
        }
        $today = (new \DateTimeImmutable('today'))->format('Y-m-d');

        $charges = $this->assignments->listActiveChargesForUser((int)$actor['id'], $today);

        $this->success($charges, 'Temporary charges retrieved');
    }

    // ── GET /api/admin/leaves/:id ────────────────────────────────────────────

    /**
     * Return a single leave with its full assignment list.
     */
    public function show(int $id): never
    {
        $leave = $this->leaves->find($id);
        if ($leave === null) {
            $this->error('Leave not found.', 404);
        }

        $leave['assignments'] = $this->assignments->listForLeave($id);

        $this->success($leave);
    }

    // ── PATCH /api/admin/leaves/:id ──────────────────────────────────────────

    /**
     * Update leave dates / reason, or cancel the leave entirely.
     *
     * Body: { start_date?, end_date?, reason?, status? }
     * Setting status = 'cancelled' triggers bulk revocation of all assignments.
     */
    public function update(int $id): never
    {
        $leave = $this->leaves->find($id);
        if ($leave === null) {
            $this->error('Leave not found.', 404);
        }

        $body  = $this->getJsonBody();
        $actor = $this->authUser();
        $data  = [];

        if (array_key_exists('reason', $body)) {
            $data['reason'] = $body['reason'];
        }

        $startDate = $leave['start_date'];
        $endDate   = $leave['end_date'];

        if (array_key_exists('start_date', $body)) {
            $startDate = trim((string)$body['start_date']);
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate)) {
                $this->error('start_date must be YYYY-MM-DD.', 422);
            }
            $data['start_date'] = $startDate;
        }
        if (array_key_exists('end_date', $body)) {
            $endDate = trim((string)$body['end_date']);
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate)) {
                $this->error('end_date must be YYYY-MM-DD.', 422);
            }
            $data['end_date'] = $endDate;
        }

        if ($startDate > $endDate) {
            $this->error('end_date must be on or after start_date.', 422);
        }

        // Check overlap if dates changed (exclude self)
        if (isset($data['start_date']) || isset($data['end_date'])) {
            if ($this->leaves->hasOverlap((int)$leave['user_id'], $startDate, $endDate, $id)) {
                $this->error('Updated dates overlap with another active leave for this user.', 409);
            }
        }

        // Handle cancellation
        if (array_key_exists('status', $body) && (string)$body['status'] === 'cancelled') {
            if ((string)$leave['status'] !== 'cancelled') {
                $actorId = $actor ? (int)$actor['id'] : 0;
                $this->leaves->cancel($id, $actorId);
                $updated = $this->leaves->find($id);
                $updated['assignments'] = $this->assignments->listForLeave($id);
                $this->success($updated, 'Leave cancelled and all handovers revoked');
            }
        }

        if ($data !== []) {
            $this->leaves->update($id, $data);
        }

        $updated = $this->leaves->find($id);
        $updated['assignments'] = $this->assignments->listForLeave($id);
        $this->success($updated, 'Leave updated');
    }

    // ── POST /api/admin/leaves/:id/handover ──────────────────────────────────

    /**
     * Assign services to temporary users for this leave period.
     * Partial allotment: each service row can go to a different user.
     *
     * Body: {
     *   assignments: [
     *     { service_id: 12, temp_user_id: 5 },
     *     { service_id: 13, temp_user_id: 7 },
     *     ...
     *   ]
     * }
     */
    public function handover(int $id): never
    {
        $leave = $this->leaves->find($id);
        if ($leave === null) {
            $this->error('Leave not found.', 404);
        }
        if ((string)$leave['status'] === 'cancelled') {
            $this->error('Cannot assign handovers to a cancelled leave.', 422);
        }

        $body        = $this->getJsonBody();
        $actor       = $this->authUser();
        $actorId     = $actor ? (int)$actor['id'] : 0;
        $rawList     = $body['assignments'] ?? [];

        if (!is_array($rawList) || $rawList === []) {
            $this->error('assignments must be a non-empty array.', 422);
        }

        $onLeaveUserId = (int)$leave['user_id'];
        $startDate     = (string)$leave['start_date'];
        $endDate       = (string)$leave['end_date'];

        $created = [];
        $errors  = [];

        foreach ($rawList as $idx => $item) {
            $serviceId  = (int)($item['service_id']  ?? 0);
            $tempUserId = (int)($item['temp_user_id'] ?? 0);

            if ($serviceId <= 0 || $tempUserId <= 0) {
                $errors[] = "Item #{$idx}: service_id and temp_user_id are required.";
                continue;
            }

            // Temp user must not be the employee on leave
            if ($tempUserId === $onLeaveUserId) {
                $errors[] = "Item #{$idx}: temp_user_id cannot be the same as the employee on leave.";
                continue;
            }

            // Service must exist
            $service = $this->services->find($serviceId);
            if ($service === null) {
                $errors[] = "Item #{$idx}: Service #{$serviceId} not found.";
                continue;
            }

            // Temp user must exist
            if ($this->users->find($tempUserId) === null) {
                $errors[] = "Item #{$idx}: User #{$tempUserId} not found.";
                continue;
            }

            // Determine original_user_id: first assignee from service_assignees,
            // falling back to the leave's user (may be one of many assignees)
            $assigneeIds = [];
            if (!empty($service['assignee_user_ids'])) {
                $decoded = json_decode((string)$service['assignee_user_ids'], true);
                if (is_array($decoded)) {
                    $assigneeIds = array_map('intval', $decoded);
                }
            }
            $originalUserId = in_array($onLeaveUserId, $assigneeIds, true) ? $onLeaveUserId : (int)($service['assigned_to'] ?? $onLeaveUserId);

            $newId = $this->assignments->upsert(
                $id,
                $serviceId,
                $originalUserId,
                $tempUserId,
                $startDate,
                $endDate,
                $actorId
            );
            $created[] = $newId;
        }

        if ($errors !== [] && $created === []) {
            $this->error('All assignments failed: ' . implode('; ', $errors), 422);
        }

        $updatedAssignments = $this->assignments->listForLeave($id);
        $this->success(
            ['assignments' => $updatedAssignments, 'errors' => $errors],
            count($errors) > 0 ? 'Handover partially saved' : 'Handover saved',
            count($errors) > 0 ? 207 : 200
        );
    }

    // ── DELETE /api/admin/leaves/:id/assignments/:aid ────────────────────────

    /**
     * Revoke a single temporary assignment (take back handover for one service).
     * Sets revoked_at = NOW() on the assignment row.
     */
    public function revokeAssignment(int $id, int $aid): never
    {
        $leave = $this->leaves->find($id);
        if ($leave === null) {
            $this->error('Leave not found.', 404);
        }

        $assignment = $this->assignments->find($aid);
        if ($assignment === null) {
            $this->error('Assignment not found.', 404);
        }
        if ((int)$assignment['leave_id'] !== $id) {
            $this->error('Assignment does not belong to this leave.', 404);
        }
        if ($assignment['revoked_at'] !== null) {
            $this->error('Assignment is already revoked.', 409);
        }

        $actor   = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : 0;

        $this->assignments->revoke($aid, $id, $actorId);

        $updatedAssignment = $this->assignments->find($aid);
        $this->success($updatedAssignment, 'Assignment revoked');
    }
}
