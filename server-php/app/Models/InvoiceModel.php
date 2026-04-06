<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * InvoiceModel — CRUD operations for the `invoices` table.
 */
class InvoiceModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Find an invoice by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT i.*,
                    COALESCE(c.organization_name,
                             TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))),
                             'Unknown') AS client_name
             FROM invoices i
             LEFT JOIN clients c ON c.id = i.client_id
             WHERE i.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Return a paginated list of invoices.
     *
     * @return array{total: int, invoices: array<int, array<string, mixed>>}
     */
    public function paginate(
        int    $page    = 1,
        int    $perPage = 20,
        string $search  = '',
        string $status  = ''
    ): array {
        $where  = ['1=1'];
        $params = [];

        if ($search !== '') {
            $where[]           = "(i.invoice_number ILIKE :search
                                   OR c.first_name ILIKE :search
                                   OR c.last_name  ILIKE :search
                                   OR c.organization_name ILIKE :search)";
            $params[':search'] = "%{$search}%";
        }
        if ($status !== '') {
            $where[]           = 'i.status = :status';
            $params[':status'] = $status;
        }

        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT i.*,
                    COALESCE(c.organization_name,
                             TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))),
                             'Unknown') AS client_name
             FROM invoices i
             LEFT JOIN clients c ON c.id = i.client_id
             WHERE {$whereClause}
             ORDER BY i.created_at DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit',  $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset,  PDO::PARAM_INT);
        $stmt->execute();

        return ['total' => $total, 'invoices' => $stmt->fetchAll()];
    }

    /**
     * Create a new invoice record.
     *
     * @param array<string, mixed> $data
     * @return int The new invoice's id.
     */
    public function create(array $data): int
    {
        // Auto-generate invoice number if not provided
        $invoiceNumber = $data['invoice_number'] ?? $this->generateInvoiceNumber();

        $stmt = $this->db->prepare(
            'INSERT INTO invoices (
                invoice_number, client_id, organization_id, service_id,
                invoice_date, due_date, subtotal, tax_percent, tax_amount, total,
                amount_paid, status, notes, billing_profile_code, created_by
             ) VALUES (
                :invoice_number, :client_id, :organization_id, :service_id,
                :invoice_date, :due_date, :subtotal, :tax_percent, :tax_amount, :total,
                :amount_paid, :status, :notes, :billing_profile_code, :created_by
             ) RETURNING id'
        );

        $total    = (float)($data['total'] ?? 0);
        $subtotal = (float)($data['subtotal'] ?? $total);

        $stmt->execute([
            ':invoice_number'      => $invoiceNumber,
            ':client_id'           => $data['client_id']           ?? null,
            ':organization_id'     => $data['organization_id']     ?? null,
            ':service_id'          => $data['service_id']          ?? null,
            ':invoice_date'        => $data['invoice_date']        ?? date('Y-m-d'),
            ':due_date'            => $data['due_date']            ?? null,
            ':subtotal'            => $subtotal,
            ':tax_percent'         => (float)($data['tax_percent'] ?? 0),
            ':tax_amount'          => (float)($data['tax_amount']  ?? 0),
            ':total'               => $total,
            ':amount_paid'         => (float)($data['amount_paid'] ?? 0),
            ':status'              => $data['status']              ?? 'draft',
            ':notes'               => $data['notes']              ?? null,
            ':billing_profile_code'=> $data['billing_profile_code'] ?? null,
            ':created_by'          => $data['created_by']          ?? null,
        ]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Update an existing invoice.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $setClauses = [];
        $params     = [':id' => $id];

        $allowed = ['status', 'amount_paid', 'notes', 'due_date', 'billing_profile_code'];
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

        $stmt = $this->db->prepare("UPDATE invoices SET {$setClause} WHERE id = :id");
        return $stmt->execute($params);
    }

    /**
     * Delete an invoice record.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM invoices WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }

    /**
     * Return chronological ledger entries (invoices as debits, payments as credits)
     * for a given client, with a running balance.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getLedgerByClient(int $clientId): array
    {
        // Combine invoice rows (debit) and payment rows (credit) into a single set
        $stmt = $this->db->prepare(
            "SELECT
                i.invoice_date        AS date,
                i.invoice_number      AS narration,
                i.total               AS debit,
                0                     AS credit,
                i.billing_profile_code AS billing_profile_code,
                'invoice'             AS entry_type
             FROM invoices i
             WHERE i.client_id = :client_id

             UNION ALL

             SELECT
                p.payment_date        AS date,
                CONCAT('Payment received – ', COALESCE(p.payment_method, 'Transfer')) AS narration,
                0                     AS debit,
                p.amount              AS credit,
                p.billing_profile_code AS billing_profile_code,
                'payment'             AS entry_type
             FROM payments p
             JOIN invoices i ON i.id = p.invoice_id
             WHERE i.client_id = :client_id2

             ORDER BY date ASC, entry_type DESC"
        );
        $stmt->execute([':client_id' => $clientId, ':client_id2' => $clientId]);
        $rows = $stmt->fetchAll();

        // Compute running balance
        $balance = 0.0;
        foreach ($rows as &$row) {
            $balance += (float)$row['debit'] - (float)$row['credit'];
            $row['balance'] = $balance;
        }
        unset($row);

        return $rows;
    }

    /**
     * Record a payment for an invoice:
     *  - inserts a row into the `payments` table
     *  - updates invoice.amount_paid and recalculates invoice.status
     *
     * @param array<string, mixed> $data
     */
    public function addPayment(int $invoiceId, array $data): void
    {
        // Insert payment record
        $stmt = $this->db->prepare(
            'INSERT INTO payments (
                invoice_id, amount, payment_date, payment_method,
                reference_number, billing_profile_code, notes, created_by
             ) VALUES (
                :invoice_id, :amount, :payment_date, :payment_method,
                :reference_number, :billing_profile_code, :notes, :created_by
             )'
        );
        $stmt->execute([
            ':invoice_id'           => $invoiceId,
            ':amount'               => (float)($data['amount'] ?? 0),
            ':payment_date'         => $data['payment_date']         ?? date('Y-m-d'),
            ':payment_method'       => $data['payment_method']       ?? null,
            ':reference_number'     => $data['reference_number']     ?? null,
            ':billing_profile_code' => $data['billing_profile_code'] ?? null,
            ':notes'                => $data['notes']                ?? null,
            ':created_by'           => $data['created_by']           ?? null,
        ]);

        // Recalculate amount_paid from all payments
        $sumStmt = $this->db->prepare(
            'SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = :id'
        );
        $sumStmt->execute([':id' => $invoiceId]);
        $totalPaid = (float)$sumStmt->fetchColumn();

        // Determine new status
        $invoice = $this->find($invoiceId);
        $total   = (float)($invoice['total'] ?? 0);

        if ($totalPaid <= 0) {
            $newStatus = 'sent';
        } elseif ($totalPaid >= $total) {
            $newStatus = 'paid';
        } else {
            $newStatus = 'partially_paid';
        }

        $this->update($invoiceId, ['amount_paid' => $totalPaid, 'status' => $newStatus]);
    }

    /**
     * Generate a sequential invoice number (e.g. INV-2025-001).
     */
    private function generateInvoiceNumber(): string
    {
        $year  = date('Y');
        $stmt  = $this->db->prepare(
            "SELECT COUNT(*) FROM invoices WHERE invoice_number LIKE :prefix"
        );
        $stmt->execute([':prefix' => "INV-{$year}-%"]);
        $count = (int)$stmt->fetchColumn();
        return sprintf('INV-%s-%03d', $year, $count + 1);
    }
}
