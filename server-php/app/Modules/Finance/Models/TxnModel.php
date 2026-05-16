<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Models\AdminAuditLogModel;
use App\Libraries\InvoiceLineCommission;
use App\Libraries\LedgerDimensions;
use App\Libraries\LedgerPresentation;
use App\Libraries\TxnReceiptAllocationService;
use PDO;

/**
 * TxnModel — CRUD for the unified `txn` (transaction) table.
 *
 * Replaces the fragmented opening_balances, payments, invoices, and
 * ledger_entries tables with a single consolidated transaction record.
 *
 * Supported txn_type values:
 *   opening_balance, invoice, payment_expense, receipt,
 *   tds_provisional, tds_final, rebate, credit_note,
 *   receipt_reversal, payment_expense_reversal, tds_reversal (compensating rows)
 *   receipt_bank_leg, payment_expense_bank_leg (firm cash mirror; no client_id)
 *   receipt_bank_leg_reversal, payment_expense_bank_leg_reversal (cash mirror for reversals)
 */
class TxnModel
{
    public const TXN_TYPE_RECEIPT_BANK_LEG = 'receipt_bank_leg';

    public const TXN_TYPE_PAYMENT_EXPENSE_BANK_LEG = 'payment_expense_bank_leg';

    public const TXN_TYPE_RECEIPT_BANK_LEG_REVERSAL = 'receipt_bank_leg_reversal';

    public const TXN_TYPE_PAYMENT_EXPENSE_BANK_LEG_REVERSAL = 'payment_expense_bank_leg_reversal';

    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * SQL predicate: normalized txn.ledger_class equals bound param (treat null/blank as regular).
     *
     * @param string $tableAlias e.g. 't' or 'r'
     * @param string $paramName    PDO placeholder with leading colon, e.g. ':ledger_class'
     */
    private static function sqlLedgerClassMatch(string $tableAlias, string $paramName): string
    {
        return "COALESCE(NULLIF(TRIM({$tableAlias}.ledger_class), ''), 'regular') = {$paramName}";
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
                    COALESCE(
                        NULLIF(TRIM(o.name), ''),
                        NULLIF(TRIM(c.organization_name), ''),
                        NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                        'Unknown'
                    ) AS client_name
             FROM txn t
             LEFT JOIN clients c ON c.id = t.client_id
             LEFT JOIN organizations o ON o.id = t.organization_id
             WHERE t.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if ($row) {
            $this->decodeJsonbInvoiceFields($row);
        }
        return $row ?: null;
    }

    /**
     * Find a non-cancelled txn by public_ref for a single client or organization ledger.
     *
     * @return array<string, mixed>|null
     */
    public function findActiveTxnByPublicRef(string $publicRef, string $txnType, int $clientId, int $orgId): ?array
    {
        $ref = trim($publicRef);
        $tt  = trim($txnType);
        if ($ref === '' || $tt === '') {
            return null;
        }
        if ($clientId <= 0 && $orgId <= 0) {
            return null;
        }
        if ($clientId > 0 && $orgId > 0) {
            return null;
        }
        $where  = [
            't.public_ref = :ref',
            't.txn_type = :tt',
            "t.status NOT IN ('cancelled', 'reversed')",
        ];
        $params = [':ref' => $ref, ':tt' => $tt];
        if ($clientId > 0) {
            $where[]            = 't.client_id = :cid';
            $where[]            = 'COALESCE(t.organization_id, 0) = 0';
            $params[':cid']     = $clientId;
        } else {
            $where[]            = 't.organization_id = :oid';
            $where[]            = 'COALESCE(t.client_id, 0) = 0';
            $params[':oid']     = $orgId;
        }
        $stmt = $this->db->prepare(
            'SELECT t.* FROM txn t WHERE ' . implode(' AND ', $where) . ' LIMIT 1'
        );
        $stmt->execute($params);
        $row = $stmt->fetch();
        if ($row) {
            $this->decodeJsonbInvoiceFields($row);
        }

        return $row ?: null;
    }

