<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Auth as AuthConfig;
use App\Config\Database;
use App\Controllers\BaseController;
use App\Libraries\AppointmentBookingService;
use App\Libraries\AppointmentInvoiceBuilder;
use App\Libraries\AppointmentPaymentHooks;
use App\Libraries\RazorpayClient;
use App\Libraries\ZoomMeetingService;
use App\Models\AppointmentModel;
use App\Models\TxnModel;
use App\Models\UserModel;

/**
 * AppointmentController — CRUD for calendar_events (appointments).
 */
class AppointmentController extends BaseController
{
    private AppointmentModel $appointments;

    public function __construct()
    {
        $this->appointments = new AppointmentModel();
    }

    // ── GET /api/admin/appointments ──────────────────────────────────────────

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

    public function store(): never
    {
        $body  = $this->getJsonBody();
        $title = trim((string)($body['title'] ?? $body['subject'] ?? ''));
        if ($title === '') {
            $this->error('title (subject) is required.', 422);
        }

        $actingUser = $this->authUser();
        $createdBy  = $actingUser ? (int)$actingUser['id'] : null;

        $db    = Database::getConnection();
        $newId = 0;
        $db->beginTransaction();
        try {
            $billingPatch = [];
            if (!empty($body['fee_rule_id'])) {
                $billingPatch = AppointmentBookingService::buildBillingPatch($body);
            }

            $row = [
                'title'        => $title,
                'description'  => $body['description'] ?? $body['subject'] ?? null,
                'event_date'   => $body['event_date']  ?? $body['date'] ?? date('Y-m-d'),
                'start_time'   => $body['start_time']  ?? null,
                'end_time'     => $body['end_time']    ?? null,
                'event_type'   => $body['event_type']  ?? $body['mode'] ?? 'in_person',
                'client_id'    => isset($body['client_id']) ? (int)$body['client_id'] : null,
                'client_name'  => $body['client_name'] ?? null,
                'staff_name'   => $body['staff_name']  ?? null,
                'status'       => $body['status']      ?? 'scheduled',
                'created_by'   => $createdBy,
            ];
            if ($billingPatch !== []) {
                $row = array_merge($row, $billingPatch);
                $preview = $row;
                $preview['id'] = 0;
                $invoiceTotal = AppointmentBookingService::previewInvoiceTotal($preview);
                $row['amount_due_now'] = AppointmentBookingService::computeAmountDueNow($row, $invoiceTotal);
                $row['appointment_status'] = AppointmentBookingService::initialAppointmentStatus(
                    (string)$row['payment_terms']
                );
            } else {
                $row['appointment_status'] = 'confirmed';
            }

            $newId = $this->appointments->create($row);

            if ($billingPatch !== []) {
                $apt = $this->appointments->find($newId);
                if ($apt === null) {
                    throw new \RuntimeException('Appointment not found after insert.');
                }
                $invId = AppointmentInvoiceBuilder::createInvoiceForAppointment($apt, $createdBy);
                $this->appointments->update($newId, ['invoice_txn_id' => $invId]);
            }

            $db->commit();
        } catch (\InvalidArgumentException $e) {
            $db->rollBack();
            $this->error($e->getMessage(), 422);
        } catch (\Throwable $e) {
            $db->rollBack();
            error_log('[AppointmentController::store] ' . $e->getMessage());
            $msg = $e->getMessage();
            if (str_contains($msg, 'GSTIN') || str_contains($msg, 'billing_') || str_contains($msg, 'line item')) {
                $this->error($msg, 422);
            }
            $this->error('Could not create appointment.', 500);
        }

        $appointment = $this->appointments->find($newId);
        if ($appointment === null) {
            $this->error('Appointment not found.', 500);
        }

        if (!empty($body['fee_rule_id'])
            && ($appointment['appointment_status'] ?? '') === 'confirmed'
            && in_array(strtolower((string)($appointment['event_type'] ?? '')), ['video', 'online'], true)
        ) {
            $this->syncZoomSafe($appointment);
        }

        $this->success($appointment, 'Appointment created', 201);
    }

    // ── GET /api/admin/appointments/:id ──────────────────────────────────────

    public function show(int $id): never
    {
        $appointment = $this->appointments->find($id);
        if ($appointment === null) {
            $this->error('Appointment not found.', 404);
        }
        $this->success($appointment);
    }

    // ── PUT /api/admin/appointments/:id ──────────────────────────────────────

