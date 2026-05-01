<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * AppointmentModel — CRUD operations for the `calendar_events` table.
 *
 * The appointments feature maps to calendar_events with event_type used to
 * store the appointment mode (in_person, video, phone).
 */
class AppointmentModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Find an appointment by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT ce.*,
                    u.name  AS assigned_to_name,
                    cb.name AS created_by_name
             FROM calendar_events ce
             LEFT JOIN users u  ON u.id  = ce.assigned_to
             LEFT JOIN users cb ON cb.id = ce.created_by
             WHERE ce.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if ($row && isset($row['billing_profile_snapshot']) && is_string($row['billing_profile_snapshot'])) {
            try {
                $row['billing_profile_snapshot'] = json_decode(
                    $row['billing_profile_snapshot'],
                    true,
                    512,
                    JSON_THROW_ON_ERROR
                );
            } catch (\JsonException) {
                $row['billing_profile_snapshot'] = null;
            }
        }

        return $row ?: null;
    }

    /**
     * Return a paginated list of appointments.
     *
     * @return array{total: int, appointments: array<int, array<string, mixed>>}
     */
    public function paginate(
        int    $page    = 1,
        int    $perPage = 20,
        string $search  = ''
    ): array {
        $where  = ['1=1'];
        $params = [];

        if ($search !== '') {
            $where[]           = "(ce.title ILIKE :search OR ce.description ILIKE :search OR ce.client_name ILIKE :search)";
            $params[':search'] = "%{$search}%";
        }

        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM calendar_events ce WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT ce.*, u.name AS assigned_to_name
             FROM calendar_events ce
             LEFT JOIN users u ON u.id = ce.assigned_to
             WHERE {$whereClause}
             ORDER BY ce.event_date DESC, ce.start_time ASC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit',  $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset,  PDO::PARAM_INT);
        $stmt->execute();

        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            if (isset($row['billing_profile_snapshot']) && is_string($row['billing_profile_snapshot'])) {
                try {
                    $row['billing_profile_snapshot'] = json_decode(
                        $row['billing_profile_snapshot'],
                        true,
                        512,
                        JSON_THROW_ON_ERROR
                    );
                } catch (\JsonException) {
                    $row['billing_profile_snapshot'] = null;
                }
            }
        }
        unset($row);

        return ['total' => $total, 'appointments' => $rows];
    }

    /**
     * Create a new appointment (calendar event).
     *
     * @param array<string, mixed> $data
     * @return int The new record's id.
     */
    public function create(array $data): int
    {
        $snap = $data['billing_profile_snapshot'] ?? null;
        $snapJson = '{}';
        if (is_array($snap)) {
            $snapJson = json_encode($snap, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        }

        $stmt = $this->db->prepare(
            'INSERT INTO calendar_events (
                title, description, event_date, start_time, end_time,
                event_type, client_id, assigned_to, client_name, staff_name, status, created_by,
                fee_rule_id, pricing_model, unit_amount, billable_hours, fee_subtotal,
                billing_profile_code, billing_profile_snapshot, billing_organization_id,
                payment_terms, advance_amount, advance_percent, amount_due_now, amount_collected,
                appointment_status, razorpay_order_id, invoice_txn_id,
                zoom_meeting_id, zoom_join_url, zoom_password, zoom_last_synced_at, zoom_sync_error,
                invoice_line_description, invoice_line_kind
             ) VALUES (
                :title, :description, :event_date, :start_time, :end_time,
                :event_type, :client_id, :assigned_to, :client_name, :staff_name, :status, :created_by,
                :fee_rule_id, :pricing_model, :unit_amount, :billable_hours, :fee_subtotal,
                :billing_profile_code, CAST(:billing_profile_snapshot AS jsonb), :billing_organization_id,
                :payment_terms, :advance_amount, :advance_percent, :amount_due_now, :amount_collected,
                :appointment_status, :razorpay_order_id, :invoice_txn_id,
                :zoom_meeting_id, :zoom_join_url, :zoom_password, :zoom_last_synced_at, :zoom_sync_error,
                :invoice_line_description, :invoice_line_kind
             ) RETURNING id'
        );
        $stmt->execute([
            ':title'                      => $data['title']       ?? '',
            ':description'                => $data['description'] ?? null,
            ':event_date'                 => $data['event_date']  ?? date('Y-m-d'),
            ':start_time'                 => $data['start_time']  ?? null,
            ':end_time'                   => $data['end_time']    ?? null,
            ':event_type'                 => $data['event_type']  ?? 'in_person',
            ':client_id'                  => $data['client_id']   ?? null,
            ':assigned_to'                => $data['assigned_to'] ?? null,
            ':client_name'                => $data['client_name'] ?? null,
            ':staff_name'                 => $data['staff_name']  ?? null,
            ':status'                     => $data['status']      ?? 'scheduled',
            ':created_by'                 => $data['created_by']  ?? null,
            ':fee_rule_id'                => $data['fee_rule_id'] ?? null,
            ':pricing_model'              => $data['pricing_model'] ?? null,
            ':unit_amount'                => $data['unit_amount'] ?? null,
            ':billable_hours'             => $data['billable_hours'] ?? null,
            ':fee_subtotal'               => $data['fee_subtotal'] ?? null,
            ':billing_profile_code'       => $data['billing_profile_code'] ?? null,
            ':billing_profile_snapshot'   => $snapJson,
            ':billing_organization_id'   => $data['billing_organization_id'] ?? null,
            ':payment_terms'              => $data['payment_terms'] ?? null,
            ':advance_amount'             => $data['advance_amount'] ?? null,
            ':advance_percent'            => $data['advance_percent'] ?? null,
            ':amount_due_now'             => $data['amount_due_now'] ?? null,
            ':amount_collected'           => $data['amount_collected'] ?? 0,
            ':appointment_status'         => $data['appointment_status'] ?? 'confirmed',
            ':razorpay_order_id'          => $data['razorpay_order_id'] ?? null,
            ':invoice_txn_id'             => $data['invoice_txn_id'] ?? null,
            ':zoom_meeting_id'            => $data['zoom_meeting_id'] ?? null,
            ':zoom_join_url'              => $data['zoom_join_url'] ?? null,
            ':zoom_password'              => $data['zoom_password'] ?? null,
            ':zoom_last_synced_at'        => $data['zoom_last_synced_at'] ?? null,
            ':zoom_sync_error'            => $data['zoom_sync_error'] ?? null,
            ':invoice_line_description'   => $data['invoice_line_description'] ?? null,
            ':invoice_line_kind'          => $data['invoice_line_kind'] ?? null,
        ]);

        return (int)$stmt->fetchColumn();
    }

    /**
     * Update an existing appointment.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $setClauses = [];
        $params     = [':id' => $id];

        $allowed = [
            'title', 'description', 'event_date', 'start_time', 'end_time',
            'event_type', 'client_name', 'staff_name', 'status', 'client_id',
            'fee_rule_id', 'pricing_model', 'unit_amount', 'billable_hours', 'fee_subtotal',
            'billing_profile_code', 'billing_organization_id',
            'payment_terms', 'advance_amount', 'advance_percent', 'amount_due_now', 'amount_collected',
            'appointment_status', 'razorpay_order_id', 'invoice_txn_id',
            'zoom_meeting_id', 'zoom_join_url', 'zoom_password', 'zoom_last_synced_at', 'zoom_sync_error',
            'invoice_line_description', 'invoice_line_kind',
        ];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $setClauses[]       = "{$field} = :{$field}";
                $params[":{$field}"] = $data[$field];
            }
        }
        if (array_key_exists('billing_profile_snapshot', $data)) {
            $snap = $data['billing_profile_snapshot'];
            if ($snap === null) {
                $setClauses[] = 'billing_profile_snapshot = NULL';
            } elseif (is_array($snap)) {
                $setClauses[]                   = 'billing_profile_snapshot = CAST(:billing_profile_snapshot AS jsonb)';
                $params[':billing_profile_snapshot'] = json_encode($snap, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            }
        }

        if (empty($setClauses)) {
            return false;
        }

        $setClauses[] = 'updated_at = NOW()';
        $setClause    = implode(', ', $setClauses);

        $stmt = $this->db->prepare("UPDATE calendar_events SET {$setClause} WHERE id = :id");

        return $stmt->execute($params);
    }

    /**
     * Delete an appointment.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM calendar_events WHERE id = :id');

        return $stmt->execute([':id' => $id]);
    }
}