    /**
     * Receipts on this ledger with a positive unallocated_advance balance (for payment-on-behalf pickers).
     *
     * @return list<array{id:int, public_ref:?string, txn_date:string, amount:float, unallocated_advance:float}>
     */
    public function listReceiptsWithUnallocatedAdvance(
        int $clientId,
        int $orgId,
        string $ledgerClass,
        string $ledgerMovementKind
    ): array {
        $lc = LedgerDimensions::normalizeLedgerClass($ledgerClass);
        $mk = LedgerDimensions::assertLedgerMovementKindRequired($ledgerMovementKind);
        if ($clientId <= 0 && $orgId <= 0) {
            return [];
        }
        if ($clientId > 0 && $orgId > 0) {
            return [];
        }
        $where = [
            "r.txn_type = 'receipt'",
            "r.status NOT IN ('cancelled', 'reversed')",
            self::sqlLedgerClassMatch('r', ':lc'),
            'r.ledger_movement_kind = :mk',
        ];
        $params = [':lc' => $lc, ':mk' => $mk];
        if ($clientId > 0) {
            $where[]        = 'r.client_id = :cid';
            $where[]        = 'COALESCE(r.organization_id, 0) = 0';
            $params[':cid'] = $clientId;
        } else {
            $where[]        = 'r.organization_id = :oid';
            $where[]        = 'COALESCE(r.client_id, 0) = 0';
            $params[':oid'] = $orgId;
        }
        $sql = 'SELECT r.id,
                       r.public_ref,
                       r.txn_date::text AS txn_date,
                       r.amount::float8 AS amount,
                       COALESCE(SUM(CASE WHEN a.target_type = \'unallocated_advance\' THEN a.amount::float8 ELSE 0 END), 0) AS unallocated_advance
                FROM txn r
                LEFT JOIN txn_settlement_allocation a ON a.source_txn_id = r.id
                WHERE ' . implode(' AND ', $where) . '
                GROUP BY r.id, r.public_ref, r.txn_date, r.amount
                HAVING COALESCE(SUM(CASE WHEN a.target_type = \'unallocated_advance\' THEN a.amount::float8 ELSE 0 END), 0) > 0.005
                ORDER BY r.txn_date DESC, r.id DESC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $out  = [];
        foreach ($rows as $row) {
            $out[] = [
                'id'                    => (int)$row['id'],
                'public_ref'            => isset($row['public_ref']) ? (string)$row['public_ref'] : '',
                'txn_date'              => (string)($row['txn_date'] ?? ''),
                'amount'                => round((float)($row['amount'] ?? 0), 2),
                'unallocated_advance'   => round((float)($row['unallocated_advance'] ?? 0), 2),
            ];
        }

        return $out;
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
        int    $orgId     = 0,
        string $tdsStatus = '',
        string $status    = '',
        string $dateFrom  = '',
        string $dateTo    = '',
        string $expensePurpose = '',
        string $paymentMethod = '',
        string $paidFrom = ''
    ): array {
        $where  = ['1=1'];
        $params = [];

        if ($search !== '') {
            $where[]           = "(t.narration ILIKE :search
                                   OR t.invoice_number ILIKE :search
                                   OR t.notes ILIKE :search
                                   OR t.reference_number ILIKE :search
                                   OR t.paid_from ILIKE :search
                                   OR c.first_name ILIKE :search
                                   OR c.last_name  ILIKE :search
                                   OR c.organization_name ILIKE :search
                                   OR o.name ILIKE :search)";
            $params[':search'] = "%{$search}%";
        }
        if ($txnType !== '') {
            if ($txnType === 'receipt') {
                $where[] = "t.txn_type IN ('receipt','receipt_reversal')";
            } elseif ($txnType === 'payment_expense') {
                $where[] = "t.txn_type IN ('payment_expense','payment_expense_reversal')";
            } else {
                $where[]             = 't.txn_type = :txn_type';
                $params[':txn_type'] = $txnType;
            }
        }
        if ($clientId > 0) {
            $where[]              = 't.client_id = :client_id';
            $params[':client_id'] = $clientId;
        }
        if ($orgId > 0) {
            $where[]             = 't.organization_id = :organization_id';
            $params[':organization_id'] = $orgId;
        }
        if ($expensePurpose !== '') {
            $where[]                    = 't.expense_purpose = :expense_purpose';
            $params[':expense_purpose'] = $expensePurpose;
        }
        if ($paymentMethod !== '') {
            $where[]                 = 't.payment_method = :payment_method_filter';
            $params[':payment_method_filter'] = $paymentMethod;
        }
        if ($paidFrom !== '') {
            $where[]                   = 'TRIM(COALESCE(t.paid_from, \'\')) = :paid_from_filter';
            $params[':paid_from_filter'] = $paidFrom;
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
             LEFT JOIN organizations o ON o.id = t.organization_id
             WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT t.*,
                    COALESCE(
                        NULLIF(TRIM(o.name), ''),
                        NULLIF(TRIM(c.organization_name), ''),
                        NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                        'Unknown'
                    ) AS client_name,
                    creator.name AS created_by_user_name,
                    updater.name AS updated_by_user_name
             FROM txn t
             LEFT JOIN clients c ON c.id = t.client_id
             LEFT JOIN organizations o ON o.id = t.organization_id
             LEFT JOIN users creator ON creator.id = t.created_by
             LEFT JOIN users updater ON updater.id = t.updated_by
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

        $txns = $stmt->fetchAll();
        foreach ($txns as &$trow) {
            $this->decodeJsonbInvoiceFields($trow);
        }
        unset($trow);

        return ['total' => $total, 'txns' => $txns];
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
               AND t.status NOT IN ('cancelled', 'reversed')
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
    public function getLedgerByClient(int $clientId, string $ledgerClass = LedgerDimensions::CLASS_REGULAR, string $ledgerView = LedgerDimensions::VIEW_CONSOLIDATED): array
    {
        $stmt = $this->db->prepare(
            'SELECT t.*
             FROM txn t
             WHERE t.client_id = :client_id
               AND t.status NOT IN (\'cancelled\', \'reversed\')
               AND ' . self::sqlLedgerClassMatch('t', ':ledger_class') . '
             ORDER BY t.txn_date ASC, t.txn_type ASC, t.id ASC'
        );
        $stmt->execute([
            ':client_id'     => $clientId,
            ':ledger_class' => LedgerDimensions::normalizeLedgerClass($ledgerClass),
        ]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        foreach ($rows as &$row) {
            $this->decodeJsonbInvoiceFields($row);
        }
        unset($row);

        return LedgerPresentation::buildLedger($rows, $ledgerView);
    }

    /**
     * Return ledger entries for an organization in chronological order with running balance.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getLedgerByOrganization(int $orgId, string $ledgerClass = LedgerDimensions::CLASS_REGULAR, string $ledgerView = LedgerDimensions::VIEW_CONSOLIDATED): array
    {
        $stmt = $this->db->prepare(
            'SELECT t.*
             FROM txn t
             WHERE t.organization_id = :org_id
               AND t.status NOT IN (\'cancelled\', \'reversed\')
               AND ' . self::sqlLedgerClassMatch('t', ':ledger_class') . '
             ORDER BY t.txn_date ASC, t.txn_type ASC, t.id ASC'
        );
        $stmt->execute([
            ':org_id'        => $orgId,
            ':ledger_class' => LedgerDimensions::normalizeLedgerClass($ledgerClass),
        ]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        foreach ($rows as &$row) {
            $this->decodeJsonbInvoiceFields($row);
        }
        unset($row);

        return LedgerPresentation::buildLedger($rows, $ledgerView);
    }

    /**
     * Raw txn rows for reporting (decoded JSON), same filter as getLedgerByClient.
     *
     * @return array<int, array<string, mixed>>
     */
    public function fetchRawLedgerRowsForClient(int $clientId, string $ledgerClass): array
    {
        $stmt = $this->db->prepare(
            'SELECT t.*
             FROM txn t
             WHERE t.client_id = :client_id
               AND t.status NOT IN (\'cancelled\', \'reversed\')
               AND ' . self::sqlLedgerClassMatch('t', ':ledger_class') . '
             ORDER BY t.txn_date ASC, t.txn_type ASC, t.id ASC'
        );
        $stmt->execute([
            ':client_id'     => $clientId,
            ':ledger_class' => LedgerDimensions::normalizeLedgerClass($ledgerClass),
        ]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        foreach ($rows as &$row) {
            $this->decodeJsonbInvoiceFields($row);
        }
        unset($row);

        return $rows;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function fetchRawLedgerRowsForOrganization(int $orgId, string $ledgerClass): array
    {
        $stmt = $this->db->prepare(
            'SELECT t.*
             FROM txn t
             WHERE t.organization_id = :org_id
               AND t.status NOT IN (\'cancelled\', \'reversed\')
               AND ' . self::sqlLedgerClassMatch('t', ':ledger_class') . '
             ORDER BY t.txn_date ASC, t.txn_type ASC, t.id ASC'
        );
        $stmt->execute([
            ':org_id'        => $orgId,
            ':ledger_class' => LedgerDimensions::normalizeLedgerClass($ledgerClass),
        ]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        foreach ($rows as &$row) {
            $this->decodeJsonbInvoiceFields($row);
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
                 WHERE t.status NOT IN ('cancelled', 'reversed')
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
        $lineItemsJson   = $this->normalizeLineItemsForStorage($data['line_items'] ?? null);
        $gstBreakdownJson = $this->normalizeGstBreakdownForStorage($data['gst_breakdown'] ?? null);

        $stmt = $this->db->prepare(
            'INSERT INTO txn (
                client_id, organization_id, txn_type, txn_date, narration,
                debit, credit, amount, billing_profile_code,
                invoice_number, service_id, due_date, subtotal,
                tax_percent, tax_amount, invoice_status,
                payment_method, reference_number,
                expense_purpose, paid_from,
                tds_status, tds_section, tds_rate,
                linked_txn_id, notes, status, created_by, updated_by, line_items, gst_breakdown,
                appointment_id,
                firm_bank_account_id, counterparty_firm_bank_account_id, firm_expense_category,
                invoice_cost_analysis_ack_user_id, invoice_cost_analysis_ack_at, invoice_cost_analysis,
                ledger_class, ledger_movement_kind, public_ref
             ) VALUES (
                :client_id, :organization_id, :txn_type, :txn_date, :narration,
                :debit, :credit, :amount, :billing_profile_code,
                :invoice_number, :service_id, :due_date, :subtotal,
                :tax_percent, :tax_amount, :invoice_status,
                :payment_method, :reference_number,
                :expense_purpose, :paid_from,
                :tds_status, :tds_section, :tds_rate,
                :linked_txn_id, :notes, :status, :created_by, :updated_by, CAST(:line_items AS jsonb), CAST(:gst_breakdown AS jsonb),
                :appointment_id,
                :firm_bank_account_id, :counterparty_firm_bank_account_id, :firm_expense_category,
                :invoice_cost_analysis_ack_user_id, :invoice_cost_analysis_ack_at, CAST(:invoice_cost_analysis AS jsonb),
                :ledger_class, :ledger_movement_kind, :public_ref
             ) RETURNING id'
        );
        $createdByForRow = $data['created_by'] ?? null;
        $updatedByInsert = $data['updated_by'] ?? $createdByForRow;
        $ica = $data['invoice_cost_analysis'] ?? [];
        if (!is_array($ica)) {
            $ica = [];
        }
        $ledgerClass = LedgerDimensions::normalizeLedgerClass($data['ledger_class'] ?? null);
        $lmkRaw = $data['ledger_movement_kind'] ?? null;
        $ledgerMovementKind = null;
        if ($lmkRaw !== null && $lmkRaw !== '') {
            $ledgerMovementKind = LedgerDimensions::assertLedgerMovementKindRequired($lmkRaw);
        }
        $billingProfile = $this->clipDbText(
            isset($data['billing_profile_code']) ? (string)$data['billing_profile_code'] : null,
            50
        );
        $invoiceNumber = $this->clipDbText(
            isset($data['invoice_number']) ? (string)$data['invoice_number'] : null,
            50
        );
        $paymentMethod = $this->clipDbText(
            isset($data['payment_method']) ? (string)$data['payment_method'] : null,
            50
        );
        $referenceNumber = $this->clipDbText(
            isset($data['reference_number']) ? (string)$data['reference_number'] : null,
            100
        );
        $publicRef = $this->clipDbText(
            isset($data['public_ref']) ? (string)$data['public_ref'] : null,
            40
        );
        $expensePurpose = $this->clipDbText(
            isset($data['expense_purpose']) ? (string)$data['expense_purpose'] : null,
            80
        );
        $paidFrom = $this->clipDbText(
            isset($data['paid_from']) ? (string)$data['paid_from'] : null,
            200
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
            ':billing_profile_code'=> $billingProfile,
            ':invoice_number'      => $invoiceNumber,
            ':service_id'          => $data['service_id']          ?? null,
            ':due_date'            => $data['due_date']            ?? null,
            ':subtotal'            => isset($data['subtotal'])     ? (float)$data['subtotal'] : null,
            ':tax_percent'         => array_key_exists('tax_percent', $data) && $data['tax_percent'] !== null
                ? (float)$data['tax_percent'] : null,
            ':tax_amount'          => array_key_exists('tax_amount', $data) && $data['tax_amount'] !== null
                ? (float)$data['tax_amount'] : null,
            ':invoice_status'      => $data['invoice_status']      ?? null,
            ':payment_method'      => $paymentMethod,
            ':reference_number'    => $referenceNumber,
            ':expense_purpose'     => $expensePurpose,
            ':paid_from'           => $paidFrom,
            ':tds_status'          => $this->clipDbText(
                isset($data['tds_status']) ? (string)$data['tds_status'] : null,
                20
            ),
            ':tds_section'         => $this->clipDbText(
                isset($data['tds_section']) ? (string)$data['tds_section'] : null,
                20
            ),
            ':tds_rate'            => isset($data['tds_rate'])     ? (float)$data['tds_rate'] : null,
            ':linked_txn_id'       => $data['linked_txn_id']       ?? null,
            ':notes'               => $data['notes']               ?? null,
            ':status'              => $data['status']              ?? 'active',
            ':created_by'          => $createdByForRow,
            ':updated_by'          => $updatedByInsert,
            ':line_items'          => $lineItemsJson,
            ':gst_breakdown'       => $gstBreakdownJson,
            ':appointment_id'      => isset($data['appointment_id']) ? (int)$data['appointment_id'] : null,
            ':firm_bank_account_id' => isset($data['firm_bank_account_id']) ? (int)$data['firm_bank_account_id'] : null,
            ':counterparty_firm_bank_account_id' => isset($data['counterparty_firm_bank_account_id'])
                ? (int)$data['counterparty_firm_bank_account_id'] : null,
            ':firm_expense_category' => $this->clipDbText(
                isset($data['firm_expense_category']) ? (string)$data['firm_expense_category'] : null,
                64
            ),
            ':invoice_cost_analysis_ack_user_id' => isset($data['invoice_cost_analysis_ack_user_id'])
                ? (int)$data['invoice_cost_analysis_ack_user_id'] : null,
            ':invoice_cost_analysis_ack_at' => $data['invoice_cost_analysis_ack_at'] ?? null,
            ':invoice_cost_analysis' => json_encode($ica, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            ':ledger_class'          => $ledgerClass,
            ':ledger_movement_kind'  => $ledgerMovementKind,
            ':public_ref'            => $publicRef !== '' ? $publicRef : null,
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

        if ($total <= 0) {
            throw new \InvalidArgumentException('Invoice total must be greater than zero.');
        }

        $lines = $data['line_items'] ?? null;
        if (!is_array($lines) || count($lines) === 0) {
            throw new \InvalidArgumentException('At least one line item is required.');
        }
        InvoiceLineCommission::assertValid($lines);
        $this->assertLineItemsSumMatchesSubtotal($lines, $subtotal);

        return $this->create(array_merge($data, [
            'txn_type'             => 'invoice',
            'invoice_number'       => $invoiceNumber,
            'narration'            => $invoiceNumber,
            'debit'                => $total,
            'credit'               => 0,
            'amount'               => $total,
            'subtotal'             => $subtotal,
            'invoice_status'       => $data['invoice_status'] ?? $data['status_val'] ?? 'draft',
            'status'               => 'active',
            'line_items'           => $lines,
            'ledger_movement_kind' => null,
        ]));
    }

    /**
     * Create a receipt transaction (payment received from client).
     *
     * @param array<string, mixed> $data
     * @param list<array{target_type:string, target_txn_id?:int|null, amount:float}>|null $prevalidatedAllocations
     * @return int
     */
    public function createReceipt(array $data, ?array $prevalidatedAllocations = null): int
    {
        $amount = (float)($data['amount'] ?? 0);
        $allocRows = $prevalidatedAllocations
            ?? TxnReceiptAllocationService::normalizeAndValidateAllocations($data, $data['allocations'] ?? null);
        unset($data['allocations']);
        $bankId = (int)($data['firm_bank_account_id'] ?? 0);

        TxnReceiptAllocationService::assignPublicRef($data);
        $data['linked_txn_id'] = null;

        $conn = Database::getConnection();
        $conn->beginTransaction();
        try {
            $clientPayload = array_merge($data, [
                'txn_type'               => 'receipt',
                'narration'              => $data['narration'] ?? 'Receipt — ' . ($data['payment_method'] ?? 'Transfer'),
                'debit'                  => 0,
                'credit'                 => $amount,
                'amount'                 => $amount,
                'status'                 => 'active',
                'appointment_id'         => $data['appointment_id'] ?? null,
                'firm_bank_account_id'   => null,
                'counterparty_firm_bank_account_id' => null,
            ]);

            $id = $this->create($clientPayload);

            if ($bankId > 0) {
                $this->insertReceiptBankLeg($id, $bankId, $amount, $clientPayload);
            }

            TxnReceiptAllocationService::persistForNewReceipt($id, $allocRows);

            $conn->commit();

            return $id;
        } catch (\Throwable $e) {
            if ($conn->inTransaction()) {
                $conn->rollBack();
            }
            throw $e;
        }
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
        $bankId = (int)($data['firm_bank_account_id'] ?? 0);
        $paidFrom = null;
        if ($bankId > 0) {
            $acc = (new FirmBankAccountModel())->find($bankId);
            if ($acc !== null) {
                $name = trim((string)($acc['name'] ?? ''));
                $type = trim((string)($acc['account_type'] ?? ''));
                $paidFrom = $name !== '' && $type !== ''
                    ? $name . ' (' . $type . ')'
                    : ($name !== '' ? $name : $type);
                $paidFrom = $paidFrom !== '' ? $paidFrom : null;
            }
        }
        if (empty($data['public_ref'])) {
            $data['public_ref'] = \App\Libraries\TxnPublicRefGenerator::next(
                $this->db,
                'PAY',
                isset($data['txn_date']) ? (string)$data['txn_date'] : null
            );
        }

        $clientPayload = array_merge($data, [
            'txn_type'             => 'payment_expense',
            'narration'            => $data['narration'] ?? 'Payment — ' . ($data['payment_method'] ?? 'Transfer'),
            'debit'                => $amount,
            'credit'               => 0,
            'amount'               => $amount,
            'status'               => 'active',
            'paid_from'            => $paidFrom,
            'firm_bank_account_id' => null,
            'counterparty_firm_bank_account_id' => null,
        ]);

        $id = $this->create($clientPayload);

        if ($bankId > 0) {
            $this->insertPaymentExpenseBankLeg($id, $bankId, $amount, $clientPayload);
        }

        return $id;
    }

    /**
     * Firm cash-book row: money in (same credit as client receipt); no client_id.
     *
     * @param array<string, mixed> $src  Client receipt payload used for metadata copy
     */
    private function insertReceiptBankLeg(int $receiptClientLegId, int $bankId, float $amount, array $src): void
    {
        $this->create([
            'client_id'              => null,
            'organization_id'        => null,
            'txn_type'               => self::TXN_TYPE_RECEIPT_BANK_LEG,
            'txn_date'               => $src['txn_date']            ?? date('Y-m-d'),
            'narration'              => 'Cash in — ' . (string)($src['narration'] ?? 'Receipt'),
            'debit'                  => 0,
            'credit'                 => $amount,
            'amount'                 => $amount,
            'billing_profile_code'   => $src['billing_profile_code'] ?? null,
            'payment_method'         => $src['payment_method'] ?? null,
            'reference_number'       => $src['reference_number'] ?? null,
            'linked_txn_id'          => $receiptClientLegId,
            'firm_bank_account_id'   => $bankId,
            'status'                 => 'active',
            'created_by'             => $src['created_by'] ?? null,
            'ledger_class'           => $src['ledger_class'] ?? LedgerDimensions::CLASS_REGULAR,
            'ledger_movement_kind'   => $src['ledger_movement_kind'] ?? null,
        ]);
    }

    /**
     * Firm cash-book row: money out for on-behalf payment; no client_id.
     *
     * @param array<string, mixed> $src Client payment_expense payload
     */
    private function insertPaymentExpenseBankLeg(int $paymentClientLegId, int $bankId, float $amount, array $src): void
    {
        $this->create([
            'client_id'              => null,
            'organization_id'      => null,
            'txn_type'               => self::TXN_TYPE_PAYMENT_EXPENSE_BANK_LEG,
            'txn_date'               => $src['txn_date']            ?? date('Y-m-d'),
            'narration'              => 'Cash out — ' . (string)($src['narration'] ?? 'Payment'),
            'debit'                  => $amount,
            'credit'                 => 0,
            'amount'                 => $amount,
            'billing_profile_code'   => $src['billing_profile_code'] ?? null,
            'payment_method'         => $src['payment_method'] ?? null,
            'reference_number'       => $src['reference_number'] ?? null,
            'linked_txn_id'          => $paymentClientLegId,
            'firm_bank_account_id'   => $bankId,
            'status'                 => 'active',
            'created_by'             => $src['created_by'] ?? null,
            'ledger_class'           => $src['ledger_class'] ?? LedgerDimensions::CLASS_REGULAR,
            'ledger_movement_kind'   => $src['ledger_movement_kind'] ?? null,
        ]);
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
    public function finalizeTds(int $txnId, ?int $updatedByUserId = null): bool
    {
        if ($updatedByUserId !== null) {
            $stmt = $this->db->prepare(
                "UPDATE txn
                 SET tds_status  = 'final',
                     txn_type    = 'tds_final',
                     updated_at  = NOW(),
                     updated_by  = :ub
                 WHERE id = :id
                   AND tds_status = 'provisional'"
            );

            return $stmt->execute([':id' => $txnId, ':ub' => $updatedByUserId]);
        }

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
     * Sum credit notes already issued against an invoice txn (excludes cancelled credit notes).
     */
    public function sumLinkedCreditNotesForInvoice(int $invoiceTxnId): float
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount), 0) FROM txn
             WHERE linked_txn_id = :invoice_id
               AND txn_type = 'credit_note'
               AND status NOT IN ('cancelled', 'reversed')"
        );
        $stmt->execute([':invoice_id' => $invoiceTxnId]);

        return (float)$stmt->fetchColumn();
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
        if ($amount <= 0) {
            throw new \InvalidArgumentException('Credit note amount must be greater than zero.');
        }

        $linkedId = (int)($data['linked_txn_id'] ?? 0);
        if ($linkedId <= 0) {
            throw new \InvalidArgumentException('linked_txn_id is required for a credit note.');
        }

        $orig = $this->find($linkedId);
        if ($orig === null || ($orig['txn_type'] ?? '') !== 'invoice') {
            throw new \InvalidArgumentException('Credit note must reference an invoice transaction.');
        }

        $alreadyCredited = $this->sumLinkedCreditNotesForInvoice($linkedId);
        $invoiceAmount   = (float)($orig['amount'] ?? 0);
        $remaining       = round($invoiceAmount - $alreadyCredited, 2);
        if ($amount > $remaining + 0.0001) {
            throw new \InvalidArgumentException(
                'Credit note amount exceeds remaining creditable balance on this invoice (₹'
                . number_format($remaining, 2, '.', '')
                . ' available).'
            );
        }

        $ledgerClass = LedgerDimensions::normalizeLedgerClass($orig['ledger_class'] ?? null);

        $merged = array_merge($data, [
            'txn_type'               => 'credit_note',
            'narration'              => $data['narration'] ?? 'Credit Note',
            'debit'                  => 0,
            'credit'                 => $amount,
            'amount'                 => $amount,
            'status'                 => 'active',
            'ledger_class'           => $ledgerClass,
            'ledger_movement_kind'   => null,
            'client_id'              => $data['client_id'] ?? $orig['client_id'] ?? null,
            'organization_id'        => $data['organization_id'] ?? $orig['organization_id'] ?? null,
            'billing_profile_code'   => $data['billing_profile_code'] ?? $orig['billing_profile_code'] ?? null,
        ]);

        $newId = $this->create($merged);

        // Mark original invoice as reversed/cancelled if linked
        if (!empty($data['linked_txn_id'])) {
            $orig = $this->find((int)$data['linked_txn_id']);
            if ($orig && $orig['txn_type'] === 'invoice') {
                $beforeSnap = $this->txnAuditCompactSnapshot($orig);
                $origTotal = (float)$orig['amount'];
                $newStatus = $amount >= $origTotal ? 'reversed' : 'active';
                $actor = isset($merged['created_by']) ? (int)$merged['created_by'] : null;
                $this->db->prepare(
                    "UPDATE txn SET invoice_status = 'cancelled', status = :status, updated_at = NOW(), updated_by = :ub
                     WHERE id = :id"
                )->execute([':status' => $newStatus, ':id' => (int)$data['linked_txn_id'], ':ub' => $actor]);
                $afterInv = $this->find((int)$data['linked_txn_id']);
                if ($afterInv !== null) {
                    try {
                        (new AdminAuditLogModel())->insert(
                            $actor,
                            'txn.updated',
                            'txn',
                            (int)$data['linked_txn_id'],
                            ['reason' => 'credit_note', 'credit_note_id' => $newId],
                            $beforeSnap,
                            $this->txnAuditCompactSnapshot($afterInv)
                        );
                    } catch (\Throwable $e) {
                        error_log('[TxnModel] credit_note invoice audit: ' . $e->getMessage());
                    }
                }
            }
        }

        return $newId;
    }

    /**
     * Set/upsert an opening balance for a client or organization + billing profile + ledger class
     * + ledger_movement_kind (fees | reimbursement). Amount zero removes that slice.
     *
     * @param array<string, mixed> $data
     * @return int|null  New row id, or null if cleared
     */
    public function setOpeningBalance(array $data): ?int
    {
        $clientId    = (int)($data['client_id'] ?? 0);
        $orgId       = (int)($data['organization_id'] ?? 0);
        $profileCode = (string)$data['billing_profile_code'];
        $amount      = (float)$data['amount'];
        $type        = $data['type'] ?? 'debit'; // 'debit' or 'credit'
        $ledgerClass = LedgerDimensions::normalizeLedgerClass($data['ledger_class'] ?? null);
        $movementKind = LedgerDimensions::assertLedgerMovementKindRequired($data['ledger_movement_kind'] ?? '');

        if (($clientId <= 0 && $orgId <= 0) || ($clientId > 0 && $orgId > 0)) {
            throw new \InvalidArgumentException('Provide exactly one of client_id or organization_id.');
        }
        if ($profileCode === '') {
            throw new \InvalidArgumentException('billing_profile_code is required.');
        }

        if ($clientId > 0) {
            $del = $this->db->prepare(
                "DELETE FROM txn
                 WHERE client_id = :client_id
                   AND COALESCE(organization_id, 0) = 0
                   AND billing_profile_code = :profile_code
                   AND txn_type = 'opening_balance'
                   AND ledger_class = :ledger_class
                   AND ledger_movement_kind = :movement_kind"
            );
            $del->execute([
                ':client_id'       => $clientId,
                ':profile_code'    => $profileCode,
                ':ledger_class'    => $ledgerClass,
                ':movement_kind'   => $movementKind,
            ]);
        } else {
            $del = $this->db->prepare(
                "DELETE FROM txn
                 WHERE organization_id = :org_id
                   AND COALESCE(client_id, 0) = 0
                   AND billing_profile_code = :profile_code
                   AND txn_type = 'opening_balance'
                   AND ledger_class = :ledger_class
                   AND ledger_movement_kind = :movement_kind"
            );
            $del->execute([
                ':org_id'          => $orgId,
                ':profile_code'    => $profileCode,
                ':ledger_class'    => $ledgerClass,
                ':movement_kind'   => $movementKind,
            ]);
        }

        if ($amount <= 0) {
            return null;
        }

        $classChr = match ($ledgerClass) {
            LedgerDimensions::CLASS_MEMORANDUM => 'M',
            LedgerDimensions::CLASS_OPTIONAL   => 'O',
            default                            => 'R',
        };
        $kindChr  = $movementKind === LedgerDimensions::KIND_REIMBURSEMENT ? 'I' : 'F';
        $entityKey = $clientId > 0 ? 'C' . $clientId : 'O' . $orgId;
        $invoiceNumber = 'OB-' . $entityKey . '-' . $profileCode . '-' . $classChr . $kindChr;
        $invoiceNumber = $this->clipDbText($invoiceNumber, 50);

        return $this->create([
            'client_id'              => $clientId > 0 ? $clientId : null,
            'organization_id'        => $orgId > 0 ? $orgId : null,
            'txn_type'               => 'opening_balance',
            'txn_date'               => $data['txn_date'] ?? date('Y-m-d'),
            'narration'              => 'Opening Balance',
            'invoice_number'         => $invoiceNumber,
            'debit'                  => $type === 'debit'  ? $amount : 0,
            'credit'                 => $type === 'credit' ? $amount : 0,
            'amount'                 => $amount,
            'billing_profile_code'   => $profileCode,
            'status'                 => 'active',
            'created_by'             => $data['created_by'] ?? null,
            'ledger_class'           => $ledgerClass,
            'ledger_movement_kind'   => $movementKind,
        ]);
    }

    /**
     * Return opening balance entries for a client ( organization_id IS NULL/0 ) or an organization.
     * Pass exactly one of $clientId or $organizationId (> 0).
     *
     * @return array<int, array<string, mixed>>
     */
    public function getOpeningBalance(int $clientId = 0, int $organizationId = 0): array
    {
        if (($clientId <= 0 && $organizationId <= 0) || ($clientId > 0 && $organizationId > 0)) {
            throw new \InvalidArgumentException('Provide exactly one of client_id or organization_id.');
        }
        if ($clientId > 0) {
            $stmt = $this->db->prepare(
                "SELECT * FROM txn
                 WHERE client_id = :client_id
                   AND COALESCE(organization_id, 0) = 0
                   AND txn_type  = 'opening_balance'
                 ORDER BY billing_profile_code ASC, ledger_class ASC, ledger_movement_kind ASC"
            );
            $stmt->execute([':client_id' => $clientId]);
        } else {
            $stmt = $this->db->prepare(
                "SELECT * FROM txn
                 WHERE organization_id = :org_id
                   AND COALESCE(client_id, 0) = 0
                   AND txn_type  = 'opening_balance'
                 ORDER BY billing_profile_code ASC, ledger_class ASC, ledger_movement_kind ASC"
            );
            $stmt->execute([':org_id' => $organizationId]);
        }

        return $stmt->fetchAll();
    }

    /**
     * Invoices in a date range with stored cost-analysis flags (below standard / below calculated).
     *
     * @return array<int, array<string, mixed>>
     */
    public function listInvoiceCostVarianceRows(string $dateFrom, string $dateTo): array
    {
        $stmt = $this->db->prepare(
            "SELECT t.id, t.txn_date, t.invoice_number, t.client_id, t.organization_id,
                    t.service_id, t.invoice_cost_analysis, t.invoice_cost_analysis_ack_at,
                    COALESCE(
                        NULLIF(TRIM(o.name), ''),
                        NULLIF(TRIM(c.organization_name), ''),
                        NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                        'Unknown'
                    ) AS client_name
             FROM txn t
             LEFT JOIN clients c ON c.id = t.client_id
             LEFT JOIN organizations o ON o.id = t.organization_id
             WHERE t.txn_type = 'invoice'
               AND t.status = 'active'
               AND t.txn_date >= :df
               AND t.txn_date <= :dt
             ORDER BY t.txn_date DESC, t.id DESC"
        );
        $stmt->execute([':df' => $dateFrom, ':dt' => $dateTo]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $out = [];
        foreach ($rows as $r) {
            $ica = $r['invoice_cost_analysis'] ?? null;
            if (is_string($ica)) {
                $decoded = json_decode($ica, true);
                $ica     = is_array($decoded) ? $decoded : [];
            }
            if (!is_array($ica) || $ica === []) {
                continue;
            }
            $belowStd  = !empty($ica['below_standard_fees']);
            $belowCalc = !empty($ica['below_calculated_hours_fees']);
            if (!$belowStd && !$belowCalc) {
                continue;
            }
            $matchSub = (float)($ica['matching_professional_subtotal'] ?? 0);
            $std      = isset($ica['standard_fees']) && $ica['standard_fees'] !== null
                ? (float)$ica['standard_fees']
                : null;
            $calc = (float)($ica['calculated_hours_fees'] ?? 0);

            $out[] = [
                'txn_id'                         => (int)$r['id'],
                'txn_date'                       => (string)$r['txn_date'],
                'invoice_number'                 => (string)($r['invoice_number'] ?? ''),
                'client_name'                    => (string)($r['client_name'] ?? ''),
                'service_id'                     => isset($r['service_id']) ? (int)$r['service_id'] : null,
                'below_standard_fees'            => $belowStd,
                'below_calculated_hours_fees'    => $belowCalc,
                'below_both'                     => $belowStd && $belowCalc,
                'matching_professional_subtotal' => round($matchSub, 2),
                'standard_fees'                  => $std !== null ? round($std, 2) : null,
                'calculated_hours_fees'          => round($calc, 2),
                'billed_hours_fees'              => round((float)($ica['billed_hours_fees'] ?? 0), 2),
                'unbilled_hours_fees'            => round((float)($ica['unbilled_hours_fees'] ?? 0), 2),
                'diff_vs_standard'               => $std !== null ? round($std - $matchSub, 2) : null,
                'diff_vs_calculated'             => $calc > 0 ? round($calc - $matchSub, 2) : null,
                'accounts_ack_at'                => $r['invoice_cost_analysis_ack_at'] ?? null,
            ];
        }

        return $out;
    }

    /**
     * Return TDS entries for a client, optionally filtered by status.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getTdsEntries(int $clientId = 0, ?string $tdsStatus = null): array
    {
        $where  = ["t.txn_type IN ('tds_provisional','tds_final','tds_reversal')"];
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
                    COALESCE(
                        NULLIF(TRIM(o.name), ''),
                        NULLIF(TRIM(c.organization_name), ''),
                        NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                        'Unknown'
                    ) AS client_name,
                    creator.name AS created_by_user_name,
                    updater.name AS updated_by_user_name
             FROM txn t
             LEFT JOIN clients c ON c.id = t.client_id
             LEFT JOIN organizations o ON o.id = t.organization_id
             LEFT JOIN users creator ON creator.id = t.created_by
             LEFT JOIN users updater ON updater.id = t.updated_by
             WHERE {$whereClause}
             ORDER BY t.txn_date DESC, t.id DESC"
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $this->decodeJsonbInvoiceFields($r);
        }
        unset($r);

        return $rows;
    }

    /**
     * Update a txn row.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data, ?int $updatedByUserId = null): bool
    {
        $setClauses = [];
        $params     = [':id' => $id];

        $allowed = [
            'txn_date', 'narration', 'debit', 'credit', 'amount',
            'billing_profile_code', 'invoice_number', 'due_date',
            'subtotal', 'tax_percent', 'tax_amount', 'invoice_status',
            'payment_method', 'reference_number',
            'expense_purpose', 'paid_from',
            'firm_bank_account_id', 'counterparty_firm_bank_account_id',
            'tds_status', 'tds_section', 'tds_rate',
            'linked_txn_id', 'notes', 'status', 'line_items', 'gst_breakdown',
            'invoice_cost_analysis_ack_user_id', 'invoice_cost_analysis_ack_at', 'invoice_cost_analysis',
            'ledger_class', 'ledger_movement_kind', 'public_ref',
        ];
        foreach ($allowed as $field) {
            if (!array_key_exists($field, $data)) {
                continue;
            }
            if ($field === 'line_items') {
                $lv = $data['line_items'];
                if (is_array($lv) && count($lv) > 0) {
                    InvoiceLineCommission::assertValid($lv);
                    if (array_key_exists('subtotal', $data)) {
                        $this->assertLineItemsSumMatchesSubtotal($lv, (float)$data['subtotal']);
                    }
                }
                $setClauses[] = 'line_items = CAST(:line_items AS jsonb)';
                if ($lv === null || (is_array($lv) && count($lv) === 0)) {
                    $params[':line_items'] = null;
                } elseif (is_array($lv)) {
                    $params[':line_items'] = json_encode(array_values($lv), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                } else {
                    $params[':line_items'] = (string)$lv;
                }
                continue;
            }
            if ($field === 'gst_breakdown') {
                $setClauses[] = 'gst_breakdown = CAST(:gst_breakdown AS jsonb)';
                $gv           = $data['gst_breakdown'];
                if ($gv === null) {
                    $params[':gst_breakdown'] = null;
                } elseif (is_array($gv)) {
                    $params[':gst_breakdown'] = json_encode($gv, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                } else {
                    $params[':gst_breakdown'] = (string)$gv;
                }
                continue;
            }
            if ($field === 'invoice_cost_analysis') {
                $setClauses[] = 'invoice_cost_analysis = CAST(:invoice_cost_analysis AS jsonb)';
                $iv           = $data['invoice_cost_analysis'];
                if ($iv === null) {
                    $params[':invoice_cost_analysis'] = '{}';
                } elseif (is_array($iv)) {
                    $params[':invoice_cost_analysis'] = json_encode($iv, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                } else {
                    $params[':invoice_cost_analysis'] = (string)$iv;
                }
                continue;
            }
            $setClauses[]       = "{$field} = :{$field}";
            $params[":{$field}"] = $data[$field];
        }

        if (empty($setClauses)) {
            return false;
        }

        if ($updatedByUserId !== null) {
            $setClauses[]              = 'updated_by = :_updated_by';
            $params[':_updated_by']    = $updatedByUserId;
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

    /**
     * Firm-only expense (salary, rent, etc.) — no client ledger impact.
     *
     * @param array<string, mixed> $data
     */
    public function createFirmExpense(array $data): int
    {
        $amount = (float)($data['amount'] ?? 0);
        if ($amount <= 0) {
            throw new \InvalidArgumentException('amount must be greater than zero.');
        }
        $bankId = (int)($data['firm_bank_account_id'] ?? 0);
        if ($bankId <= 0) {
            throw new \InvalidArgumentException('firm_bank_account_id is required.');
        }
        $cat = trim((string)($data['firm_expense_category'] ?? ''));
        if ($cat === '') {
            throw new \InvalidArgumentException('firm_expense_category is required.');
        }
        $banks = new FirmBankAccountModel();
        $acc   = $banks->find($bankId);
        if ($acc === null || empty($acc['is_active'])) {
            throw new \InvalidArgumentException('Invalid or inactive bank account.');
        }
        $billingCode = (string)$acc['billing_firm_code'];

        return $this->create(array_merge($data, [
            'txn_type'               => 'firm_expense',
            'client_id'              => null,
            'organization_id'        => null,
            'billing_profile_code'   => $billingCode,
            'narration'              => $data['narration'] ?? ('Firm expense — ' . $cat),
            'debit'                  => $amount,
            'credit'                 => 0,
            'amount'                 => $amount,
            'firm_expense_category'  => $cat,
            'firm_bank_account_id'   => $bankId,
            'status'                 => 'active',
        ]));
    }

    /**
     * Inter-bank transfer (two linked txn rows).
     *
     * @param array<string, mixed> $data
     * @return array{out_id:int, in_id:int}
     */
    public function createFirmBankTransferPair(array $data): array
    {
        $from   = (int)($data['from_firm_bank_account_id'] ?? 0);
        $to     = (int)($data['to_firm_bank_account_id'] ?? 0);
        $amount = (float)($data['amount'] ?? 0);
        if ($from <= 0 || $to <= 0 || $from === $to) {
            throw new \InvalidArgumentException('from and to bank accounts must differ and be valid.');
        }
        if ($amount <= 0) {
            throw new \InvalidArgumentException('amount must be greater than zero.');
        }
        $banks  = new FirmBankAccountModel();
        $aFrom  = $banks->find($from);
        $aTo    = $banks->find($to);
        if ($aFrom === null || $aTo === null || empty($aFrom['is_active']) || empty($aTo['is_active'])) {
            throw new \InvalidArgumentException('Invalid or inactive bank account(s).');
        }

        $date = (string)($data['txn_date'] ?? date('Y-m-d'));
        $narr = trim((string)($data['narration'] ?? ''));
        if ($narr === '') {
            $narr = 'Bank transfer';
        }
        $billingFrom = (string)$aFrom['billing_firm_code'];
        $billingTo   = (string)$aTo['billing_firm_code'];

        $this->db->beginTransaction();
        try {
            $idOut = $this->create(array_merge($data, [
                'txn_type'                          => 'firm_bank_transfer',
                'client_id'                         => null,
                'organization_id'                   => null,
                'billing_profile_code'              => $billingFrom,
                'txn_date'                          => $date,
                'narration'                         => $narr . ' (out)',
                'debit'                             => $amount,
                'credit'                            => 0,
                'amount'                            => $amount,
                'firm_bank_account_id'              => $from,
                'counterparty_firm_bank_account_id' => $to,
                'status'                            => 'active',
                'linked_txn_id'                     => null,
            ]));
            $idIn = $this->create(array_merge($data, [
                'txn_type'                          => 'firm_bank_transfer',
                'client_id'                         => null,
                'organization_id'                   => null,
                'billing_profile_code'              => $billingTo,
                'txn_date'                          => $date,
                'narration'                         => $narr . ' (in)',
                'debit'                             => 0,
                'credit'                            => $amount,
                'amount'                            => $amount,
                'firm_bank_account_id'              => $to,
                'counterparty_firm_bank_account_id' => $from,
                'status'                            => 'active',
                'linked_txn_id'                     => $idOut,
            ]));
            $this->update($idOut, ['linked_txn_id' => $idIn]);
            $this->db->commit();
            return ['out_id' => $idOut, 'in_id' => $idIn];
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Bank / cash book with running balance (opening_balance + movement).
     *
     * @return array<int, array<string, mixed>>
     */
    public function getBankLedger(int $accountId, string $dateFrom = '', string $dateTo = ''): array
    {
        $banks = new FirmBankAccountModel();
        $acc   = $banks->find($accountId);
        if ($acc === null) {
            return [];
        }
        $opening = (float)($acc['opening_balance'] ?? 0);
        $openDate = (string)($acc['opening_balance_date'] ?? '');

        $where  = ['t.firm_bank_account_id = :aid', "t.status = 'active'"];
        $params = [':aid' => $accountId];
        if ($dateFrom !== '') {
            $where[]              = 't.txn_date >= :df';
            $params[':df']        = $dateFrom;
        }
        if ($dateTo !== '') {
            $where[]            = 't.txn_date <= :dt';
            $params[':dt']      = $dateTo;
        }
        $whereClause = implode(' AND ', $where);

        $stmt = $this->db->prepare(
            "SELECT t.*
             FROM txn t
             WHERE {$whereClause}
             ORDER BY t.txn_date ASC, t.id ASC"
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $balance = $opening;
        $out     = [];
        if ($opening !== 0.0 || $openDate !== '') {
            $out[] = [
                'row_type'       => 'opening',
                'txn_date'       => $openDate !== '' ? $openDate : null,
                'narration'      => 'Opening balance',
                'debit'          => 0.0,
                'credit'         => 0.0,
                'movement'       => 0.0,
                'balance'        => $opening,
                'txn_type'       => null,
                'id'             => null,
            ];
        }
        foreach ($rows as $row) {
            $this->decodeJsonbInvoiceFields($row);
            $credit = (float)($row['credit'] ?? 0);
            $debit  = (float)($row['debit'] ?? 0);
            $mov    = $credit - $debit;
            $balance += $mov;
            $row['movement'] = $mov;
            $row['balance']  = $balance;
            $row['row_type'] = 'txn';
            $out[] = $row;
        }

        return $out;
    }

    /**
     * Paginate contra transfers and firm expenses for reports.
     *
     * @return array{total: int, rows: array<int, array<string, mixed>>}
     */
    public function paginateFirmInternal(
        int $page,
        int $perPage,
        string $kind,
        string $dateFrom,
        string $dateTo
    ): array {
        $where  = ["t.status = 'active'", "t.client_id IS NULL", "t.organization_id IS NULL"];
        $params = [];
        $kind   = strtolower(trim($kind));
        if ($kind === 'expense') {
            $where[] = "t.txn_type = 'firm_expense'";
        } elseif ($kind === 'contra') {
            $where[] = "t.txn_type = 'firm_bank_transfer'";
        } else {
            $where[] = "t.txn_type IN ('firm_expense', 'firm_bank_transfer')";
        }
        if ($dateFrom !== '') {
            $where[]       = 't.txn_date >= :df';
            $params[':df'] = $dateFrom;
        }
        if ($dateTo !== '') {
            $where[]       = 't.txn_date <= :dt';
            $params[':dt'] = $dateTo;
        }
        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $cnt = $this->db->prepare("SELECT COUNT(*) FROM txn t WHERE {$whereClause}");
        $cnt->execute($params);
        $total = (int)$cnt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT t.* FROM txn t
             WHERE {$whereClause}
             ORDER BY t.txn_date DESC, t.id DESC
             LIMIT :lim OFFSET :off"
        );
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        foreach ($rows as &$r) {
            $this->decodeJsonbInvoiceFields($r);
        }
        unset($r);

        return ['total' => $total, 'rows' => $rows];
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Clip strings to PostgreSQL VARCHAR(n) limits so inserts never fail with
     * "value too long" (e.g. paid_from = bank name (200) + " (bank)" > 200).
     *
     * @return string|null  null when input is null or empty after trim
     */
    private function clipDbText(?string $value, int $maxChars): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $s = trim($value);
        if ($s === '') {
            return null;
        }
        if ($maxChars <= 0) {
            return '';
        }
        if (function_exists('mb_strlen')) {
            if (mb_strlen($s, 'UTF-8') <= $maxChars) {
                return $s;
            }

            return mb_substr($s, 0, $maxChars, 'UTF-8');
        }

        return strlen($s) <= $maxChars ? $s : substr($s, 0, $maxChars);
    }

    /**
     * Decode JSONB invoice fields for API responses (PDO may return a string).
     *
     * @param array<string, mixed> $row
     */
    private function decodeJsonbInvoiceFields(array &$row): void
    {
        if (array_key_exists('line_items', $row) && $row['line_items'] !== null && is_string($row['line_items'])) {
            $decoded = json_decode($row['line_items'], true);
            $row['line_items'] = is_array($decoded) ? $decoded : null;
        }
        if (array_key_exists('gst_breakdown', $row) && $row['gst_breakdown'] !== null && is_string($row['gst_breakdown'])) {
            $decoded = json_decode($row['gst_breakdown'], true);
            $row['gst_breakdown'] = is_array($decoded) ? $decoded : null;
        }
        if (array_key_exists('invoice_cost_analysis', $row) && $row['invoice_cost_analysis'] !== null && is_string($row['invoice_cost_analysis'])) {
            $decoded = json_decode($row['invoice_cost_analysis'], true);
            $row['invoice_cost_analysis'] = is_array($decoded) ? $decoded : [];
        }
    }

    /**
     * @return string|null JSON string for CAST(:x AS jsonb), or null
     */
    private function normalizeLineItemsForStorage(mixed $raw): ?string
    {
        if ($raw === null || $raw === '' || $raw === []) {
            return null;
        }
        if (!is_array($raw)) {
            return null;
        }
        if (count($raw) === 0) {
            return null;
        }

        return json_encode(array_values($raw), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    /**
     * @param array<int, array<string, mixed>> $lines
     */
    private function assertLineItemsSumMatchesSubtotal(array $lines, float $subtotal): void
    {
        $sum = 0.0;
        foreach ($lines as $line) {
            $sum += (float)($line['amount'] ?? 0);
        }
        if (abs(round($sum, 2) - round($subtotal, 2)) > 0.02) {
            throw new \InvalidArgumentException('Line items must sum to the taxable (pre-GST) subtotal.');
        }
    }

    /**
     * @return string|null JSON for CAST(:x AS jsonb), or null
     */
    private function normalizeGstBreakdownForStorage(mixed $raw): ?string
    {
        if ($raw === null || $raw === []) {
            return null;
        }
        if (!is_array($raw)) {
            return null;
        }

        return json_encode($raw, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    /**
     * Reverse cash-book mirror when a receipt is reversed: mark original bank leg reversed and book offsetting cash movement.
     */
    private function applyReceiptCashReversalMirrors(int $originalReceiptId, int $reversalTxnId, float $amount, array $originalRow, ?int $actorId): void
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM txn
             WHERE linked_txn_id = :lid AND txn_type = :tt AND status = 'active'
             LIMIT 1"
        );
        $stmt->execute([':lid' => $originalReceiptId, ':tt' => self::TXN_TYPE_RECEIPT_BANK_LEG]);
        $bankLeg = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($bankLeg === false) {
            return;
        }
        $bankLegId = (int)($bankLeg['id'] ?? 0);
        if ($bankLegId <= 0) {
            return;
        }
        $this->update($bankLegId, ['status' => 'reversed'], $actorId);
        $bankAcc = (int)($bankLeg['firm_bank_account_id'] ?? 0);
        if ($bankAcc <= 0) {
            return;
        }
        $today = (new \DateTimeImmutable('now'))->format('Y-m-d');
        $this->create([
            'client_id'              => null,
            'organization_id'        => null,
            'txn_type'               => self::TXN_TYPE_RECEIPT_BANK_LEG_REVERSAL,
            'txn_date'               => $today,
            'narration'              => 'Cash out (reversal) — Receipt #' . $originalReceiptId,
            'debit'                  => $amount,
            'credit'                 => 0,
            'amount'                 => $amount,
            'billing_profile_code'   => $originalRow['billing_profile_code'] ?? null,
            'linked_txn_id'          => $reversalTxnId,
            'firm_bank_account_id'   => $bankAcc,
            'status'                 => 'active',
            'created_by'             => $actorId,
            'ledger_class'           => $originalRow['ledger_class'] ?? LedgerDimensions::CLASS_REGULAR,
            'ledger_movement_kind'   => $originalRow['ledger_movement_kind'] ?? null,
        ]);
    }

    /**
     * Reverse cash-book mirror when an on-behalf payment is reversed.
     */
    private function applyPaymentExpenseCashReversalMirrors(int $originalPaymentId, int $reversalTxnId, float $amount, array $originalRow, ?int $actorId): void
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM txn
             WHERE linked_txn_id = :lid AND txn_type = :tt AND status = 'active'
             LIMIT 1"
        );
        $stmt->execute([':lid' => $originalPaymentId, ':tt' => self::TXN_TYPE_PAYMENT_EXPENSE_BANK_LEG]);
        $bankLeg = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($bankLeg === false) {
            return;
        }
        $bankLegId = (int)($bankLeg['id'] ?? 0);
        if ($bankLegId <= 0) {
            return;
        }
        $this->update($bankLegId, ['status' => 'reversed'], $actorId);
        $bankAcc = (int)($bankLeg['firm_bank_account_id'] ?? 0);
        if ($bankAcc <= 0) {
            return;
        }
        $today = (new \DateTimeImmutable('now'))->format('Y-m-d');
        $this->create([
            'client_id'              => null,
            'organization_id'        => null,
            'txn_type'               => self::TXN_TYPE_PAYMENT_EXPENSE_BANK_LEG_REVERSAL,
            'txn_date'               => $today,
            'narration'              => 'Cash in (reversal) — Payment #' . $originalPaymentId,
            'debit'                  => 0,
            'credit'                 => $amount,
            'amount'                 => $amount,
            'billing_profile_code'   => $originalRow['billing_profile_code'] ?? null,
            'linked_txn_id'          => $reversalTxnId,
            'firm_bank_account_id'   => $bankAcc,
            'status'                 => 'active',
            'created_by'             => $actorId,
            'ledger_class'           => $originalRow['ledger_class'] ?? LedgerDimensions::CLASS_REGULAR,
            'ledger_movement_kind'   => $originalRow['ledger_movement_kind'] ?? null,
        ]);
    }

    /**
     * Delete firm cash mirror rows linked to a client-ledger receipt or POB before deleting the client row.
     */
    public function deleteCashMirrorRowsForClientLeg(int $clientLegId): void
    {
        $types = [
            self::TXN_TYPE_RECEIPT_BANK_LEG,
            self::TXN_TYPE_PAYMENT_EXPENSE_BANK_LEG,
            self::TXN_TYPE_RECEIPT_BANK_LEG_REVERSAL,
            self::TXN_TYPE_PAYMENT_EXPENSE_BANK_LEG_REVERSAL,
        ];
        $in   = implode(',', array_fill(0, count($types), '?'));
        $sql  = "DELETE FROM txn WHERE linked_txn_id = ? AND txn_type IN ({$in})";
        $stmt = $this->db->prepare($sql);
        $stmt->execute(array_merge([$clientLegId], $types));
    }

    /**
     * Upsert receipt bank leg after metadata/amount edits (controller supplies bank id from validated payload).
     *
     * @param array<string, mixed> $receiptRow Current receipt row from DB
     */
    public function syncReceiptBankLeg(int $receiptId, array $receiptRow, float $amount, int $bankId): void
    {
        if ($receiptId <= 0 || $bankId <= 0) {
            return;
        }
        $stmt = $this->db->prepare(
            "SELECT id FROM txn
             WHERE linked_txn_id = :lid AND txn_type = :tt AND status = 'active'
             LIMIT 1"
        );
        $stmt->execute([':lid' => $receiptId, ':tt' => self::TXN_TYPE_RECEIPT_BANK_LEG]);
        $existingId = $stmt->fetchColumn();
        if ($existingId !== false) {
            $this->update((int) $existingId, [
                'debit'                => 0,
                'credit'               => $amount,
                'amount'               => $amount,
                'firm_bank_account_id' => $bankId,
                'txn_date'             => $receiptRow['txn_date'] ?? date('Y-m-d'),
                'payment_method'       => $receiptRow['payment_method'] ?? null,
                'reference_number'     => $receiptRow['reference_number'] ?? null,
            ], null);

            return;
        }
        $this->insertReceiptBankLeg($receiptId, $bankId, $amount, $receiptRow);
    }

    /**
     * @param array<string, mixed> $paymentRow Current payment_expense row
     */
    public function syncPaymentExpenseBankLeg(int $paymentId, array $paymentRow, float $amount, int $bankId): void
    {
        if ($paymentId <= 0 || $bankId <= 0) {
            return;
        }
        $stmt = $this->db->prepare(
            "SELECT id FROM txn
             WHERE linked_txn_id = :lid AND txn_type = :tt AND status = 'active'
             LIMIT 1"
        );
        $stmt->execute([':lid' => $paymentId, ':tt' => self::TXN_TYPE_PAYMENT_EXPENSE_BANK_LEG]);
        $existingId = $stmt->fetchColumn();
        if ($existingId !== false) {
            $this->update((int) $existingId, [
                'debit'                => $amount,
                'credit'               => 0,
                'amount'               => $amount,
                'firm_bank_account_id' => $bankId,
                'txn_date'             => $paymentRow['txn_date'] ?? date('Y-m-d'),
                'payment_method'       => $paymentRow['payment_method'] ?? null,
                'reference_number'     => $paymentRow['reference_number'] ?? null,
            ], null);

            return;
        }
        $this->insertPaymentExpenseBankLeg($paymentId, $bankId, $amount, $paymentRow);
    }

    /** @return int Firm bank account id on active receipt_bank_leg, or 0 */
    public function findReceiptBankLegAccountId(int $receiptId): int
    {
        if ($receiptId <= 0) {
            return 0;
        }
        $stmt = $this->db->prepare(
            "SELECT firm_bank_account_id FROM txn
             WHERE linked_txn_id = :lid AND txn_type = :tt AND status = 'active'
             LIMIT 1"
        );
        $stmt->execute([':lid' => $receiptId, ':tt' => self::TXN_TYPE_RECEIPT_BANK_LEG]);
        $v = $stmt->fetchColumn();

        return $v !== false ? (int) $v : 0;
    }

    /** @return int Firm bank account id on active payment_expense_bank_leg, or 0 */
    public function findPaymentExpenseBankLegAccountId(int $paymentId): int
    {
        if ($paymentId <= 0) {
            return 0;
        }
        $stmt = $this->db->prepare(
            "SELECT firm_bank_account_id FROM txn
             WHERE linked_txn_id = :lid AND txn_type = :tt AND status = 'active'
             LIMIT 1"
        );
        $stmt->execute([':lid' => $paymentId, ':tt' => self::TXN_TYPE_PAYMENT_EXPENSE_BANK_LEG]);
        $v = $stmt->fetchColumn();

        return $v !== false ? (int) $v : 0;
    }

    public function findLedgerReversalIdForOriginal(int $originalTxnId): ?int
    {
        if ($originalTxnId <= 0) {
            return null;
        }
        $stmt = $this->db->prepare(
            "SELECT id FROM txn
             WHERE linked_txn_id = :lid
               AND txn_type IN ('receipt_reversal', 'payment_expense_reversal', 'tds_reversal')
             ORDER BY id ASC
             LIMIT 1"
        );
        $stmt->execute([':lid' => $originalTxnId]);
        $v = $stmt->fetchColumn();

        return $v !== false ? (int)$v : null;
    }

    /**
     * Mark the original txn as reversed, unwind settlement where needed, insert compensating row.
     *
     * @return array{new_id: int, affected_invoice_ids: list<int>}
     */
    public function reverseLedgerEntry(int $originalId, string $reason, ?int $actorId): array
    {
        $row = $this->find($originalId);
        if ($row === null) {
            throw new \InvalidArgumentException('Transaction not found.');
        }
        $type = (string)($row['txn_type'] ?? '');
        if (!in_array($type, ['receipt', 'payment_expense', 'tds_provisional', 'tds_final'], true)) {
            throw new \InvalidArgumentException('This transaction type cannot be reversed via this flow.');
        }
        $st = (string)($row['status'] ?? '');
        if ($st !== 'active') {
            throw new \InvalidArgumentException('Only active transactions can be reversed.');
        }
        if ($this->findLedgerReversalIdForOriginal($originalId) !== null) {
            throw new \InvalidArgumentException('This transaction has already been reversed.');
        }

        $amount = round((float)($row['amount'] ?? 0), 2);
        if ($amount <= 0.00001) {
            throw new \InvalidArgumentException('Invalid transaction amount for reversal.');
        }

        $reversalType = match ($type) {
            'receipt' => 'receipt_reversal',
            'payment_expense' => 'payment_expense_reversal',
            'tds_provisional', 'tds_final' => 'tds_reversal',
            default => throw new \InvalidArgumentException('Unsupported transaction type.'),
        };

        $debit = 0.0;
        $credit = 0.0;
        if ($reversalType === 'receipt_reversal') {
            $debit = $amount;
        } elseif ($reversalType === 'payment_expense_reversal') {
            $credit = $amount;
        } else {
            $debit = $amount;
        }

        $affectedInvoiceIds = [];
        $this->db->beginTransaction();
        try {
            if ($type === 'receipt') {
                $allocModel = new TxnSettlementAllocationModel();
                $affectedInvoiceIds = $allocModel->distinctTargetsForReceipt($originalId)['invoices'];
                $allocModel->replaceForReceipt($originalId, []);
                $this->update($originalId, ['status' => 'reversed'], $actorId);
                foreach ($affectedInvoiceIds as $iid) {
                    $this->recomputeInvoiceReceiptStatus((int)$iid);
                }
            } elseif ($type === 'payment_expense') {
                TxnReceiptAllocationService::unlinkPaymentExpenseFromReceipts($originalId);
                $this->update($originalId, ['status' => 'reversed'], $actorId);
            } else {
                $this->update($originalId, ['status' => 'reversed'], $actorId);
            }

            $origNarr = trim((string)($row['narration'] ?? ''));
            if ($origNarr === '') {
                $origNarr = $type;
            }
            $today = (new \DateTimeImmutable('now'))->format('Y-m-d');

            $newRow = [
                'client_id'            => $row['client_id'] ?? null,
                'organization_id'      => $row['organization_id'] ?? null,
                'txn_type'             => $reversalType,
                'txn_date'             => $today,
                'narration'            => 'Reversal — ' . $origNarr,
                'debit'                => $debit,
                'credit'               => $credit,
                'amount'               => $amount,
                'billing_profile_code' => $row['billing_profile_code'] ?? null,
                'linked_txn_id'        => $originalId,
                'notes'                => $reason,
                'status'               => 'active',
                'created_by'           => $actorId,
                'ledger_class'         => $row['ledger_class'] ?? LedgerDimensions::CLASS_REGULAR,
                'ledger_movement_kind' => $row['ledger_movement_kind'] ?? null,
                'payment_method'       => $row['payment_method'] ?? null,
                'reference_number'     => $row['reference_number'] ?? null,
                'firm_bank_account_id' => null,
                'expense_purpose'      => $row['expense_purpose'] ?? null,
                'paid_from'            => $row['paid_from'] ?? null,
            ];
            if ($reversalType === 'tds_reversal') {
                $newRow['tds_section'] = $row['tds_section'] ?? null;
                $newRow['tds_rate']    = isset($row['tds_rate']) ? (float)$row['tds_rate'] : null;
                $newRow['tds_status']  = $row['tds_status'] ?? null;
                $newRow['firm_bank_account_id'] = isset($row['firm_bank_account_id']) ? (int)$row['firm_bank_account_id'] : null;
                if ($newRow['firm_bank_account_id'] !== null && $newRow['firm_bank_account_id'] <= 0) {
                    $newRow['firm_bank_account_id'] = null;
                }
            }

            $newId = $this->create($newRow);
            if ($type === 'receipt') {
                $this->applyReceiptCashReversalMirrors($originalId, $newId, $amount, $row, $actorId);
            } elseif ($type === 'payment_expense') {
                $this->applyPaymentExpenseCashReversalMirrors($originalId, $newId, $amount, $row, $actorId);
            }
            $this->db->commit();

            return ['new_id' => $newId, 'affected_invoice_ids' => $affectedInvoiceIds];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }

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
     * Recompute invoice_status from settlement allocations (receipts only).
     */
    public function recomputeInvoiceReceiptStatus(int $invoiceTxnId): void
    {
        $invoice = $this->find($invoiceTxnId);
        if ($invoice === null || ($invoice['txn_type'] ?? '') !== 'invoice') {
            return;
        }
        $st = (string)($invoice['invoice_status'] ?? '');
        if ($st === 'cancelled' || $st === 'reversed') {
            return;
        }

        $allocModel      = new TxnSettlementAllocationModel();
        $totalReceived   = $allocModel->sumAllocatedToInvoice($invoiceTxnId);
        $invoiceTotal    = (float)$invoice['amount'];
        if ($totalReceived <= 0) {
            $newStatus = 'sent';
        } elseif ($totalReceived >= $invoiceTotal - 0.001) {
            $newStatus = 'paid';
        } else {
            $newStatus = 'partially_paid';
        }

        $this->db->prepare(
            "UPDATE txn SET invoice_status = :status, updated_at = NOW() WHERE id = :id"
        )->execute([':status' => $newStatus, ':id' => $invoiceTxnId]);
    }

    /** Sum existing receipt amounts allocated to an invoice txn (excludes cancelled receipts). */
    public function sumLinkedReceipts(int $invoiceTxnId): float
    {
        $allocModel = new TxnSettlementAllocationModel();

        return $allocModel->sumAllocatedToInvoice($invoiceTxnId);
    }

    /**
     * Compact row for admin_audit_log snapshots (matches TxnController).
     *
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function txnAuditCompactSnapshot(array $row): array
    {
        $keys = [
            'txn_type', 'txn_date', 'narration', 'debit', 'credit', 'amount',
            'billing_profile_code', 'invoice_number', 'invoice_status', 'due_date',
            'subtotal', 'tax_percent', 'tax_amount',
            'payment_method', 'reference_number', 'expense_purpose', 'paid_from',
            'tds_status', 'tds_section', 'tds_rate',
            'linked_txn_id', 'notes', 'status', 'public_ref',
            'ledger_class', 'ledger_movement_kind',
        ];
        $out = [];
        foreach ($keys as $k) {
            if (array_key_exists($k, $row)) {
                $out[$k] = $row[$k];
            }
        }

        return $out;
    }
}
