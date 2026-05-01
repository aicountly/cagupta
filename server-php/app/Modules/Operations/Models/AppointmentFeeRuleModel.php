<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * CRUD for appointment_fee_rules (pricing templates for calendar bookings).
 */
class AppointmentFeeRuleModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /** @return array<int, array<string, mixed>> */
    public function listActive(): array
    {
        $stmt = $this->db->query(
            'SELECT * FROM appointment_fee_rules WHERE is_active = TRUE ORDER BY name ASC'
        );
        return $stmt->fetchAll() ?: [];
    }

    /** @return array<int, array<string, mixed>> */
    public function listAll(): array
    {
        $stmt = $this->db->query(
            'SELECT * FROM appointment_fee_rules ORDER BY name ASC'
        );
        return $stmt->fetchAll() ?: [];
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM appointment_fee_rules WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO appointment_fee_rules (
                name, pricing_model, amount, default_billing_profile_code,
                default_line_description, default_line_kind, is_active
             ) VALUES (
                :name, :pricing_model, :amount, :default_billing_profile_code,
                :default_line_description, :default_line_kind, :is_active
             ) RETURNING id'
        );
        $stmt->execute([
            ':name'                         => $data['name'],
            ':pricing_model'                => $data['pricing_model'],
            ':amount'                       => (float)($data['amount'] ?? 0),
            ':default_billing_profile_code' => $data['default_billing_profile_code'] ?? null,
            ':default_line_description'     => $data['default_line_description'] ?? null,
            ':default_line_kind'            => $data['default_line_kind'] ?? 'professional_fee',
            ':is_active'                    => isset($data['is_active']) ? (bool)$data['is_active'] : true,
        ]);
        return (int)$stmt->fetchColumn();
    }

    /** @param array<string, mixed> $data */
    public function update(int $id, array $data): bool
    {
        $sets   = [];
        $params = [':id' => $id];
        $map    = [
            'name', 'pricing_model', 'amount', 'default_billing_profile_code',
            'default_line_description', 'default_line_kind', 'is_active',
        ];
        foreach ($map as $col) {
            if (array_key_exists($col, $data)) {
                $sets[]            = "{$col} = :{$col}";
                $params[":{$col}"] = $data[$col];
            }
        }
        if ($sets === []) {
            return false;
        }
        $sets[] = 'updated_at = NOW()';
        $sql    = 'UPDATE appointment_fee_rules SET ' . implode(', ', $sets) . ' WHERE id = :id';
        $stmt   = $this->db->prepare($sql);
        return $stmt->execute($params);
    }

    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM appointment_fee_rules WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }
}
