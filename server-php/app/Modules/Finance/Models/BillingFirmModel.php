<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class BillingFirmModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /** @return array<int, array<string, mixed>> */
    public function all(): array
    {
        $stmt = $this->db->query(
            'SELECT code, name, gst_registered, gstin, state_code, default_gst_rate::float AS default_gst_rate,
                    created_at, updated_at
             FROM billing_firms ORDER BY name ASC'
        );
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /** @return array<string, mixed>|null */
    public function findByCode(string $code): ?array
    {
        $code = trim($code);
        if ($code === '') {
            return null;
        }
        $stmt = $this->db->prepare(
            'SELECT code, name, gst_registered, gstin, state_code, default_gst_rate::float AS default_gst_rate,
                    created_at, updated_at
             FROM billing_firms WHERE code = :c LIMIT 1'
        );
        $stmt->execute([':c' => $code]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /** @param array{name:string, gst_registered:bool, gstin?:string, state_code?:string, default_gst_rate:float|int} $data */
    public function create(string $code, array $data): array
    {
        $stmt = $this->db->prepare(
            'INSERT INTO billing_firms (code, name, gst_registered, gstin, state_code, default_gst_rate)
             VALUES (:code, :name, :gst_reg, :gstin, :state_code, :gst_rate)
             RETURNING code, name, gst_registered, gstin, state_code, default_gst_rate::float AS default_gst_rate, created_at, updated_at'
        );
        $stmt->execute([
            ':code'       => $code,
            ':name'       => $data['name'],
            ':gst_reg'    => (bool)$data['gst_registered'] ? 'true' : 'false',
            ':gstin'      => $data['gstin'] ?? '',
            ':state_code' => $data['state_code'] ?? '',
            ':gst_rate'   => $data['default_gst_rate'],
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            throw new \RuntimeException('Failed to create billing firm.');
        }
        return $row;
    }

    /** @param array{name?:string, gst_registered?:bool, gstin?:string, state_code?:string, default_gst_rate?:float|int} $data */
    public function update(string $code, array $data): void
    {
        $sets  = ['updated_at = NOW()'];
        $params = [':code' => $code];
        if (array_key_exists('name', $data)) {
            $sets[]          = 'name = :name';
            $params[':name'] = $data['name'];
        }
        if (array_key_exists('gst_registered', $data)) {
            $sets[]               = 'gst_registered = :gst_reg';
            $params[':gst_reg']   = (bool)$data['gst_registered'] ? 'true' : 'false';
        }
        if (array_key_exists('gstin', $data)) {
            $sets[]            = 'gstin = :gstin';
            $params[':gstin']  = $data['gstin'];
        }
        if (array_key_exists('state_code', $data)) {
            $sets[]                 = 'state_code = :state_code';
            $params[':state_code']  = $data['state_code'];
        }
        if (array_key_exists('default_gst_rate', $data)) {
            $sets[]                = 'default_gst_rate = :gst_rate';
            $params[':gst_rate']   = $data['default_gst_rate'];
        }
        $sql = 'UPDATE billing_firms SET ' . implode(', ', $sets) . ' WHERE code = :code';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
    }

    public function delete(string $code): void
    {
        $stmt = $this->db->prepare('DELETE FROM billing_firms WHERE code = :c');
        $stmt->execute([':c' => $code]);
    }

    public function countTxnReferences(string $code): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) FROM txn WHERE billing_profile_code = :c AND status = \'active\''
        );
        $stmt->execute([':c' => $code]);
        return (int)$stmt->fetchColumn();
    }

    public function countBankAccounts(string $code): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) FROM firm_bank_accounts WHERE billing_firm_code = :c'
        );
        $stmt->execute([':c' => $code]);
        return (int)$stmt->fetchColumn();
    }
}
