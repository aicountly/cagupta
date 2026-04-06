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

        return ['total' => $total, 'appointments' => $stmt->fetchAll()];
    }

    /**
     * Create a new appointment (calendar event).
     *
     * @param array<string, mixed> $data
     * @return int The new record's id.
     */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO calendar_events (
                title, description, event_date, start_time, end_time,
                event_type, client_id, assigned_to, client_name, staff_name, status, created_by
             ) VALUES (
                :title, :description, :event_date, :start_time, :end_time,
                :event_type, :client_id, :assigned_to, :client_name, :staff_name, :status, :created_by
             ) RETURNING id'
        );
        $stmt->execute([
            ':title'       => $data['title']       ?? '',
            ':description' => $data['description'] ?? null,
            ':event_date'  => $data['event_date']  ?? date('Y-m-d'),
            ':start_time'  => $data['start_time']  ?? null,
            ':end_time'    => $data['end_time']    ?? null,
            ':event_type'  => $data['event_type']  ?? 'in_person',
            ':client_id'   => $data['client_id']   ?? null,
            ':assigned_to' => $data['assigned_to'] ?? null,
            ':client_name' => $data['client_name'] ?? null,
            ':staff_name'  => $data['staff_name']  ?? null,
            ':status'      => $data['status']      ?? 'scheduled',
            ':created_by'  => $data['created_by']  ?? null,
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

        $allowed = ['title', 'description', 'event_date', 'start_time', 'end_time',
                    'event_type', 'client_name', 'staff_name', 'status'];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $setClauses[]       = "{$field} = :{$field}";
                $params[":{$field}"] = $data[$field];
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
