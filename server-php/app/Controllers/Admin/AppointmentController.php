<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\AppointmentModel;

/**
 * AppointmentController — CRUD for calendar_events (appointments).
 *
 * All endpoints require Bearer token + role: super_admin or admin.
 */
class AppointmentController extends BaseController
{
    private AppointmentModel $appointments;

    public function __construct()
    {
        $this->appointments = new AppointmentModel();
    }

    // ── GET /api/admin/appointments ──────────────────────────────────────────

    /**
     * Return a paginated list of appointments.
     *
     * Query params: page, per_page, search
     */
    public function index(): never
    {
        $page    = max(1, (int)$this->query('page', 1));
        $perPage = min(100, max(1, (int)$this->query('per_page', 20)));
        $search  = trim((string)$this->query('search', ''));

        $result = $this->appointments->paginate($page, $perPage, $search);

        $this->success($result['appointments'], 'Appointments retrieved', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => (int)ceil($result['total'] / $perPage),
            ],
        ]);
    }

    // ── POST /api/admin/appointments ─────────────────────────────────────────

    /**
     * Create a new appointment.
     *
     * Body: { title, description?, event_date, start_time?, end_time?,
     *         event_type?, client_name?, staff_name?, status? }
     */
    public function store(): never
    {
        $body  = $this->getJsonBody();
        $title = trim((string)($body['title'] ?? ''));

        if ($title === '') {
            $this->error('title (subject) is required.', 422);
        }

        $actingUser = $this->authUser();

        $newId = $this->appointments->create([
            'title'       => $title,
            'description' => $body['description'] ?? $body['subject'] ?? null,
            'event_date'  => $body['event_date']  ?? $body['date'] ?? date('Y-m-d'),
            'start_time'  => $body['start_time']  ?? null,
            'end_time'    => $body['end_time']    ?? null,
            'event_type'  => $body['event_type']  ?? $body['mode'] ?? 'in_person',
            'client_name' => $body['client_name'] ?? null,
            'staff_name'  => $body['staff_name']  ?? null,
            'status'      => $body['status']      ?? 'scheduled',
            'created_by'  => $actingUser ? (int)$actingUser['id'] : null,
        ]);

        $appointment = $this->appointments->find($newId);
        $this->success($appointment, 'Appointment created', 201);
    }

    // ── GET /api/admin/appointments/:id ──────────────────────────────────────

    /**
     * Return a single appointment.
     */
    public function show(int $id): never
    {
        $appointment = $this->appointments->find($id);
        if ($appointment === null) {
            $this->error('Appointment not found.', 404);
        }
        $this->success($appointment);
    }

    // ── PUT /api/admin/appointments/:id ──────────────────────────────────────

    /**
     * Update an appointment.
     */
    public function update(int $id): never
    {
        $appointment = $this->appointments->find($id);
        if ($appointment === null) {
            $this->error('Appointment not found.', 404);
        }

        $body = $this->getJsonBody();
        $data = [];

        $allowed = ['title', 'description', 'event_date', 'start_time', 'end_time',
                    'event_type', 'client_name', 'staff_name', 'status'];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        // Support UI field aliases
        if (array_key_exists('date', $body) && !isset($data['event_date'])) {
            $data['event_date'] = $body['date'];
        }
        if (array_key_exists('mode', $body) && !isset($data['event_type'])) {
            $data['event_type'] = $body['mode'];
        }
        if (array_key_exists('subject', $body) && !isset($data['title'])) {
            $data['title']       = $body['subject'];
            $data['description'] = $body['subject'];
        }

        $this->appointments->update($id, $data);
        $updated = $this->appointments->find($id);
        $this->success($updated, 'Appointment updated');
    }

    // ── DELETE /api/admin/appointments/:id ───────────────────────────────────

    /**
     * Delete an appointment.
     */
    public function destroy(int $id): never
    {
        $appointment = $this->appointments->find($id);
        if ($appointment === null) {
            $this->error('Appointment not found.', 404);
        }

        $this->appointments->delete($id);
        $this->success(null, 'Appointment deleted');
    }
}
