<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * TxnModel — CRUD for the unified `txn` (transaction) table.
 *
 * Replaces the fragmented opening_balances, payments, invoices, and
 * ledger_entries tables with a single consolidated transaction record.
 *
 * Supported txn_type values:
 *   opening_balance, invoice, payment_expense, receipt,
 *   tds_provisional, tds_final, rebate, credit_note
 */
class TxnModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    /**
     * Find a single txn row by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT t.*,
                    COALESCE(c.organization_name,
                             TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))),
                             'Unknown') AS client_name
             FROM txn t
             LEFT JOIN clients c ON c.id = t.client_id
             WHERE t.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Return a paginated list of transactions, optionally filtered.
     *
     * @return array{total: int, txns: array<int, array<string, mixed>>}
     */
    public function paginate(
        int    $page      = 1,
        int    $perPage   = 20,
        string $search    = '',
        string $txnType   = '',
        int    $clientId  = 0,
        string $tdsStatus = '',
        string $status    = '',
        string $dateFrom  = '',
        string $dateTo    = ''
    ): array {
        $where  = ['1=1'];
        $params = [];

        if ($search !== '') {
            $where[]           = "(t.narration ILIKE :search
                                   OR t.invoice_number ILIKE :search
                                   OR c.first_name ILIKE :search
                                   OR c.last_name  ILIKE :search
                                   OR c.organization_name ILIKE :search)";
            $params[':search'] = "%{$search}%";
        }
        if ($txnType !== '') {
            $where[]             = 't.txn_type = :txn_type';
            $params[':txn_type'] = $txnType;
        }
        if ($clientId > 0) {
            $where[]              = 't.client_id = :client_id';
            $params[':client_id'] = $clientId;
        }
        if ($tdsStatus !== '') {
            $where[]               = 't.tds_status = :tds_status';
            $params[':tds_status'] = $tdsStatus;
        }
        if ($status !== '') {
            $where[]           = 't.status = :status';
            $params[':status'] = $status;
        }
        if ($dateFrom !== '') {
            $where[]              = 't.txn_date >= :date_from';
            $params[':date_from'] = $dateFrom;
        }
        if ($dateTo !== '') {
            $where[]            = 't.txn_date <= :date_to';
            $params[':date_to'] = $dateTo;
        }

        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM txn t
             LEFT JOIN clients c ON c.id = t.client_id
             WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT t.*,
                    COALESCE(c.organization_name,
                             TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))),
                             'Unknown') AS client_name
             FROM txn t
             LEFT JOIN clients c ON c.id = t.client_id
             WHERE {$whereClause}
             ORDER BY t.txn_date DESC, t.id DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit',  $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset,  PDO::PARAM_INT);
        $stmt->execute();

        return ['total' => $total, 'txns' => $stmt->fetchAll()];
    }

    /**
     * Return all txn rows for a client with running balance.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getByClient(int $clientId): array
    {
        $stmt = $this->db->prepare(
            "SELECT t.*
             FROM txn t
             WHERE t.client_id = :client_id
               AND t.status != 'cancelled'
             ORDER BY t.txn_date ASC, t.txn_type ASC, t.id ASC"
        );
        $stmt->execute([':client_id' => $clientId]);
        $rows = $stmt->fetchAll();

        $balance = 0.0;
        foreach ($rows as &$row) {
            $balance += (float)$row['debit'] - (float)$row['credit'];
            $row['balance'] = $balance;
        }
        unset($row);

        return $rows;
    }

    /**
     * Return ledger entries for a client in chronological order with running balance.
     * Replaces InvoiceModel::getLedgerByClient().
     *
     * @return array<int, array<string, mixed>>
     */
    public function getLedgerByClient(int $clientId): array
    {
        $stmt = $this->db->prepare(
            "SELECT
                t.id,
                t.txn_date          AS date,
                COALESCE(t.narration, t.invoice_number, t.txn_type) AS narration,
                t.debit,
                t.credit,
                t.billing_profile_code,
                t.txn_type          AS entry_type,
                t.invoice_number,
                t.invoice_status,
                t.tds_status,
                t.payment_method,
                t.reference_number,
                t.amount,
                0.0                 AS balance
             FROM txn t
             WHERE t.client_id = :client_id
               AND t.status != 'cancelled'
             ORDER BY t.txn_date ASC, t.txn_type ASC, t.id ASC"
        );
        $stmt->execute([':client_id' => $clientId]);
        $rows = $stmt->fetchAll();

        $balance = 0.0;
        foreach ($rows as &$row) {
            $balance += (float)$row['debit'] - (float)$row['credit'];
            $row['balance'] = $balance;
        }
        unset($row);

        return $rows;
    }

    /**
     * Return ledger entries for an organization in chronological order with running balance.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getLedgerByOrganization(int $orgId): array
    {
        $stmt = $this->db->prepare(
            "SELECT
                t.id,
                t.txn_date          AS date,
                COALESCE(t.narration, t.invoice_number, t.txn_type) AS narration,
                t.debit,
                t.credit,
                t.billing_profile_code,
                t.txn_type          AS entry_type,
                t.invoice_number,
                t.invoice_status,
                t.tds_status,
                t.payment_method,
                t.reference_number,
                t.amount,
                0.0                 AS balance
             FROM txn t
             WHERE t.organization_id = :org_id
               AND t.status != 'cancelled'
             ORDER BY t.txn_date ASC, t.txn_type ASC, t.id ASC"
        );
        $stmt->execute([':org_id' => $orgId]);
        $rows = $stmt->fetchAll();

        $balance = 0.0;
        foreach ($rows as &$row) {
            $balance += (float)$row['debit'] - (float)$row['credit'];
            $row['balance'] = $balance;
        }
        unset($row);

        return $rows;
    }

    /**
     * Total receivable across all contact and organization ledgers.
     *
     * For each ledger entity, closing balance is SUM(debit − credit) on non-cancelled
     * rows, same as {@see getLedgerByClient()} / {@see getLedgerByOrganization()}.
     * Only positive balances (client owes the firm) are summed. Each txn row is
     * attributed to a single bucket: client_id when set, otherwise organization_id,
     * so rows with both IDs are not double-counted.
     */
    public function getTotalReceivable(): float
    {
        $stmt = $this->db->query(
            "SELECT COALESCE(SUM(GREATEST(per.balance, 0)), 0)
             FROM (
                 SELECT SUM(t.debit - t.credit) AS balance
                 FROM txn t
                 WHERE t.status != 'cancelled'
                   AND (t.client_id IS NOT NULL OR t.organization_id IS NOT NULL)
                 GROUP BY (
                     CASE
                         WHEN t.client_id IS NOT NULL THEN 'c:' || t.client_id::TEXT
                         ELSE 'o:' || t.organization_id::TEXT
                     END
                 )
             ) per"
        );

        return (float)$stmt->fetchColumn();
    }

    // ── Create helpers by type ────────────────────────────────────────────────

    /**
     * Create any transaction row.
     *
     * @param array<string, mixed> $data
     * @return int  The new row's id.
     */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO txn (
                client_id, organization_id, txn_type, txn_date, narration,
                debit, credit, amount, billing_profile_code,
                invoice_number, service_id, due_date, subtotal,
                tax_percent, tax_amount, invoice_status,
                payment_method, reference_number,
                tds_status, tds_section, tds_rate,
                linked_txn_id, notes, status, created_by
             ) VALUES (
                :client_id, :organization_id, :txn_type, :txn_date, :narration,
                :debit, :credit, :amount, :billing_profile_code,
                :invoice_number, :service_id, :due_date, :subtotal,
                :tax_percent, :tax_amount, :invoice_status,
                :payment_method, :reference_number,
                :tds_status, :tds_section, :tds_rate,
                :linked_txn_id, :notes, :status, :created_by
             ) RETURNING id'
        );
        $stmt->execute([
            ':client_id'           => $data['client_id']           ?? null,
            ':organization_id'     => $data['organization_id']     ?? null,
            ':txn_type'            => $data['txn_type'],
            ':txn_date'            => $data['txn_date']            ?? date('Y-m-d'),
            ':narration'           => $data['narration']           ?? null,
            ':debit'               => (float)($data['debit']       ?? 0),
            ':credit'              => (float)($data['credit']      ?? 0),
            ':amount'              => (float)($data['amount']      ?? 0),
            ':billing_profile_code'=> $data['billing_profile_code']?? null,
            ':invoice_number'      => $data['invoice_number']      ?? null,
            ':service_id'          => $data['service_id']          ?? null,
            ':due_date'            => $data['due_date']            ?? null,
            ':subtotal'            => isset($data['subtotal'])     ? (float)$data['subtotal'] : null,
            ':tax_percent'         => isset($data['tax_percent'])  ? (float)$data['tax_percent'] : null,
            ':tax_amount'          => isset($data['tax_amount'])   ? (float)$data['tax_amount'] : null,
            ':invoice_status'      => $data['invoice_status']      ?? null,
            ':payment_method'      => $data['payment_method']      ?? null,
            ':reference_number'    => $data['reference_number']    ?? null,
            ':tds_status'          => $data['tds_status']          ?? null,
            ':tds_section'         => $data['tds_section']         ?? null,
            ':tds_rate'            => isset($data['tds_rate'])     ? (float)$data['tds_rate'] : null,
            ':linked_txn_id'       => $data['linked_txn_id']       ?? null,
            ':notes'               => $data['notes']               ?? null,
            ':status'              => $data['status']              ?? 'active',
            ':created_by'          => $data['created_by']          ?? null,
        ]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Create an invoice transaction.
     * Auto-generates invoice_number if not provided.
     *
     * @param array<string, mixed> $data
     * @return int
     */
    public function createInvoice(array $data): int
    {
        $invoiceNumber = $data['invoice_number'] ?? $this->generateInvoiceNumber();
        $total         = (float)($data['amount'] ?? $data['total'] ?? 0);
        $subtotal      = (float)($data['subtotal'] ?? $total);

        return $this->create(array_merge($data, [
            'txn_type'       => 'invoice',
            'invoice_number' => $invoiceNumber,
            'narration'      => $invoiceNumber,
            'debit'          => $total,
            'credit'         => 0,
            'amount'         => $total,
            'subtotal'       => $subtotal,
            'invoice_status' => $data['invoice_status'] ?? $data['status_val'] ?? 'draft',
            'status'         => 'active',
        ]));
    }

    /**
     * Create a receipt transaction (payment received from client).
     *
     * @param array<string, mixed> $data
     * @return int
     */
    public function createReceipt(array $data): int
    {
        $amount = (float)($data['amount'] ?? 0);

        // If linked to an invoice, update the invoice_status
        if (!empty($data['linked_txn_id'])) {
            $this->updateLinkedInvoiceOnReceipt((int)$data['linked_txn_id'], $amount);
        }

        return $this->create(array_merge($data, [
            'txn_type' => 'receipt',
            'narration'=> $data['narration'] ?? 'Receipt — ' . ($data['payment_method'] ?? 'Transfer'),
            'debit'    => 0,
            'credit'   => $amount,
            'amount'   => $amount,
            'status'   => 'active',
        ]));
    }

    /**
     * Create a payment-expense transaction.
     *
     * @param array<string, mixed> $data
     * @return int
     */
    public function createPaymentExpense(array $data): int
    {
        $amount = (float)($data['amount'] ?? 0);
        return $this->create(array_merge($data, [
            'txn_type' => 'payment_expense',
            'narration'=> $data['narration'] ?? 'Payment — ' . ($data['payment_method'] ?? 'Transfer'),
            'debit'    => 0,
            'credit'   => $amount,
            'amount'   => $amount,
            'status'   => 'active',
        ]));
    }

    /**
     * Book provisional TDS.
     *
     * @param array<string, mixed> $data
     * @return int
     */
    public function createTds(array $data): int
    {
        $amount = (float)($data['amount'] ?? 0);
        return $this->create(array_merge($data, [
            'txn_type'  => 'tds_provisional',
            'narration' => $data['narration'] ?? 'TDS Provisional — ' . ($data['tds_section'] ?? ''),
            'debit'     => 0,
            'credit'    => $amount,
            'amount'    => $amount,
            'tds_status'=> 'provisional',
            'status'    => 'active',
        ]));
    }

    /**
     * Mark a provisional TDS entry as final.
     *
     * @return bool
     */
    public function finalizeTds(int $txnId): bool
    {
        $stmt = $this->db->prepare(
            "UPDATE txn
             SET tds_status = 'final',
                 txn_type   = 'tds_final',
                 updated_at = NOW()
             WHERE id = :id
               AND tds_status = 'provisional'"
        );
        return $stmt->execute([':id' => $txnId]);
    }

    /**
     * Create a rebate/discount transaction.
     *
     * @param array<string, mixed> $data
     * @return int
     */
    public function createRebate(array $data): int
    {
        $amount = (float)($data['amount'] ?? 0);
        return $this->create(array_merge($data, [
            'txn_type' => 'rebate',
            'narration'=> $data['narration'] ?? 'Rebate / Discount',
            'debit'    => 0,
            'credit'   => $amount,
            'amount'   => $amount,
            'status'   => 'active',
        ]));
    }

    /**
     * Create a credit note (partial or full reversal of an invoice).
     * Marks the original invoice as cancelled or partially reversed.
     *
     * @param array<string, mixed> $data
     * @return int
     */
    public function createCreditNote(array $data): int
    {
        $amount = (float)($data['amount'] ?? 0);

        $newId = $this->create(array_merge($data, [
            'txn_type'     => 'credit_note',
            'narration'    => $data['narration'] ?? 'Credit Note',
            'debit'        => 0,
            'credit'       => $amount,
            'amount'       => $amount,
            'status'       => 'active',
        ]));

        // Mark original invoice as reversed/cancelled if linked
        if (!empty($data['linked_txn_id'])) {
            $orig = $this->find((int)$data['linked_txn_id']);
            if ($orig && $orig['txn_type'] === 'invoice') {
                $origTotal = (float)$orig['amount'];
                $newStatus = $amount >= $origTotal ? 'reversed' : 'active';
                $this->db->prepare(
                    "UPDATE txn SET invoice_status = 'cancelled', status = :status, updated_at = NOW()
                     WHERE id = :id"
                )->execute([':status' => $newStatus, ':id' => (int)$data['linked_txn_id']]);
            }
        }

        return $newId;
    }

    /**
     * Set/upsert an opening balance for a client + billing profile.
     *
     * @param array<string, mixed> $data
     * @return int
     */
    public function setOpeningBalance(array $data): int
    {
        $clientId    = (int)$data['client_id'];
        $profileCode = (string)$data['billing_profile_code'];
        $amount      = (float)$data['amount'];
        $type        = $data['type'] ?? 'debit'; // 'debit' or 'credit'

        // Delete existing opening balance for this client + profile
        $this->db->prepare(
            "DELETE FROM txn
             WHERE client_id = :client_id
               AND billing_profile_code = :profile_code
               AND txn_type = 'opening_balance'"
        )->execute([':client_id' => $clientId, ':profile_code' => $profileCode]);

        return $this->create([
            'client_id'            => $clientId,
            'txn_type'             => 'opening_balance',
            'txn_date'             => $data['txn_date'] ?? date('Y-m-d'),
            'narration'            => 'Opening Balance',
            'invoice_number'       => 'OB-' . $clientId . '-' . $profileCode,
            'debit'                => $type === 'debit'  ? $amount : 0,
            'credit'               => $type === 'credit' ? $amount : 0,
            'amount'               => $amount,
            'billing_profile_code' => $profileCode,
            'status'               => 'active',
            'created_by'           => $data['created_by'] ?? null,
        ]);
    }

    /**
     * Return opening balance entries for a client.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getOpeningBalance(int $clientId): array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM txn
             WHERE client_id = :client_id
               AND txn_type  = 'opening_balance'
             ORDER BY billing_profile_code ASC"
        );
        $stmt->execute([':client_id' => $clientId]);
        return $stmt->fetchAll();
    }

    /**
     * Return TDS entries for a client, optionally filtered by status.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getTdsEntries(int $clientId = 0, ?string $tdsStatus = null): array
    {
        $where  = ["t.txn_type IN ('tds_provisional','tds_final')"];
        $params = [];

        if ($clientId > 0) {
            $where[]              = 't.client_id = :client_id';
            $params[':client_id'] = $clientId;
        }
        if ($tdsStatus !== null && $tdsStatus !== '') {
            $where[]               = 't.tds_status = :tds_status';
            $params[':tds_status'] = $tdsStatus;
        }

        $whereClause = implode(' AND ', $where);
        $stmt = $this->db->prepare(
            "SELECT t.*,
                    COALESCE(c.organization_name,
                             TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))),
                             'Unknown') AS client_name
             FROM txn t
             LEFT JOIN clients c ON c.id = t.client_id
             WHERE {$whereClause}
             ORDER BY t.txn_date DESC"
        );
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * Update a txn row.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $setClauses = [];
        $params     = [':id' => $id];

        $allowed = [
            'txn_date', 'narration', 'debit', 'credit', 'amount',
            'billing_profile_code', 'invoice_number', 'due_date',
            'subtotal', 'tax_percent', 'tax_amount', 'invoice_status',
            'payment_method', 'reference_number',
            'tds_status', 'tds_section', 'tds_rate',
            'linked_txn_id', 'notes', 'status',
        ];
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

        $stmt = $this->db->prepare("UPDATE txn SET {$setClause} WHERE id = :id");
        return $stmt->execute($params);
    }

    /**
     * Delete a txn row (or cancel it by setting status = 'cancelled').
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare("DELETE FROM txn WHERE id = :id");
        return $stmt->execute([':id' => $id]);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Generate a sequential invoice number (e.g. INV-2025-001).
     */
    private function generateInvoiceNumber(): string
    {
        $year = date('Y');
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) FROM txn
             WHERE txn_type = 'invoice'
               AND invoice_number LIKE :prefix"
        );
        $stmt->execute([':prefix' => "INV-{$year}-%"]);
        $count = (int)$stmt->fetchColumn();
        return sprintf('INV-%s-%03d', $year, $count + 1);
    }

    /**
     * Update the invoice_status on a linked invoice after a receipt is recorded.
     */
    private function updateLinkedInvoiceOnReceipt(int $invoiceId, float $receiptAmount): void
    {
        $invoice = $this->find($invoiceId);
        if (!$invoice || $invoice['txn_type'] !== 'invoice') {
            return;
        }

        // Sum all receipts linked to this invoice
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount),0)
             FROM txn
             WHERE linked_txn_id = :invoice_id
               AND txn_type = 'receipt'
               AND status != 'cancelled'"
        );
        $stmt->execute([':invoice_id' => $invoiceId]);
        $totalReceived = (float)$stmt->fetchColumn() + $receiptAmount;

        $invoiceTotal = (float)$invoice['amount'];
        if ($totalReceived <= 0) {
            $newStatus = 'sent';
        } elseif ($totalReceived >= $invoiceTotal) {
            $newStatus = 'paid';
        } else {
            $newStatus = 'partially_paid';
        }

        $this->db->prepare(
            "UPDATE txn SET invoice_status = :status, updated_at = NOW() WHERE id = :id"
        )->execute([':status' => $newStatus, ':id' => $invoiceId]);
    }
}
