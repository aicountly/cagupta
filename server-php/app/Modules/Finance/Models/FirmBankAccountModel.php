<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class FirmBankAccountModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT f.*, bf.name AS billing_firm_name
             FROM firm_bank_accounts f
             JOIN billing_firms bf ON bf.code = f.billing_firm_code
             WHERE f.id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /** @return array<int, array<string, mixed>> */
    public function listByFirmCode(string $code, bool $activeOnly = true): array
    {
        $code = trim($code);
        $sql  = 'SELECT * FROM firm_bank_accounts WHERE billing_firm_code = :c';
        if ($activeOnly) {
            $sql .= ' AND is_active = TRUE';
        }
        $sql .= ' ORDER BY name ASC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':c' => $code]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /** @return array<int, array<string, mixed>> */
    public function all(): array
    {
        $stmt = $this->db->query(
            'SELECT f.*, bf.name AS billing_firm_name
             FROM firm_bank_accounts f
             JOIN billing_firms bf ON bf.code = f.billing_firm_code
             ORDER BY bf.name ASC, f.name ASC'
        );
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /** @param array{billing_firm_code:string, name:string, account_type:string, currency?:string, is_active?:bool, opening_balance?:float, opening_balance_date?:string|null, account_number_last4?:string, ifsc?:string, notes?:string} $data */
    public function create(array $data): array
    {
        $stmt = $this->db->prepare(
            'INSERT INTO firm_bank_accounts (
                billing_firm_code, name, account_type, currency, is_active,
                opening_balance, opening_balance_date, account_number_last4, ifsc, notes
             ) VALUES (
                :bf, :name, :atype, :cur, :active, :obal, :odate, :last4, :ifsc, :notes
             ) RETURNING *'
        );
        $stmt->execute([
            ':bf'    => $data['billing_firm_code'],
            ':name'  => $data['name'],
            ':atype' => $data['account_type'],
            ':cur'   => $data['currency'] ?? 'INR',
            ':active'=> isset($data['is_active']) ? ($data['is_active'] ? true : false) : true,
            ':obal'  => $data['opening_balance'] ?? 0,
            ':odate' => $data['opening_balance_date'] ?? null,
            ':last4' => $data['account_number_last4'] ?? null,
            ':ifsc'  => $data['ifsc'] ?? null,
            ':notes' => $data['notes'] ?? null,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            throw new \RuntimeException('Failed to create bank account.');
        }
        return $row;
    }

    public function update(int $id, array $data): void
    {
        $sets   = ['updated_at = NOW()'];
        $params = [':id' => $id];
        if (array_key_exists('name', $data)) {
            $sets[] = 'name = :name';
            $params[':name'] = $data['name'];
        }
        if (array_key_exists('account_type', $data)) {
            $sets[] = 'account_type = :atype';
            $params[':atype'] = $data['account_type'];
        }
        if (array_key_exists('is_active', $data)) {
            $sets[] = 'is_active = :active';
            $params[':active'] = $data['is_active'] ? true : false;
        }
        if (array_key_exists('opening_balance', $data)) {
            $sets[] = 'opening_balance = :obal';
            $params[':obal'] = $data['opening_balance'];
        }
        if (array_key_exists('opening_balance_date', $data)) {
            $sets[] = 'opening_balance_date = :odate';
            $params[':odate'] = $data['opening_balance_date'];
        }
        if (array_key_exists('account_number_last4', $data)) {
            $sets[] = 'account_number_last4 = :last4';
            $params[':last4'] = $data['account_number_last4'];
        }
        if (array_key_exists('ifsc', $data)) {
            $sets[] = 'ifsc = :ifsc';
            $params[':ifsc'] = $data['ifsc'];
        }
        if (array_key_exists('notes', $data)) {
            $sets[] = 'notes = :notes';
            $params[':notes'] = $data['notes'];
        }
        $sql = 'UPDATE firm_bank_accounts SET ' . implode(', ', $sets) . ' WHERE id = :id';
        $this->db->prepare($sql)->execute($params);
    }

    public function delete(int $id): void
    {
        $this->db->prepare('DELETE FROM firm_bank_accounts WHERE id = :id')->execute([':id' => $id]);
    }

    public function countTxnReferences(int $id): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) FROM txn
             WHERE status = \'active\'
               AND (firm_bank_account_id = :id OR counterparty_firm_bank_account_id = :id)'
        );
        $stmt->execute([':id' => $id]);
        return (int)$stmt->fetchColumn();
    }

    /** Assert account belongs to billing profile code. */
    public function assertMatchesBillingProfile(int $accountId, string $billingProfileCode): void
    {
        $code = trim($billingProfileCode);
        if ($code === '') {
            throw new \InvalidArgumentException('billing_profile_code is required when selecting a bank account.');
        }
        $acc = $this->find($accountId);
        if ($acc === null || !($acc['is_active'] ?? true)) {
            throw new \InvalidArgumentException('Invalid or inactive bank account.');
        }
        if ((string)$acc['billing_firm_code'] !== $code) {
            throw new \InvalidArgumentException('Bank account does not belong to the selected billing firm.');
        }
    }
}