    public function update(int $id): never
    {
        $appointment = $this->appointments->find($id);
        if ($appointment === null) {
            $this->error('Appointment not found.', 404);
        }

        $body = $this->getJsonBody();
        $data  = [];

        $allowed = ['title', 'description', 'event_date', 'start_time', 'end_time',
                    'event_type', 'client_name', 'staff_name', 'status', 'client_id',
                    'billing_organization_id', 'fee_rule_id', 'payment_terms',
                    'advance_amount', 'advance_percent', 'billing_profile_code',
                    'billing_profile_snapshot', 'invoice_line_description', 'invoice_line_kind',
                    'billable_hours', 'appointment_status'];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
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

        if ($data !== []) {
            $this->appointments->update($id, $data);
        }
        $updated = $this->appointments->find($id);
        if ($updated !== null
            && ($updated['appointment_status'] ?? '') === 'confirmed'
            && in_array(strtolower((string)($updated['event_type'] ?? '')), ['video', 'online'], true)
        ) {
            $this->syncZoomSafe($updated);
        }
        $this->success($updated, 'Appointment updated');
    }

    // ── DELETE /api/admin/appointments/:id ───────────────────────────────────

    public function destroy(int $id): never
    {
        $appointment = $this->appointments->find($id);
        if ($appointment === null) {
            $this->error('Appointment not found.', 404);
        }
        $mid = trim((string)($appointment['zoom_meeting_id'] ?? ''));
        if ($mid !== '') {
            $super = (new UserModel())->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
            if ($super !== null) {
                try {
                    ZoomMeetingService::deleteMeeting((int)$super['id'], $mid);
                } catch (\Throwable $e) {
                    error_log('[AppointmentController::destroy] Zoom delete: ' . $e->getMessage());
                }
            }
        }

        $this->appointments->delete($id);
        $this->success(null, 'Appointment deleted');
    }

    // ── POST /api/admin/appointments/:id/razorpay-order ──────────────────────

    public function razorpayOrder(int $id): never
    {
        $apt = $this->appointments->find($id);
        if ($apt === null) {
            $this->error('Appointment not found.', 404);
        }
        $invoiceId = (int)($apt['invoice_txn_id'] ?? 0);
        if ($invoiceId <= 0) {
            $this->error('No invoice linked to this appointment.', 422);
        }
        $txn   = new TxnModel();
        $inv   = $txn->find($invoiceId);
        if ($inv === null || ($inv['txn_type'] ?? '') !== 'invoice') {
            $this->error('Invoice transaction not found.', 404);
        }
        $total = (float)($inv['amount'] ?? 0);
        $paid  = $txn->sumLinkedReceipts($invoiceId);
        $remaining = max(0, round($total - $paid, 2));
        if ($remaining <= 0) {
            $this->error('Invoice is already fully paid.', 422);
        }

        $rz = new RazorpayClient();
        if (!$rz->isConfigured()) {
            $this->error('Razorpay is not configured on the server.', 503);
        }

        $amountInr = $remaining;
        $body      = $this->getJsonBody();
        if (isset($body['amount']) && (float)$body['amount'] > 0) {
            $amountInr = min($remaining, round((float)$body['amount'], 2));
        }
        $paise = (int)round($amountInr * 100);
        if ($paise < 100) {
            $this->error('Order amount must be at least ₹1.', 422);
        }

        $receipt = 'appt_' . $id . '_' . time();
        $order   = $rz->createOrder($paise, $receipt, [
            'appointment_id'  => (string)$id,
            'invoice_txn_id'  => (string)$invoiceId,
        ]);
        $orderId = (string)($order['id'] ?? '');
        if ($orderId === '') {
            $this->error('Razorpay did not return an order id.', 502);
        }
        $this->appointments->update($id, ['razorpay_order_id' => $orderId]);

        $this->success([
            'orderId'     => $orderId,
            'amount'      => $amountInr,
            'amountPaise' => $paise,
            'currency'    => 'INR',
            'keyId'       => trim((string)(getenv('RAZORPAY_KEY_ID') ?: '')),
        ], 'Razorpay order created');
    }

    /**
     * @param array<string, mixed> $appointment
     */
    private function syncZoomSafe(array $appointment): void
    {
        $super = (new UserModel())->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
        if ($super === null) {
            return;
        }
        try {
            ZoomMeetingService::syncForAppointment((int)$super['id'], $appointment);
        } catch (\Throwable $e) {
            error_log('[AppointmentController] Zoom: ' . $e->getMessage());
        }
    }
}
