<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\App;
use App\Config\Auth as AuthConfig;
use App\Config\Database;
use App\Libraries\BillSettlementReportBuilder;
use App\Controllers\BaseController;
use App\Libraries\BrevoMailer;
use App\Libraries\CashBookAccess;
use App\Libraries\CommissionSyncService;
use App\Libraries\GstInvoiceTax;
use App\Libraries\InvoiceCostAnalysis;
use App\Libraries\LedgerDimensions;
use App\Libraries\LedgerTxnChangeService;
use App\Libraries\OtpService;
use App\Libraries\RazorpayClient;
use App\Libraries\TxnReceiptAllocationService;
use App\Models\AdminAuditLogModel;
use App\Models\ClientModel;
use App\Models\FirmBankAccountModel;
use App\Models\LedgerTxnChangeRequestModel;
use App\Models\OrganizationModel;
use App\Models\TxnModel;
use App\Models\TxnSettlementAllocationModel;
use App\Models\UserModel;

/**
 * TxnController — unified transaction endpoints.
 *
 * All endpoints require Bearer token authentication.
 */
class TxnController extends BaseController
{
    private TxnModel $txn;
    private UserModel $users;

    public function __construct()
    {
        $this->txn   = new TxnModel();
        $this->users = new UserModel();
    }

    // ── GET /api/admin/txn ───────────────────────────────────────────────────

    /**
     * List/paginate transactions with optional filters.
     *
     * Query params: page, per_page, search, txn_type, client_id, organization_id,
     *               expense_purpose, tds_status, status, date_from, date_to,
     *               ledger_class (optional; matches ledger sqlLedgerClassMatch when set),
     *               omit_cancelled_reversed or omit_cancelled_deleted (optional; when true, exclude cancelled/deleted only — aligned with ledger; reversed rows remain visible)
     */
    public function index(): never
    {
        $page      = max(1, (int)$this->query('page', 1));
        $perPage   = min(100, max(1, (int)$this->query('per_page', 20)));
        $search    = trim((string)$this->query('search', ''));
        $txnType   = trim((string)$this->query('txn_type', ''));
        $clientId  = (int)$this->query('client_id', 0);
        $orgId     = (int)$this->query('organization_id', 0);
        $expensePurpose = trim((string)$this->query('expense_purpose', ''));
        $paymentMethodFilter = trim((string)$this->query('payment_method', ''));
        $paidFromFilter = trim((string)$this->query('paid_from', ''));
        $tdsStatus = trim((string)$this->query('tds_status', ''));
        $status    = trim((string)$this->query('status', ''));
        $dateFrom  = trim((string)$this->query('date_from', ''));
        $dateTo    = trim((string)$this->query('date_to', ''));
        $ledgerClassFilter = trim((string)$this->query('ledger_class', ''));
        $omitRaw             = strtolower(trim((string)$this->query('omit_cancelled_reversed', '')));
        $omitDelRaw          = strtolower(trim((string)$this->query('omit_cancelled_deleted', '')));
        $omitCancelledReversed = in_array($omitRaw, ['1', 'true', 'yes'], true)
            || in_array($omitDelRaw, ['1', 'true', 'yes'], true);

        $result = $this->txn->paginate(
            $page, $perPage, $search, $txnType,
            $clientId, $orgId, $tdsStatus, $status, $dateFrom, $dateTo, $expensePurpose, $paymentMethodFilter, $paidFromFilter,
            $ledgerClassFilter,
            $omitCancelledReversed
        );

        $this->success($result['txns'], 'Transactions retrieved', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => (int)ceil($result['total'] / $perPage),
            ],
        ]);
    }

    // ── POST /api/admin/txn ──────────────────────────────────────────────────

    /**
     * Create any transaction type.
     * Body must include `txn_type`.
     */
    public function store(): never
    {
        $body    = $this->getJsonBody();
        $txnType = trim((string)($body['txn_type'] ?? ''));

        $valid = [
            'opening_balance', 'invoice', 'payment_expense', 'payment_client_cost',
            'receipt', 'tds_provisional', 'tds_final', 'rebate', 'credit_note',
            'firm_expense', 'firm_inflow', 'firm_bank_transfer',
        ];
        if (!in_array($txnType, $valid, true)) {
            $this->error('Invalid or missing txn_type.', 422);
        }

        $actingUser = $this->authUser();
        $typeScopeErr = CashBookAccess::assertAllowedFirmTxnType($actingUser, $txnType);
        if ($typeScopeErr !== null) {
            $this->error($typeScopeErr, 403);
        }
        if (CashBookAccess::isCashBookOnlyUser($actingUser) && in_array($txnType, ['firm_expense', 'firm_inflow', 'firm_bank_transfer'], true)) {
            $cashErr = CashBookAccess::assertFirmCreateBodyCashAccounts($txnType, $body);
            if ($cashErr !== null) {
                $this->error($cashErr, 403);
            }
        }

        $createdBy  = $actingUser ? (int)$actingUser['id'] : null;

        $body['created_by'] = $createdBy;

        switch ($txnType) {
            case 'invoice':
                $cid = (int)($body['client_id'] ?? 0);
                $oid = (int)($body['organization_id'] ?? 0);
                if ($cid <= 0 && $oid <= 0) {
                    $this->error('client_id or organization_id is required for an invoice.', 422);
                }
                if ($cid > 0 && $oid > 0) {
                    $this->error('Provide only one of client_id or organization_id for an invoice.', 422);
                }
                try {
                    $recipientGstin = $this->resolveRecipientGstin($cid, $oid);
                    $originalLines    = isset($body['line_items']) && is_array($body['line_items'])
                        ? $body['line_items']
                        : [];
                    $analysis      = InvoiceCostAnalysis::analyzeInvoiceBody($body);
                    $violations    = InvoiceCostAnalysis::validationViolations($analysis);
                    $confirm       = filter_var($body['invoice_cost_analysis_confirm'] ?? false, FILTER_VALIDATE_BOOLEAN);
                    $canAck        = InvoiceCostAnalysis::actorMayAcknowledgeCostShortfall($actingUser);
                    if ($violations !== [] && (!$confirm || !$canAck)) {
                        $this->error(
                            'Accounts confirmation is required when invoice fees are below Standard Fees or below calculated hours-based fees.',
                            422,
                            [],
                            [
                                'code'       => 'invoice_cost_analysis_confirm_required',
                                'violations' => $violations,
                                'analysis'   => $analysis,
                            ]
                        );
                    }

                    $linesWithSnap = InvoiceCostAnalysis::attachLineSnapshots($originalLines, $analysis);
                    $bodyForTax    = $body;
                    $bodyForTax['line_items'] = $linesWithSnap;

                    $prepared = GstInvoiceTax::prepareInvoice($bodyForTax, $recipientGstin);
                    $prepared['line_items'] = InvoiceCostAnalysis::mergeLineMetadata(
                        $linesWithSnap,
                        $prepared['line_items'] ?? []
                    );

                    $merged = array_merge($body, $prepared);
                    if (!empty($analysis['service_id']) && !empty($analysis['engagement_type_id'])) {
                        $merged['invoice_cost_analysis'] = InvoiceCostAnalysis::aggregateSnapshotForStorage($analysis);
                    } else {
                        $merged['invoice_cost_analysis'] = [];
                    }
                    if ($violations !== [] && $confirm && $canAck && $actingUser) {
                        $merged['invoice_cost_analysis_ack_user_id'] = (int)$actingUser['id'];
                        $merged['invoice_cost_analysis_ack_at']      = gmdate('Y-m-d H:i:s');
                    }

                    $merged['ledger_class'] = LedgerDimensions::assertLedgerClass($merged['ledger_class'] ?? '');
                    if (LedgerDimensions::isParkedLedgerClass($merged['ledger_class'])) {
                        throw new \InvalidArgumentException('Invoices cannot use parked ledger class.');
                    }
                    $merged['ledger_movement_kind'] = null;

                    $id = $this->txn->createInvoice($merged);
                } catch (\InvalidArgumentException $e) {
                    $this->error($e->getMessage(), 422);
                }
                break;
            case 'receipt':
                $rcid = (int)($body['client_id'] ?? 0);
                $roid = (int)($body['organization_id'] ?? 0);
                if ($rcid <= 0 && $roid <= 0) {
                    $this->error('client_id or organization_id is required for a receipt.', 422);
                }
                if ($rcid > 0 && $roid > 0) {
                    $this->error('Provide only one of client_id or organization_id for a receipt.', 422);
                }
                try {
                    $body['ledger_class'] = LedgerDimensions::assertLedgerClass($body['ledger_class'] ?? '');
                    $body['ledger_movement_kind'] = LedgerDimensions::assertLedgerMovementKindRequired($body['ledger_movement_kind'] ?? '');
                    if (LedgerDimensions::isParkedLedgerClass($body['ledger_class'])) {
                        $allocRows = TxnReceiptAllocationService::normalizeParkedReceiptAllocations($body);
                    } else {
                        $allocRows = TxnReceiptAllocationService::normalizeAndValidateAllocations($body, $body['allocations'] ?? null);
                    }
                } catch (\InvalidArgumentException $e) {
                    $this->error($e->getMessage(), 422);
                }
                $this->attachValidatedBankAccount($body);
                $id = $this->txn->createReceipt($body, $allocRows);
                break;
            case 'payment_expense':
                $pAmount = (float)($body['amount'] ?? 0);
                if ($pAmount <= 0) {
                    $this->error('amount must be greater than zero.', 422);
                }
                $pcid = (int)($body['client_id'] ?? 0);
                $poid = (int)($body['organization_id'] ?? 0);
                if ($pcid <= 0 && $poid <= 0) {
                    $this->error('client_id or organization_id is required for a payment expense.', 422);
                }
                if ($pcid > 0 && $poid > 0) {
                    $this->error('Provide only one of client_id or organization_id for a payment expense.', 422);
                }
                try {
                    $this->enforceMovementLedgerDimensions($body, false);
                } catch (\InvalidArgumentException $e) {
                    $this->error($e->getMessage(), 422);
                }
                $linesRaw = $body['settlement_lines'] ?? null;
                unset(
                    $body['settlement_lines'],
                    $body['settlement_mode'],
                    $body['settle_from_receipt_id'],
                    $body['settle_from_receipt_public_ref'],
                    $body['settle_from_receipt_amount']
                );
                try {
                    if (LedgerDimensions::isParkedLedgerClass($body['ledger_class'] ?? '')) {
                        TxnReceiptAllocationService::assertParkedPaymentSettlementLines($pAmount, $linesRaw);
                        $parsed = ['receipt_totals' => []];
                    } else {
                        $parsed = TxnReceiptAllocationService::normalizePaymentExpenseSettlementLines(
                            $pAmount,
                            $linesRaw,
                            $pcid,
                            $poid,
                            (string)($body['ledger_class'] ?? ''),
                            (string)($body['ledger_movement_kind'] ?? ''),
                            $this->txn
                        );
                    }
                } catch (\InvalidArgumentException $e) {
                    $this->error($e->getMessage(), 422);
                }
                $this->attachValidatedBankAccount($body);
                $dbConn = Database::getConnection();
                $dbConn->beginTransaction();
                try {
                    $id = $this->txn->createPaymentExpense($body);
                    $createdPay = $this->txn->find((int)$id);
                    if ($createdPay === null) {
                        throw new \InvalidArgumentException('Payment expense not found after create.');
                    }
                    foreach ($parsed['receipt_totals'] as $rid => $amt) {
                        $receiptRow = $this->txn->find((int)$rid);
                        if ($receiptRow === null) {
                            throw new \InvalidArgumentException('Receipt not found.');
                        }
                        TxnReceiptAllocationService::linkPaymentExpenseToReceipt(
                            $receiptRow,
                            $createdPay,
                            $amt
                        );
                    }
                    $dbConn->commit();
                } catch (\InvalidArgumentException $e) {
                    if ($dbConn->inTransaction()) {
                        $dbConn->rollBack();
                    }
                    $this->error($e->getMessage(), 422);
                } catch (\Throwable $e) {
                    if ($dbConn->inTransaction()) {
                        $dbConn->rollBack();
                    }
                    throw $e;
                }
                break;
            case 'payment_client_cost':
                $cAmount = (float)($body['amount'] ?? 0);
                if ($cAmount <= 0) {
                    $this->error('amount must be greater than zero.', 422);
                }
                $ccid = (int)($body['client_id'] ?? 0);
                $coid = (int)($body['organization_id'] ?? 0);
                if ($ccid <= 0 && $coid <= 0) {
                    $this->error('client_id or organization_id is required for a client cost payment.', 422);
                }
                if ($ccid > 0 && $coid > 0) {
                    $this->error('Provide only one of client_id or organization_id for a client cost payment.', 422);
                }
                if (!empty($body['settlement_lines']) || !empty($body['settle_from_receipt_id'])) {
                    $this->error('Client cost payments cannot be settled from receipts or unallocated advance.', 422);
                }
                try {
                    $this->enforceClientCostLedgerDimensions($body);
                } catch (\InvalidArgumentException $e) {
                    $this->error($e->getMessage(), 422);
                }
                $this->attachValidatedBankAccount($body);
                $id = $this->txn->createPaymentClientCost($body);
                break;
            case 'tds_provisional':
                try {
                    $this->enforceMovementLedgerDimensions($body, false);
                } catch (\InvalidArgumentException $e) {
                    $this->error($e->getMessage(), 422);
                }
                $id = $this->txn->createTds($body);
                break;
            case 'rebate':
                try {
                    $this->enforceMovementLedgerDimensions($body, false);
                } catch (\InvalidArgumentException $e) {
                    $this->error($e->getMessage(), 422);
                }
                $id = $this->txn->createRebate($body);
                break;
            case 'credit_note':
                try {
                    $id = $this->txn->createCreditNote($body);
                } catch (\InvalidArgumentException $e) {
                    $this->error($e->getMessage(), 422);
                }
                break;
            case 'opening_balance':
                try {
                    $id = $this->txn->setOpeningBalance($body);
                } catch (\InvalidArgumentException $e) {
                    $this->error($e->getMessage(), 422);
                }
                if ($id === null) {
                    $this->success(null, 'Opening balance cleared', 200);
                }
                break;
            case 'firm_expense':
                try {
                    $id = $this->txn->createFirmExpense($body);
                } catch (\InvalidArgumentException $e) {
                    $this->error($e->getMessage(), 422);
                }
                break;
            case 'firm_inflow':
                try {
                    $id = $this->txn->createFirmInflow($body);
                } catch (\InvalidArgumentException $e) {
                    $this->error($e->getMessage(), 422);
                }
                break;
            case 'firm_bank_transfer':
                try {
                    $ids = $this->txn->createFirmBankTransferPair($body);
                    $this->recordTxnCreated((int)$ids['out_id'], $createdBy);
                    $this->recordTxnCreated((int)$ids['in_id'], $createdBy);
                    $this->success([
                        'out' => $this->txn->find($ids['out_id']),
                        'in'  => $this->txn->find($ids['in_id']),
                    ], 'Transfer recorded', 201);
                } catch (\InvalidArgumentException $e) {
                    $this->error($e->getMessage(), 422);
                }
                break;
            default:
                $id = $this->txn->create($body);
        }

        if ($txnType === 'invoice') {
            (new CommissionSyncService())->syncInvoiceSafe((int)$id);
        }
        if ($txnType === 'credit_note' && !empty($body['linked_txn_id'])) {
            (new CommissionSyncService())->afterCreditNote((int)$body['linked_txn_id']);
        }

        $row = $this->txn->find($id);
        $this->recordTxnCreated((int)$id, $createdBy);
        $this->success($row, 'Transaction created', 201);
    }

    // ── GET /api/admin/txn/:id ───────────────────────────────────────────────

    public function show(int $id): never
    {
        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }
        $type = (string)($row['txn_type'] ?? '');
        if ($type === 'receipt') {
            $alloc = new TxnSettlementAllocationModel();
            $lines = [];
            foreach ($alloc->listForReceipt($id) as $e) {
                $lines[] = [
                    'target_type'   => $e['target_type'],
                    'target_txn_id' => $e['target_txn_id'] !== null ? (int)$e['target_txn_id'] : null,
                    'amount'        => round((float)($e['amount'] ?? 0), 2),
                ];
            }
            $row['allocations'] = $lines;
        }
        if ($type === 'payment_expense') {
            $alloc                   = new TxnSettlementAllocationModel();
            $row['settlement_lines'] = $alloc->settlementLinesSnapshotForPaymentExpense(
                $id,
                (float)($row['amount'] ?? 0)
            );
        }
        if ($type === 'payment_client_cost') {
            $row['settlement_lines'] = [];
        }
        if (empty($row['firm_bank_account_id'])) {
            $bankId = $this->txn->resolveFirmBankAccountIdForClientTxn($id, $type);
            if ($bankId > 0) {
                $row['firm_bank_account_id'] = $bankId;
            }
        }
        $this->txn->attachParkedTransferMeta($row);
        LedgerTxnChangeService::attachPendingToTxnRow($row);
        $this->success($row);
    }

    // ── GET /api/admin/txn/:id/audit-log ─────────────────────────────────────

    /**
     * Activity log (admin_audit_log) + summary from txn row for modal display.
     *
     * Query: limit (default 50, max 200), offset (default 0)
     */
    public function txnAuditLog(int $id): never
    {
        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }

        $limit  = min(200, max(1, (int)$this->query('limit', 50)));
        $offset = max(0, (int)$this->query('offset', 0));

        $createdName = null;
        $updatedName = null;
        if (!empty($row['created_by'])) {
            $cu = $this->users->find((int)$row['created_by']);
            if ($cu !== null) {
                $createdName = $cu['name'] ?? null;
            }
        }
        if (!empty($row['updated_by'])) {
            $uu = $this->users->find((int)$row['updated_by']);
            if ($uu !== null) {
                $updatedName = $uu['name'] ?? null;
            }
        }

        $summary = [
            'txn_id'          => $id,
            'txn_type'        => $row['txn_type'] ?? null,
            'created_at'      => $row['created_at'] ?? null,
            'updated_at'      => $row['updated_at'] ?? null,
            'created_by'      => $row['created_by'] ?? null,
            'updated_by'      => $row['updated_by'] ?? null,
            'created_by_name' => $createdName,
            'updated_by_name' => $updatedName,
        ];

        $entries = (new AdminAuditLogModel())->listForEntity('txn', $id, $limit, $offset);
        foreach ($entries as &$entry) {
            foreach (['metadata', 'before_snapshot', 'after_snapshot'] as $jsonKey) {
                if (!isset($entry[$jsonKey]) || !is_string($entry[$jsonKey]) || $entry[$jsonKey] === '') {
                    continue;
                }
                $decoded = json_decode($entry[$jsonKey], true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $entry[$jsonKey] = $decoded;
                }
            }
        }
        unset($entry);

        $this->success([
            'summary' => $summary,
            'entries' => $entries,
        ], 'Audit log retrieved');
    }

    // ── POST /api/admin/txn/:id/request-invoice-modify-otp ─────────────────────

    /**
     * Send a superadmin OTP to authorize ledger txn update or delete (invoice, receipt, payment_expense, TDS).
     * Query or JSON body: intent = update | delete.
     */
    public function requestInvoiceModifyOtp(int $id): never
    {
        $body   = $this->getJsonBody();
        $intent = trim((string)($this->query('intent', '') ?: ($body['intent'] ?? 'update')));
        if (!in_array($intent, ['update', 'delete'], true)) {
            $this->error('intent must be update or delete.', 422);
        }

        $acting = $this->authUser();
        if ($intent === 'update' && !$this->userHasPermission($acting, 'invoices.edit')) {
            $this->error('Access denied. Required permission: invoices.edit.', 403);
        }
        if ($intent === 'delete' && !$this->userHasPermission($acting, 'invoices.delete')) {
            $this->error('Access denied. Required permission: invoices.delete.', 403);
        }

        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }
        $txnType = (string)($row['txn_type'] ?? '');
        $otpEligible = [
            'invoice', 'receipt', 'payment_expense', 'payment_client_cost', 'tds_provisional', 'tds_final',
            'receipt_reversal', 'payment_expense_reversal', 'payment_client_cost_reversal', 'tds_reversal',
        ];
        if (!in_array($txnType, $otpEligible, true)) {
            $this->error('OTP requests are not supported for this transaction type.', 422);
        }

        $super = $this->users->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
        if ($super === null || !$super['is_active']) {
            $this->error('Super admin account is not provisioned.', 500);
        }
        $superId = (int)$super['id'];
        $email   = trim((string)($super['email'] ?? ''));
        if ($email === '') {
            $this->error('Super admin has no email.', 500);
        }

        $otp = OtpService::generate($superId);
        $intentLabel = $intent === 'delete' ? 'delete' : 'modify';

        $actorName  = trim((string)(($acting ?? [])['name'] ?? ''));
        $actorEmail = trim((string)(($acting ?? [])['email'] ?? ''));
        if ($actorName === '') {
            $actorName = $actorEmail !== '' ? $actorEmail : 'Staff user';
        }

        $txnSummary = $this->ledgerTxnSummaryLine($row);
        $typeLabel  = $this->txnTypeLabelForOtpEmail($txnType);
        $refLine    = $txnType === 'invoice'
            ? (string)($row['invoice_number'] ?? '—')
            : ((string)($row['public_ref'] ?? '') !== '' ? (string)$row['public_ref'] : trim(substr((string)($row['narration'] ?? ''), 0, 80)));

        try {
            $htmlBody = BrevoMailer::renderTemplate('invoice-modify-otp', [
                'userName'        => (string)($super['name'] ?? $email),
                'otpCode'         => $otp,
                'expiryMinutes'   => (string)OtpService::expiryMinutes(),
                'intentLabel'     => $intentLabel,
                'txnId'           => (string)$id,
                'invoiceRef'      => $refLine,
                'txnTypeLabel'    => $typeLabel,
                'txnSummary'      => $txnSummary,
                'requestedByName' => $actorName,
                'requestedByEmail'=> $actorEmail,
            ]);
            if ($htmlBody !== '') {
                $subject = $txnType === 'invoice'
                    ? 'Invoice change OTP - CA Rahul Gupta'
                    : 'Ledger change OTP - CA Rahul Gupta';
                BrevoMailer::send(
                    $email,
                    (string)($super['name'] ?? $email),
                    $subject,
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[TxnController] Ledger modify OTP email failed: ' . $e->getMessage());
        }

        try {
            (new AdminAuditLogModel())->insert(
                $acting ? (int)$acting['id'] : null,
                'ledger_modify_otp_requested',
                'txn',
                $id,
                [
                    'intent'    => $intent,
                    'txn_type'  => $txnType,
                ]
            );
        } catch (\Throwable $e) {
            error_log('[TxnController] ledger_modify_otp_requested audit log failed: ' . $e->getMessage());
        }

        $this->success([
            'otp_sent'     => true,
            'masked_email' => $this->maskEmail($email),
            'intent'       => $intent,
        ], 'OTP sent.');
    }

    // ── PUT /api/admin/txn/:id ───────────────────────────────────────────────

    public function update(int $id): never
    {
        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }

        if (in_array((string)($row['status'] ?? ''), ['cancelled', 'deleted', 'reversed'], true)) {
            $this->error('Cannot edit a cancelled or reversed transaction.', 422);
        }

        $body = $this->getJsonBody();
        $actingUser = $this->authUser();
        $type = (string)($row['txn_type'] ?? '');
        $scopeErr = CashBookAccess::enforceCashBookScopeForTxn($actingUser, $row, 'update');
        if ($scopeErr !== null) {
            $this->error($scopeErr, 403);
        }
        $this->enforceCashBookScopeForFirmUpdateBody($actingUser, $type, $row, $body);
        $actorId    = $actingUser ? (int)$actingUser['id'] : null;
        if ($this->txnRequiresTeamApproval($type) && !$this->isSuperAdminActor($actingUser)) {
            $queueBody = $this->normalizeFirmUpdatePayloadForQueue($row, $body);
            $intercept = LedgerTxnChangeService::queueUpdate($id, $queueBody, $actingUser);
            if ($intercept !== null) {
                $this->respondLedgerChangeQueued($intercept, $row, $actingUser);
            }
        }

        unset($body['txn_type']);

        switch ($type) {
            case 'invoice':
                $this->txn->update($id, $body, $actorId);
                break;
            case 'receipt':
                $this->applyReceiptTxnUpdate($id, $row, $body, $actorId);
                break;
            case 'payment_expense':
                $this->applyPaymentExpenseTxnUpdate($id, $row, $body, $actorId);
                break;
            case 'payment_client_cost':
                $this->applyPaymentClientCostTxnUpdate($id, $row, $body, $actorId);
                break;
            case 'tds_provisional':
            case 'tds_final':
                $this->applyTdsTxnUpdate($id, $row, $body, $actorId);
                break;
            case 'firm_expense':
            case 'firm_inflow':
                $this->applyFirmSimpleTxnUpdate($id, $row, $body, $actorId);
                break;
            case 'firm_bank_transfer':
                $this->applyFirmBankTransferPairUpdate($id, $body, $actorId);
                break;
            default:
                $this->txn->update($id, $body, $actorId);
        }

        $updated = $this->txn->find($id);
        $beforeSnap = $this->txnAuditCompactSnapshot($row);
        $afterSnap  = $this->txnAuditCompactSnapshot($updated ?? []);
        if ($updated !== null && $beforeSnap !== $afterSnap) {
            $via = $this->isSuperAdminActor($actingUser) ? 'super_admin' : 'direct';
            $this->auditTxnLog($actorId, 'txn.updated', $id, ['txn_type' => $type, 'via' => $via], $beforeSnap, $afterSnap);
        }
        if ($type === 'invoice') {
            (new CommissionSyncService())->syncInvoiceSafe($id);
            $this->notifyAdminsInvoiceChange('updated', $row, $updated, $this->authUser());
        }
        $this->success($updated, 'Transaction updated');
    }

    /**
     * @param array<string, mixed>|null $user
     * @param array<string, mixed>      $row
     * @param array<string, mixed>      $body
     */
    private function enforceCashBookScopeForFirmUpdateBody(?array $user, string $type, array $row, array $body): void
    {
        if (!CashBookAccess::isCashBookOnlyUser($user)) {
            return;
        }
        if (!in_array($type, ['firm_expense', 'firm_inflow', 'firm_bank_transfer'], true)) {
            return;
        }
        if ($type === 'firm_bank_transfer') {
            $from = (int)($body['firm_bank_account_id'] ?? $body['from_firm_bank_account_id'] ?? $row['firm_bank_account_id'] ?? 0);
            $to   = (int)($body['counterparty_firm_bank_account_id'] ?? $body['to_firm_bank_account_id'] ?? $row['counterparty_firm_bank_account_id'] ?? 0);
            $err  = CashBookAccess::assertCashTransferPair($from, $to);
        } else {
            $bankId = (int)($body['firm_bank_account_id'] ?? $row['firm_bank_account_id'] ?? 0);
            $err    = CashBookAccess::assertCashAccountId($bankId);
        }
        if ($err !== null) {
            $this->error($err, 403);
        }
    }

    /** @return list<string> */
    private function txnTypesRequiringLedgerModifyOtp(): array
    {
        return [
            'invoice', 'receipt', 'payment_expense', 'payment_client_cost', 'tds_provisional', 'tds_final',
            'receipt_reversal', 'payment_expense_reversal', 'payment_client_cost_reversal', 'tds_reversal',
        ];
    }

    private function txnRequiresLedgerModifyOtp(string $txnType): bool
    {
        return in_array($txnType, $this->txnTypesRequiringLedgerModifyOtp(), true);
    }

    /** @return list<string> */
    private function txnTypesFirmTeamApproval(): array
    {
        return ['firm_expense', 'firm_inflow', 'firm_bank_transfer'];
    }

    /** @return list<string> */
    private function txnTypesRequiringTeamApproval(): array
    {
        return array_values(array_unique(array_merge(
            $this->txnTypesRequiringLedgerModifyOtp(),
            $this->txnTypesFirmTeamApproval()
        )));
    }

    private function txnRequiresTeamApproval(string $txnType): bool
    {
        return in_array($txnType, $this->txnTypesRequiringTeamApproval(), true);
    }

    private function txnRequiresFirmTeamApproval(string $txnType): bool
    {
        return in_array($txnType, $this->txnTypesFirmTeamApproval(), true);
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return list<int>
     */
    private function expandCancelIdsForFirmRow(int $id, array $row): array
    {
        $type = (string)($row['txn_type'] ?? '');
        if ($type === 'firm_bank_transfer') {
            return $this->txn->resolveFirmTransferPairIds($id);
        }

        return [$id];
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $body
     *
     * @return array<string, mixed>
     */
    private function normalizeFirmUpdatePayloadForQueue(array $row, array $body): array
    {
        $type = (string)($row['txn_type'] ?? '');
        if ($type !== 'firm_bank_transfer') {
            return $body;
        }
        $pairIds = $this->txn->resolveFirmTransferPairIds((int)($row['id'] ?? 0));
        $outId   = $pairIds[0] ?? (int)($row['id'] ?? 0);
        $outRow  = $this->txn->find($outId) ?? $row;
        $from    = (int)($body['from_firm_bank_account_id'] ?? $body['firm_bank_account_id'] ?? $outRow['firm_bank_account_id'] ?? 0);
        $to      = (int)($body['to_firm_bank_account_id'] ?? $body['counterparty_firm_bank_account_id'] ?? $outRow['counterparty_firm_bank_account_id'] ?? 0);
        $normalized = $body;
        $normalized['from_firm_bank_account_id'] = $from;
        $normalized['to_firm_bank_account_id']   = $to;
        $normalized['pair_txn_ids']              = $pairIds;

        return $normalized;
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $body
     */
    private function applyFirmSimpleTxnUpdate(int $id, array $row, array $body, ?int $actorId): void
    {
        $type   = (string)($row['txn_type'] ?? '');
        $amount = isset($body['amount']) ? (float)$body['amount'] : (float)($row['amount'] ?? 0);
        if ($amount <= 0) {
            $this->error('amount must be greater than zero.', 422);
        }
        $bankId = (int)($body['firm_bank_account_id'] ?? $row['firm_bank_account_id'] ?? 0);
        if ($bankId <= 0) {
            $this->error('firm_bank_account_id is required.', 422);
        }
        $banks = new FirmBankAccountModel();
        $acc   = $banks->find($bankId);
        if ($acc === null || empty($acc['is_active'])) {
            $this->error('Invalid or inactive bank account.', 422);
        }
        $cat = trim((string)($body['firm_expense_category'] ?? $row['firm_expense_category'] ?? ''));
        if ($cat === '') {
            $this->error('firm_expense_category is required.', 422);
        }
        $patch = [
            'txn_date'               => $body['txn_date'] ?? $row['txn_date'],
            'narration'              => $body['narration'] ?? $row['narration'],
            'amount'                 => $amount,
            'firm_bank_account_id'   => $bankId,
            'firm_expense_category'  => $cat,
            'billing_profile_code'   => (string)$acc['billing_firm_code'],
        ];
        if ($type === 'firm_expense') {
            $patch['debit']  = $amount;
            $patch['credit'] = 0;
        } else {
            $patch['debit']  = 0;
            $patch['credit'] = $amount;
        }
        $this->txn->update($id, $patch, $actorId);
    }

    /**
     * @param array<string, mixed> $body
     */
    private function applyFirmBankTransferPairUpdate(int $id, array $body, ?int $actorId): void
    {
        try {
            $this->txn->updateFirmBankTransferPair($id, $body, $actorId);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }
    }

    /**
     * @param array<string, mixed> $row
     */
    private function ledgerTxnSummaryLine(array $row): string
    {
        $date = trim((string)($row['txn_date'] ?? ''));
        $amt  = round((float)($row['amount'] ?? 0), 2);
        $ref  = trim((string)($row['public_ref'] ?? ''));
        if ($ref === '') {
            $ref = trim((string)($row['invoice_number'] ?? ''));
        }
        $parts = [$date !== '' ? $date : '(no date)', '₹' . number_format($amt, 2, '.', ',')];
        if ($ref !== '') {
            $parts[] = $ref;
        }

        return implode(' · ', $parts);
    }

    private function txnTypeLabelForOtpEmail(string $txnType): string
    {
        return match ($txnType) {
            'invoice' => 'Invoice',
            'receipt' => 'Receipt',
            'payment_expense' => 'On-behalf payment',
            'payment_client_cost' => 'Client cost payment',
            'tds_provisional' => 'TDS (provisional)',
            'tds_final' => 'TDS (final)',
            'receipt_reversal' => 'Receipt reversal',
            'payment_expense_reversal' => 'On-behalf payment reversal',
            'payment_client_cost_reversal' => 'Client cost payment reversal',
            'tds_reversal' => 'TDS reversal',
            default => str_replace('_', ' ', $txnType),
        };
    }

    /** @param list<array<string, mixed>> $dbRows */
    private function allocationRowsFromDbForValidation(array $dbRows): array
    {
        $out = [];
        foreach ($dbRows as $e) {
            $out[] = [
                'target_type'   => (string)($e['target_type'] ?? ''),
                'target_txn_id' => $e['target_txn_id'] !== null ? (int)$e['target_txn_id'] : null,
                'amount'        => round((float)($e['amount'] ?? 0), 2),
            ];
        }

        return $out;
    }

    private function resolvePaidFromLabelForBankId(int $bankId): ?string
    {
        if ($bankId <= 0) {
            return null;
        }
        $acc = (new FirmBankAccountModel())->find($bankId);
        if ($acc === null) {
            return null;
        }
        $name = trim((string)($acc['name'] ?? ''));
        $typ  = trim((string)($acc['account_type'] ?? ''));
        $paidFrom = $name !== '' && $typ !== ''
            ? $name . ' (' . $typ . ')'
            : ($name !== '' ? $name : $typ);

        return $paidFrom !== '' ? $paidFrom : null;
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $body
     *
     * @return array{ledger_class: string, ledger_movement_kind: string}
     */
    private function resolveTxnLedgerDimensions(array $row, array $body, bool $clientCostsFixed = false): array
    {
        if ($clientCostsFixed) {
            $lc = LedgerDimensions::assertClientCostsLedgerClass(
                $row['ledger_class'] ?? LedgerDimensions::CLASS_CLIENT_COSTS
            );
        } else {
            $lc = array_key_exists('ledger_class', $body)
                ? LedgerDimensions::assertLedgerClass($body['ledger_class'])
                : LedgerDimensions::assertLedgerClass($row['ledger_class'] ?? '');
        }
        $mk = array_key_exists('ledger_movement_kind', $body)
            ? LedgerDimensions::assertLedgerMovementKindRequired($body['ledger_movement_kind'])
            : LedgerDimensions::assertLedgerMovementKindRequired($row['ledger_movement_kind'] ?? '');

        return ['ledger_class' => $lc, 'ledger_movement_kind' => $mk];
    }

    private function syncStandardNarrationForMethodChange(
        ?string $narration,
        ?string $previousMethod,
        ?string $newMethod,
        string $prefix
    ): ?string {
        if ($previousMethod === null || $newMethod === null || $previousMethod === $newMethod) {
            return $narration;
        }
        $trimmed = trim((string)($narration ?? ''));
        if ($trimmed === $prefix . $previousMethod) {
            return $prefix . $newMethod;
        }

        return $narration;
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $patch
     */
    private function applyMethodNarrationSync(array $row, array &$patch, string $prefix): void
    {
        if (!array_key_exists('payment_method', $patch)) {
            return;
        }
        $oldMethod = trim((string)($row['payment_method'] ?? ''));
        $newMethod = trim((string)$patch['payment_method']);
        if ($oldMethod === '' || $newMethod === '' || $oldMethod === $newMethod) {
            return;
        }
        $currentNarr = array_key_exists('narration', $patch)
            ? $patch['narration']
            : ($row['narration'] ?? null);
        $synced = $this->syncStandardNarrationForMethodChange($currentNarr, $oldMethod, $newMethod, $prefix);
        if ($synced !== $currentNarr) {
            $patch['narration'] = $synced;
        }
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $body
     */
    private function applyReceiptTxnUpdate(int $id, array $row, array $body, ?int $actorId): void
    {
        foreach (['client_id', 'organization_id'] as $field) {
            if (!array_key_exists($field, $body)) {
                continue;
            }
            $incoming = $body[$field];
            $existing = $row[$field] ?? null;
            if ((string)$incoming !== (string)$existing) {
                $this->error('Cannot change ' . $field . ' on this receipt via edit.', 422);
            }
        }

        $metaKeys = [
            'txn_date', 'narration', 'notes', 'payment_method', 'reference_number',
            'firm_bank_account_id', 'billing_profile_code',
        ];
        $structural = array_key_exists('amount', $body)
            || array_key_exists('allocations', $body)
            || array_key_exists('ledger_class', $body)
            || array_key_exists('ledger_movement_kind', $body);

        $ledgerDims = $this->resolveTxnLedgerDimensions($row, $body);

        $resolveBankId = function (array $metaPatch) use ($row, $id, $body): int {
            $profileCode = trim((string)(
                $metaPatch['billing_profile_code']
                ?? $body['billing_profile_code']
                ?? $row['billing_profile_code']
                ?? ''
            ));
            if (!empty($metaPatch['firm_bank_account_id'])) {
                $tmpBody = array_merge(
                    $metaPatch,
                    ['billing_profile_code' => $profileCode]
                );
                $this->attachValidatedBankAccount($tmpBody);

                return (int) $tmpBody['firm_bank_account_id'];
            }

            return $this->txn->findReceiptBankLegAccountId($id);
        };

        if ($structural) {
            $allocModel = new TxnSettlementAllocationModel();
            $allocRaw   = $body['allocations'] ?? null;
            if ($allocRaw === null) {
                $allocRaw = $this->allocationRowsFromDbForValidation($allocModel->listForReceipt($id));
            }
            $amount = array_key_exists('amount', $body)
                ? round((float) $body['amount'], 2)
                : round((float)($row['amount'] ?? 0), 2);
            if ($amount <= 0) {
                $this->error('amount must be greater than zero.', 422);
            }

            $receiptBody = [
                'client_id'             => (int)($row['client_id'] ?? 0),
                'organization_id'       => (int)($row['organization_id'] ?? 0),
                'amount'                => $amount,
                'ledger_class'          => $ledgerDims['ledger_class'],
                'ledger_movement_kind'  => $ledgerDims['ledger_movement_kind'],
            ];
            try {
                $allocRows = TxnReceiptAllocationService::normalizeAndValidateAllocations($receiptBody, $allocRaw);
            } catch (\InvalidArgumentException $e) {
                $this->error($e->getMessage(), 422);
            }

            $metaPatch = array_intersect_key($body, array_flip($metaKeys));
            $this->applyMethodNarrationSync($row, $metaPatch, 'Receipt — ');
            $bankId    = $resolveBankId($metaPatch);
            unset($metaPatch['firm_bank_account_id']);

            $creditPatch = [
                'credit' => $amount,
                'amount' => $amount,
                'debit'  => 0,
            ];
            $this->txn->update($id, array_merge($creditPatch, $metaPatch, $ledgerDims), $actorId);
            TxnReceiptAllocationService::replaceReceiptAllocationsWithInvoiceRefresh($id, $allocRows);
            if ($bankId > 0) {
                $fresh = $this->txn->find($id);
                $this->txn->syncReceiptBankLeg($id, is_array($fresh) ? $fresh : $row, $amount, $bankId);
            }

            return;
        }

        $patch = array_intersect_key($body, array_flip($metaKeys));
        $patch = array_merge($patch, $ledgerDims);
        $this->applyMethodNarrationSync($row, $patch, 'Receipt — ');
        if ($patch === []) {
            return;
        }
        $bankId = $resolveBankId($patch);
        unset($patch['firm_bank_account_id']);
        if ($patch !== []) {
            $this->txn->update($id, $patch, $actorId);
        }
        if ($bankId > 0) {
            $fresh = $this->txn->find($id);
            $amt   = round((float)(is_array($fresh) ? ($fresh['amount'] ?? 0) : ($row['amount'] ?? 0)), 2);
            $this->txn->syncReceiptBankLeg($id, is_array($fresh) ? $fresh : $row, $amt, $bankId);
        }
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $body
     */
    private function applyPaymentExpenseTxnUpdate(int $id, array $row, array $body, ?int $actorId): void
    {
        foreach (['client_id', 'organization_id'] as $field) {
            if (!array_key_exists($field, $body)) {
                continue;
            }
            if ((string)$body[$field] !== (string)($row[$field] ?? '')) {
                $this->error('Cannot change ' . $field . ' on this payment via edit.', 422);
            }
        }

        $metaKeys = [
            'txn_date', 'narration', 'notes', 'payment_method', 'reference_number',
            'expense_purpose', 'firm_bank_account_id',
        ];
        $structural = array_key_exists('amount', $body)
            || array_key_exists('settlement_lines', $body)
            || array_key_exists('ledger_class', $body)
            || array_key_exists('ledger_movement_kind', $body);

        $ledgerDims = $this->resolveTxnLedgerDimensions($row, $body);

        $resolveBankId = function (array $metaSlice) use ($row, $id): int {
            if (!empty($metaSlice['firm_bank_account_id'])) {
                $tmpBody = array_merge(
                    $metaSlice,
                    ['billing_profile_code' => (string)($row['billing_profile_code'] ?? '')]
                );
                $this->attachValidatedBankAccount($tmpBody);

                return (int) $tmpBody['firm_bank_account_id'];
            }

            return $this->txn->findPaymentExpenseBankLegAccountId($id);
        };

        if (!$structural) {
            $patch = array_intersect_key($body, array_flip($metaKeys));
            $patch = array_merge($patch, $ledgerDims);
            $this->applyMethodNarrationSync($row, $patch, 'Payment — ');
            if ($patch === []) {
                return;
            }
            $bankId = $resolveBankId($patch);
            unset($patch['firm_bank_account_id']);
            if ($bankId > 0) {
                $patch['paid_from'] = $this->resolvePaidFromLabelForBankId($bankId);
            }
            if ($patch !== []) {
                $this->txn->update($id, $patch, $actorId);
            }
            if ($bankId > 0) {
                $fresh = $this->txn->find($id);
                $amt   = round((float)(is_array($fresh) ? ($fresh['amount'] ?? 0) : ($row['amount'] ?? 0)), 2);
                $this->txn->syncPaymentExpenseBankLeg($id, is_array($fresh) ? $fresh : $row, $amt, $bankId);
            }

            return;
        }

        $linesRaw = $body['settlement_lines'] ?? null;
        if (!is_array($linesRaw) || $linesRaw === []) {
            $this->error('settlement_lines is required when changing amount or settlement for this payment.', 422);
        }

        $newAmount = array_key_exists('amount', $body)
            ? round((float)$body['amount'], 2)
            : round((float)($row['amount'] ?? 0), 2);
        if ($newAmount <= 0) {
            $this->error('amount must be greater than zero.', 422);
        }

        $pcid = (int)($row['client_id'] ?? 0);
        $poid = (int)($row['organization_id'] ?? 0);

        $patch = array_intersect_key($body, array_flip($metaKeys));
        $patch = array_merge($patch, $ledgerDims);
        $this->applyMethodNarrationSync($row, $patch, 'Payment — ');
        $patch['amount'] = $newAmount;
        $patch['debit']  = $newAmount;
        $patch['credit'] = 0;
        $bankId          = $resolveBankId($patch);
        unset($patch['firm_bank_account_id']);
        if ($bankId > 0) {
            $patch['paid_from'] = $this->resolvePaidFromLabelForBankId($bankId);
        }

        $dbConn = Database::getConnection();
        $dbConn->beginTransaction();
        try {
            TxnReceiptAllocationService::unlinkPaymentExpenseFromReceipts($id);
            $this->txn->update($id, $patch, $actorId);
            $paymentRow = $this->txn->find($id);
            if ($paymentRow === null) {
                throw new \InvalidArgumentException('Payment expense not found after update.');
            }
            try {
                $parsed = TxnReceiptAllocationService::normalizePaymentExpenseSettlementLines(
                    $newAmount,
                    $linesRaw,
                    $pcid,
                    $poid,
                    (string)($paymentRow['ledger_class'] ?? ''),
                    (string)($paymentRow['ledger_movement_kind'] ?? ''),
                    $this->txn
                );
            } catch (\InvalidArgumentException $e) {
                $dbConn->rollBack();
                $this->error($e->getMessage(), 422);
            }
            foreach ($parsed['receipt_totals'] as $rid => $amt) {
                $receiptRow = $this->txn->find((int)$rid);
                if ($receiptRow === null) {
                    throw new \InvalidArgumentException('Receipt not found.');
                }
                TxnReceiptAllocationService::linkPaymentExpenseToReceipt($receiptRow, $paymentRow, $amt);
            }
            $dbConn->commit();
            if ($bankId > 0) {
                $fresh = $this->txn->find($id);
                $this->txn->syncPaymentExpenseBankLeg(
                    $id,
                    is_array($fresh) ? $fresh : $paymentRow,
                    $newAmount,
                    $bankId
                );
            }
        } catch (\InvalidArgumentException $e) {
            if ($dbConn->inTransaction()) {
                $dbConn->rollBack();
            }
            $this->error($e->getMessage(), 422);
        } catch (\Throwable $e) {
            if ($dbConn->inTransaction()) {
                $dbConn->rollBack();
            }
            throw $e;
        }
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $body
     */
    private function applyTdsTxnUpdate(int $id, array $row, array $body, ?int $actorId): void
    {
        foreach (['client_id', 'organization_id', 'ledger_class', 'ledger_movement_kind', 'tds_status'] as $field) {
            if (!array_key_exists($field, $body)) {
                continue;
            }
            if ((string)$body[$field] !== (string)($row[$field] ?? '')) {
                $this->error('Cannot change ' . $field . ' on this TDS entry via edit.', 422);
            }
        }

        $metaKeys = ['txn_date', 'narration', 'notes', 'tds_section', 'tds_rate'];
        $patch    = array_intersect_key($body, array_flip($metaKeys));
        if (array_key_exists('amount', $body)) {
            $a = round((float)$body['amount'], 2);
            if ($a <= 0) {
                $this->error('amount must be greater than zero.', 422);
            }
            $patch['amount'] = $a;
            $patch['credit'] = $a;
            $patch['debit']  = 0;
        }
        if ($patch === []) {
            return;
        }
        $this->txn->update($id, $patch, $actorId);
    }

    // ── DELETE /api/admin/txn/:id ────────────────────────────────────────────

    /**
     * Ledger rows that require superadmin OTP + invoices.delete (same as invoice delete).
     *
     * @return list<string>
     */
    private function txnTypesRequiringSuperadminDelete(): array
    {
        return [
            'invoice',
            'receipt',
            'payment_expense',
            'payment_client_cost',
            'tds_provisional',
            'tds_final',
            'rebate',
            'credit_note',
        ];
    }

    private function txnRequiresSuperadminDelete(string $txnType): bool
    {
        return in_array($txnType, $this->txnTypesRequiringSuperadminDelete(), true);
    }

    /** Lower sorts earlier (delete first). Receipts/payments before credit notes; credit notes before invoices. */
    private function txnDeleteSortPriority(string $txnType): int
    {
        return match ($txnType) {
            'receipt', 'payment_expense', 'payment_client_cost', 'tds_provisional', 'tds_final', 'rebate' => 10,
            'credit_note' => 20,
            'invoice' => 30,
            default => 0,
        };
    }

    /**
     * Delete one txn row with commission / notification side effects (caller verified OTP when required).
     *
     * @param array<string, mixed> $row
     */
    private function performTxnDelete(array $row, ?int $actorId): void
    {
        $id   = (int)($row['id'] ?? 0);
        $type = (string)($row['txn_type'] ?? '');
        $beforeSnap = $this->txnAuditCompactSnapshot($row);
        if ($type === 'credit_note') {
            $linked = (int)($row['linked_txn_id'] ?? 0);
            $this->txn->softCancelForAudit($id, $actorId);
            if ($linked > 0) {
                (new CommissionSyncService())->afterCreditNote($linked);
            }
            $after = $this->txn->find($id);
            $this->auditTxnLog(
                $actorId,
                'txn.cancelled',
                $id,
                ['txn_type' => $type],
                $beforeSnap,
                $after !== null ? $this->txnAuditCompactSnapshot($after) : null
            );

            return;
        }
        if ($type === 'invoice') {
            (new CommissionSyncService())->onInvoiceDeleted($id);
            $this->txn->softCancelForAudit($id, $actorId);
            $after = $this->txn->find($id);
            $this->auditTxnLog(
                $actorId,
                'txn.cancelled',
                $id,
                ['txn_type' => $type],
                $beforeSnap,
                $after !== null ? $this->txnAuditCompactSnapshot($after) : null
            );
            $this->notifyAdminsInvoiceChange('cancelled', $row, $after, $this->authUser());

            return;
        }
        if ($type === 'receipt') {
            $alloc = new TxnSettlementAllocationModel();
            $targets = $alloc->distinctTargetsForReceipt($id);
            $alloc->replaceForReceipt($id, []);
            $this->txn->softCancelCashMirrorsForClientLeg($id, $actorId);
            $this->txn->softCancelForAudit($id, $actorId);
            TxnReceiptAllocationService::afterReceiptDeleted($targets['invoices']);
            $after = $this->txn->find($id);
            $this->auditTxnLog(
                $actorId,
                'txn.cancelled',
                $id,
                ['txn_type' => $type],
                $beforeSnap,
                $after !== null ? $this->txnAuditCompactSnapshot($after) : null
            );

            return;
        }
        if ($type === 'payment_expense') {
            TxnReceiptAllocationService::unlinkPaymentExpenseFromReceipts($id);
            $this->txn->softCancelCashMirrorsForClientLeg($id, $actorId);
            $this->txn->softCancelForAudit($id, $actorId);
            $after = $this->txn->find($id);
            $this->auditTxnLog(
                $actorId,
                'txn.cancelled',
                $id,
                ['txn_type' => $type],
                $beforeSnap,
                $after !== null ? $this->txnAuditCompactSnapshot($after) : null
            );

            return;
        }
        if ($type === 'payment_client_cost') {
            $this->txn->softCancelCashMirrorsForClientLeg($id, $actorId);
            $this->txn->softCancelForAudit($id, $actorId);
            $after = $this->txn->find($id);
            $this->auditTxnLog(
                $actorId,
                'txn.cancelled',
                $id,
                ['txn_type' => $type],
                $beforeSnap,
                $after !== null ? $this->txnAuditCompactSnapshot($after) : null
            );

            return;
        }
        $this->txn->softCancelForAudit($id, $actorId);
        $after = $this->txn->find($id);
        $this->auditTxnLog(
            $actorId,
            'txn.cancelled',
            $id,
            ['txn_type' => $type],
            $beforeSnap,
            $after !== null ? $this->txnAuditCompactSnapshot($after) : null
        );
    }

    public function destroy(int $id): never
    {
        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }

        $type = (string)($row['txn_type'] ?? '');
        if (in_array((string)($row['status'] ?? ''), ['cancelled', 'deleted'], true)) {
            $this->error('Transaction is already cancelled.', 422);
        }
        if ((string)($row['status'] ?? '') === 'reversed') {
            $this->error(
                'Cannot cancel a reversed posting until its ledger reversal is cancelled.',
                422
            );
        }
        $actingUser = $this->authUser();
        $scopeErr = CashBookAccess::enforceCashBookScopeForTxn($actingUser, $row, 'delete');
        if ($scopeErr !== null) {
            $this->error($scopeErr, 403);
        }
        $cashMirrorOnly = [
            TxnModel::TXN_TYPE_RECEIPT_BANK_LEG,
            TxnModel::TXN_TYPE_PAYMENT_EXPENSE_BANK_LEG,
            TxnModel::TXN_TYPE_PAYMENT_CLIENT_COST_BANK_LEG,
            TxnModel::TXN_TYPE_RECEIPT_BANK_LEG_REVERSAL,
            TxnModel::TXN_TYPE_PAYMENT_EXPENSE_BANK_LEG_REVERSAL,
            TxnModel::TXN_TYPE_PAYMENT_CLIENT_COST_BANK_LEG_REVERSAL,
        ];
        if (in_array($type, $cashMirrorOnly, true)) {
            $this->error(
                'This transaction is a linked firm cash-book row. Delete or reverse the client receipt or on-behalf payment instead.',
                422
            );
        }

        if (in_array($type, ['receipt_reversal', 'payment_expense_reversal', 'payment_client_cost_reversal', 'tds_reversal'], true)) {
            $this->error(
                'Ledger reversal rows cannot be deleted. Use cancel reversal on the original posting instead.',
                422
            );
        }

        $body          = $this->getJsonBody();
        $requestReason = trim((string)($body['request_reason'] ?? ''));

        if ($this->txnRequiresSuperadminDelete($type)) {
            if (!$this->userHasPermission($this->authUser(), 'invoices.delete')) {
                $this->error('Access denied. Required permission: invoices.delete.', 403);
            }
            $acting = $this->authUser();
            if (!$this->isSuperAdminActor($acting)) {
                $intercept = LedgerTxnChangeService::queueCancel([$id], $requestReason !== '' ? $requestReason : null, $acting);
                if ($intercept !== null) {
                    $this->respondLedgerChangeQueued($intercept, $row, $acting);
                }
            }
            $delActor = $acting ? (int)$acting['id'] : null;
            $this->performTxnDelete($row, $delActor);
            $this->success(null, 'Transaction cancelled.');
        }

        if ($this->txnRequiresFirmTeamApproval($type)) {
            if (!CashBookAccess::canEdit($this->authUser())) {
                $this->error('Access denied. Required permission: invoices.edit or cash_book.edit.', 403);
            }
            $acting    = $this->authUser();
            $cancelIds = $this->expandCancelIdsForFirmRow($id, $row);
            if (!$this->isSuperAdminActor($acting)) {
                $intercept = LedgerTxnChangeService::queueCancel($cancelIds, $requestReason !== '' ? $requestReason : null, $acting);
                if ($intercept !== null) {
                    $this->respondLedgerChangeQueued($intercept, $row, $acting);
                }
            }
            $delActor = $acting ? (int)$acting['id'] : null;
            foreach ($cancelIds as $cid) {
                $r = $this->txn->find($cid);
                if ($r !== null && !in_array((string)($r['status'] ?? ''), ['cancelled', 'deleted'], true)) {
                    $this->performTxnDelete($r, $delActor);
                }
            }
            $this->success(null, 'Transaction cancelled.');
        }

        if (!$this->userHasPermission($this->authUser(), 'invoices.edit')) {
            $this->error('Access denied. Required permission: invoices.edit.', 403);
        }

        $actorDel = $this->authUser() ? (int)$this->authUser()['id'] : null;
        $this->performTxnDelete($row, $actorDel);
        $this->success(null, 'Transaction cancelled.');
    }

    /**
     * POST /api/admin/txn/request-ledger-delete-otp
     * Body: { "ids": [1,2,3] } — superadmin receives one OTP email for a subsequent bulk or single delete.
     */
    public function requestLedgerDeleteOtp(): never
    {
        $acting = $this->authUser();
        if (!$this->userHasPermission($acting, 'invoices.delete')) {
            $this->error('Access denied. Required permission: invoices.delete.', 403);
        }

        $body   = $this->getJsonBody();
        $idsRaw = $body['ids'] ?? null;
        if (!is_array($idsRaw) || $idsRaw === []) {
            $this->error('ids must be a non-empty array.', 422);
        }

        $ids = [];
        foreach ($idsRaw as $v) {
            $n = (int)$v;
            if ($n > 0) {
                $ids[$n] = $n;
            }
        }
        if ($ids === []) {
            $this->error('No valid transaction ids.', 422);
        }
        if (count($ids) > 200) {
            $this->error('Too many transactions (max 200 per request).', 422);
        }

        $counts = [];
        foreach ($ids as $id) {
            $row = $this->txn->find($id);
            if ($row === null) {
                $this->error('Transaction not found: ' . $id, 404);
            }
            if (in_array((string)($row['status'] ?? ''), ['cancelled', 'deleted'], true)) {
                $this->error('Transaction already cancelled: ' . $id, 422);
            }
            if ((string)($row['status'] ?? '') === 'reversed') {
                $this->error(
                    'Cannot cancel reversed posting id ' . $id . ' until its ledger reversal is cancelled.',
                    422
                );
            }
            $tt = (string)($row['txn_type'] ?? '');
            if (!$this->txnRequiresSuperadminDelete($tt)) {
                $this->error('OTP delete is not used for transaction type: ' . $tt, 422);
            }
            $counts[$tt] = ($counts[$tt] ?? 0) + 1;
        }

        $super = $this->users->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
        if ($super === null || !$super['is_active']) {
            $this->error('Super admin account is not provisioned.', 500);
        }
        $superId = (int)$super['id'];
        $email   = trim((string)($super['email'] ?? ''));
        if ($email === '') {
            $this->error('Super admin has no email.', 500);
        }

        $otp = OtpService::generate($superId);
        $summaryParts = [];
        foreach ($counts as $t => $c) {
            $summaryParts[] = $c . ' × ' . str_replace('_', ' ', $t);
        }
        $summaryText = implode(', ', $summaryParts);
        $idList      = implode(', ', array_keys($ids));

        try {
            $htmlBody = BrevoMailer::renderTemplate('ledger-delete-otp', [
                'userName'      => (string)($super['name'] ?? $email),
                'otpCode'       => $otp,
                'expiryMinutes' => (string)OtpService::expiryMinutes(),
                'count'         => (string)count($ids),
                'summaryText'   => $summaryText,
                'idList'        => $idList,
            ]);
            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $email,
                    (string)($super['name'] ?? $email),
                    'Ledger delete OTP - CA Rahul Gupta',
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[TxnController] Ledger delete OTP email failed: ' . $e->getMessage());
        }

        $this->success([
            'otp_sent'     => true,
            'masked_email' => $this->maskEmail($email),
            'count'        => count($ids),
        ], 'OTP sent.');
    }

    /**
     * POST /api/admin/txn/:id/request-ledger-reversal-otp
     * Sends a 6-digit OTP to the acting user’s email to confirm a ledger reversal (feature-flagged).
     */
    public function requestLedgerReversalOtp(int $id): never
    {
        $app = new App();
        if (!$app->ledgerUserReversalEnabled) {
            $this->error('User-initiated ledger reversal is not enabled.', 403);
        }

        $acting = $this->authUser();
        if (!$this->userHasPermission($acting, 'invoices.delete')) {
            $this->error('Access denied. Required permission: invoices.delete.', 403);
        }

        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }

        $this->assertTxnReversibleForUserFlow($row, true);

        $userId = (int)(($acting ?? [])['id'] ?? 0);
        $email  = trim((string)(($acting ?? [])['email'] ?? ''));
        if ($userId <= 0 || $email === '') {
            $this->error('Your user account must have an email address to receive the OTP.', 422);
        }

        $otp = OtpService::generate($userId);
        $txnType   = (string)($row['txn_type'] ?? '');
        $typeLabel = $this->txnTypeLabelForOtpEmail($txnType);
        $txnSummary = $this->ledgerTxnSummaryLine($row);

        try {
            $htmlBody = BrevoMailer::renderTemplate('ledger-reversal-user-otp', [
                'userName'      => (string)(($acting ?? [])['name'] ?? $email),
                'otpCode'       => $otp,
                'expiryMinutes' => (string)OtpService::expiryMinutes(),
                'txnId'         => (string)$id,
                'txnTypeLabel'  => $typeLabel,
                'txnSummary'    => $txnSummary,
            ]);
            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $email,
                    (string)(($acting ?? [])['name'] ?? $email),
                    'Ledger reversal OTP - CA Rahul Gupta',
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[TxnController] Ledger reversal user OTP email failed: ' . $e->getMessage());
        }

        try {
            (new AdminAuditLogModel())->insert(
                $acting ? (int)$acting['id'] : null,
                'ledger_reversal_otp_requested',
                'txn',
                $id,
                [
                    'txn_type' => $txnType,
                ]
            );
        } catch (\Throwable $e) {
            error_log('[TxnController] ledger_reversal_otp_requested audit log failed: ' . $e->getMessage());
        }

        $this->success([
            'otp_sent'     => true,
            'masked_email' => $this->maskEmail($email),
        ], 'OTP sent.');
    }

    /**
     * POST /api/admin/txn/:id/reverse
     * Body: { "reason": "...", "otp": "123456" } — user OTP when not using X-Superadmin-Otp
     * or session (primary super admin email only, no OTP).
     */
    public function reverseLedger(int $id): never
    {
        $acting = $this->authUser();
        if (!$this->userHasPermission($acting, 'invoices.delete')) {
            $this->error('Access denied. Required permission: invoices.delete.', 403);
        }

        $body   = $this->getJsonBody();
        $reason = trim((string)($body['reason'] ?? ''));
        if (strlen($reason) < 10) {
            $this->error('reason must be at least 10 characters.', 422);
        }
        if (strlen($reason) > 4000) {
            $this->error('reason must be at most 4000 characters.', 422);
        }

        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }

        $mode = 'approval_pending';

        if ($this->isSuperAdminActor($acting)) {
            $mode = 'super_admin_session';
            $this->assertTxnReversibleForUserFlow($row, false);
        } else {
            $app     = new App();
            $userOtp = trim((string)($body['otp'] ?? ''));
            $actorId = (int)(($acting ?? [])['id'] ?? 0);
            if ($app->ledgerUserReversalEnabled && $userOtp !== '' && $actorId > 0 && OtpService::verify($actorId, $userOtp)) {
                $mode = 'user_otp';
                $this->assertTxnReversibleForUserFlow($row, true);
            } else {
                $intercept = LedgerTxnChangeService::queueReverse($id, $reason, $acting);
                if ($intercept !== null) {
                    $this->respondLedgerChangeQueued($intercept, $row);
                }
                $this->error('Could not submit reversal for approval.', 500);
            }
        }

        $beforeOrig = $this->txnAuditCompactSnapshot($row);
        $actorRowId = $acting ? (int)$acting['id'] : null;

        try {
            $result = $this->txn->reverseLedgerEntry($id, $reason, $actorRowId);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        $newId = (int)$result['new_id'];
        foreach ($result['affected_invoice_ids'] as $iid) {
            (new CommissionSyncService())->syncInvoiceSafe((int)$iid);
        }

        $origAfter = $this->txn->find($id);
        $revRow    = $this->txn->find($newId);
        $afterPayload = [
            'original' => $origAfter !== null ? $this->txnAuditCompactSnapshot($origAfter) : null,
            'reversal' => $revRow !== null ? $this->txnAuditCompactSnapshot($revRow) : null,
        ];
        $this->auditTxnLog(
            $actorRowId,
            'txn.reversed',
            $id,
            [
                'reversal_reason' => $reason,
                'mode'            => $mode,
                'reversal_txn_id' => $newId,
                'txn_type'        => (string)($row['txn_type'] ?? ''),
            ],
            $beforeOrig,
            $afterPayload
        );

        if ($revRow !== null) {
            $this->recordTxnCreated($newId, $actorRowId);
        }

        $this->success(
            [
                'reversal_txn_id' => $newId,
                'original_txn_id' => $id,
                'original'        => $origAfter,
                'reversal'        => $revRow,
            ],
            'Transaction reversed.'
        );
    }

    /**
     * POST /api/admin/txn/:id/assign-parked
     * Body: target_client_id|target_organization_id, target_ledger_class, target_ledger_movement_kind, notes?
     */
    public function assignParked(int $id): never
    {
        $acting = $this->authUser();
        if (!$this->userHasPermission($acting, 'invoices.edit')) {
            $this->error('Access denied. Required permission: invoices.edit.', 403);
        }

        $body = $this->getJsonBody();
        $actorRowId = $acting ? (int)$acting['id'] : null;

        $beforeParked = $this->txn->find($id);
        if ($beforeParked === null) {
            $this->error('Transaction not found.', 404);
        }
        $beforeSnap = $this->txnAuditCompactSnapshot($beforeParked);

        try {
            $result = $this->txn->assignParkedEntry($id, $body, $actorRowId);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        $afterParked = $this->txn->find($id);
        $this->auditTxnLog(
            $actorRowId,
            'txn.updated',
            $id,
            [
                'txn_type'    => (string)($beforeParked['txn_type'] ?? ''),
                'via'         => 'parked_assign',
                'reversal_id' => (int)$result['reversal_id'],
                'target_id'   => (int)$result['target_id'],
            ],
            $beforeSnap,
            $afterParked !== null ? $this->txnAuditCompactSnapshot($afterParked) : null
        );
        $this->recordTxnCreated((int)$result['reversal_id'], $actorRowId);
        $this->recordTxnCreated((int)$result['target_id'], $actorRowId);

        $original = $afterParked;
        if ($original !== null) {
            $this->txn->attachParkedTransferMeta($original);
        }
        $target = $this->txn->find((int)$result['target_id']);
        if ($target !== null) {
            $this->txn->attachParkedTransferMeta($target);
        }
        $reversal = $this->txn->find((int)$result['reversal_id']);

        $this->success([
            'original_id' => $result['original_id'],
            'reversal_id' => $result['reversal_id'],
            'target_id'   => $result['target_id'],
            'original'    => $original,
            'reversal'    => $reversal,
            'target'      => $target,
        ], 'Parked entry assigned to client.');
    }

    /**
     * POST /api/admin/txn/:id/cancel-reversal
     * Restores the original txn to active and cancels the compensating reversal row (same auth modes as reverse).
     */
    public function cancelLedgerReversal(int $id): never
    {
        $acting = $this->authUser();
        if (!$this->userHasPermission($acting, 'invoices.delete')) {
            $this->error('Access denied. Required permission: invoices.delete.', 403);
        }

        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }

        $body = $this->getJsonBody();
        $mode = 'approval_pending';

        if ($this->isSuperAdminActor($acting)) {
            $mode = 'super_admin_session';
            $this->assertTxnCancelReversalForUserFlow($row, false);
        } else {
            $app     = new App();
            $userOtp = trim((string)($body['otp'] ?? ''));
            $actorId = (int)(($acting ?? [])['id'] ?? 0);
            if ($app->ledgerUserReversalEnabled && $userOtp !== '' && $actorId > 0 && OtpService::verify($actorId, $userOtp)) {
                $mode = 'user_otp';
                $this->assertTxnCancelReversalForUserFlow($row, true);
            } else {
                $requestReason = trim((string)($body['request_reason'] ?? ''));
                $intercept = LedgerTxnChangeService::queueCancelReversal(
                    $id,
                    $requestReason !== '' ? $requestReason : null,
                    $acting
                );
                if ($intercept !== null) {
                    $this->respondLedgerChangeQueued($intercept, $row);
                }
                $this->error('Could not submit cancel reversal for approval.', 500);
            }
        }

        $beforeOrig = $this->txnAuditCompactSnapshot($row);
        $actorRowId = $acting ? (int)$acting['id'] : null;

        try {
            $result = $this->txn->cancelLedgerReversalForOriginal($id, $actorRowId);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        $origAfter     = $this->txn->find($id);
        $orphanRepair  = !empty($result['orphan_repair']);
        $reversalTxnId = $result['reversal_txn_id'] ?? null;
        $revAfter      = $reversalTxnId !== null ? $this->txn->find((int) $reversalTxnId) : null;
        $afterPayload  = [
            'original' => $origAfter !== null ? $this->txnAuditCompactSnapshot($origAfter) : null,
            'reversal' => $revAfter !== null ? $this->txnAuditCompactSnapshot($revAfter) : null,
        ];
        $auditMeta = [
            'mode'            => $mode,
            'reversal_txn_id' => $reversalTxnId,
            'txn_type'        => (string) ($row['txn_type'] ?? ''),
        ];
        if ($orphanRepair) {
            $auditMeta['orphan_repair'] = true;
        }
        $this->auditTxnLog(
            $actorRowId,
            'txn.reversal_cancelled',
            $id,
            $auditMeta,
            $beforeOrig,
            $afterPayload
        );

        $this->success(
            [
                'original_txn_id' => $id,
                'reversal_txn_id' => $reversalTxnId,
                'orphan_repair'   => $orphanRepair,
                'original'        => $origAfter,
                'reversal'        => $revAfter,
            ],
            $orphanRepair ? 'Reversed posting restored to active.' : 'Ledger reversal cancelled.'
        );
    }

    /**
     * POST /api/admin/txn/:id/reinstate
     * Restores a cancelled ledger posting to active (staff queue for Super Admin approval).
     */
    public function reinstate(int $id): never
    {
        $acting = $this->authUser();
        if (!$this->userHasPermission($acting, 'invoices.delete')) {
            $this->error('Access denied. Required permission: invoices.delete.', 403);
        }

        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }

        $this->assertTxnReinstateAllowed($row);

        $body = $this->getJsonBody();
        if (!$this->isSuperAdminActor($acting)) {
            $requestReason = trim((string)($body['request_reason'] ?? ''));
            $intercept = LedgerTxnChangeService::queueReinstate(
                $id,
                $requestReason !== '' ? $requestReason : null,
                $acting
            );
            if ($intercept !== null) {
                $this->respondLedgerChangeQueued($intercept, $row, $acting);
            }
            $this->error('Could not submit reinstate for approval.', 500);
        }

        $beforeSnap = $this->txnAuditCompactSnapshot($row);
        $actorRowId = $acting ? (int)$acting['id'] : null;
        $this->performTxnReinstate($row, $actorRowId);
        $after = $this->txn->find($id);
        $this->auditTxnLog(
            $actorRowId,
            'txn.reinstated',
            $id,
            ['txn_type' => (string)($row['txn_type'] ?? '')],
            $beforeSnap,
            $after !== null ? $this->txnAuditCompactSnapshot($after) : null
        );
        $this->success($after, 'Transaction reinstated.');
    }

    /**
     * @param array<string, mixed> $row
     */
    private function assertTxnReinstateAllowed(array $row): void
    {
        if ((string)($row['status'] ?? '') !== 'cancelled') {
            $this->error('Only cancelled transactions can be reinstated.', 422);
        }
        $type = (string)($row['txn_type'] ?? '');
        if (!$this->txnRequiresSuperadminDelete($type) && !$this->txnRequiresFirmTeamApproval($type)) {
            $this->error('This transaction type cannot be reinstated.', 422);
        }
    }

    /**
     * @param array<string, mixed> $row
     */
    private function performTxnReinstate(array $row, ?int $actorId): void
    {
        $id   = (int)($row['id'] ?? 0);
        $type = (string)($row['txn_type'] ?? '');
        if ((string)($row['status'] ?? '') !== 'cancelled') {
            throw new \InvalidArgumentException('Only cancelled transactions can be reinstated.');
        }

        if ($type === 'receipt') {
            $amount = round((float)($row['amount'] ?? 0), 2);
            $patch  = ['status' => 'active'];
            $pref   = trim((string)($row['public_ref'] ?? ''));
            if ($pref === '') {
                $patch['public_ref'] = \App\Libraries\TxnPublicRefGenerator::next(
                    Database::getConnection(),
                    'RCP',
                    isset($row['txn_date']) ? (string)$row['txn_date'] : null
                );
            }
            $this->txn->update($id, $patch, $actorId);
            $this->txn->restoreCashMirrorsForClientLeg($id, $actorId);
            if ($amount > 0) {
                TxnReceiptAllocationService::replaceReceiptAllocationsWithInvoiceRefresh($id, [[
                    'target_type'    => 'unallocated_advance',
                    'target_txn_id'  => null,
                    'amount'         => $amount,
                ]]);
            }
            $bankId = $this->txn->findReceiptBankLegAccountId($id);
            if ($bankId > 0) {
                $fresh = $this->txn->find($id);
                if ($fresh !== null) {
                    $this->txn->syncReceiptBankLeg($id, $fresh, $amount, $bankId);
                }
            }

            return;
        }

        if ($type === 'payment_expense' || $type === 'payment_client_cost') {
            $patch = ['status' => 'active'];
            $pref  = trim((string)($row['public_ref'] ?? ''));
            if ($pref === '') {
                $patch['public_ref'] = \App\Libraries\TxnPublicRefGenerator::next(
                    Database::getConnection(),
                    'PAY',
                    isset($row['txn_date']) ? (string)$row['txn_date'] : null
                );
            }
            $this->txn->update($id, $patch, $actorId);
            $this->txn->restoreCashMirrorsForClientLeg($id, $actorId);

            return;
        }

        if ($type === 'invoice') {
            $this->txn->update($id, [
                'status'         => 'active',
                'invoice_status' => 'sent',
            ], $actorId);
            (new CommissionSyncService())->syncInvoiceSafe($id);
            $this->notifyAdminsInvoiceChange('updated', $row, $this->txn->find($id), $this->authUser());

            return;
        }

        if ($type === 'credit_note') {
            $linked = (int)($row['linked_txn_id'] ?? 0);
            $this->txn->update($id, ['status' => 'active'], $actorId);
            if ($linked > 0) {
                (new CommissionSyncService())->afterCreditNote($linked);
            }

            return;
        }

        $this->txn->update($id, ['status' => 'active'], $actorId);
    }

    /**
     * @param array<string, mixed> $row
     */
    private function assertTxnCancelReversalForUserFlow(array $row, bool $enforceCreatedAtWindow): void
    {
        $txnType = (string)($row['txn_type'] ?? '');
        $allowed = ['receipt', 'payment_expense', 'payment_client_cost', 'tds_provisional', 'tds_final'];
        if (!in_array($txnType, $allowed, true)) {
            $this->error('This transaction type cannot cancel a ledger reversal through this flow.', 422);
        }
        if ((string)($row['status'] ?? '') !== 'reversed') {
            $this->error('Only reversed transactions can cancel their ledger reversal.', 422);
        }
        if ($enforceCreatedAtWindow) {
            $this->assertUserReversalWithinCreatedAtWindow($row);
        }
    }

    /**
     * @param array<string, mixed> $row
     */
    private function assertTxnReversibleForUserFlow(array $row, bool $enforceCreatedAtWindow): void
    {
        $txnType = (string)($row['txn_type'] ?? '');
        $allowed = ['receipt', 'payment_expense', 'payment_client_cost', 'tds_provisional', 'tds_final'];
        if (!in_array($txnType, $allowed, true)) {
            $this->error('This transaction type cannot be reversed through this flow.', 422);
        }
        $st = (string)($row['status'] ?? '');
        if ($st !== 'active') {
            $this->error('Only active transactions can be reversed.', 422);
        }
        if ($this->txn->findLedgerReversalIdForOriginal((int)($row['id'] ?? 0)) !== null) {
            $this->error('This transaction has already been reversed.', 422);
        }
        if ($enforceCreatedAtWindow) {
            $this->assertUserReversalWithinCreatedAtWindow($row);
        }
    }

    /**
     * @param array<string, mixed> $row
     */
    private function assertUserReversalWithinCreatedAtWindow(array $row): void
    {
        $raw = (string)($row['created_at'] ?? '');
        if ($raw === '') {
            $this->error('Cannot determine posting time for this transaction.', 422);
        }
        try {
            $createdAt = new \DateTimeImmutable($raw);
        } catch (\Exception) {
            $this->error('Cannot determine posting time for this transaction.', 422);
        }
        $cutoff = (new \DateTimeImmutable('now'))->modify('-30 days');
        if ($createdAt < $cutoff) {
            $this->error(
                'Reversal is only allowed within 30 days of the original posting. Please contact your super admin.',
                422
            );
        }
    }

    /**
     * POST /api/admin/txn/bulk-delete
     * Body: { "ids": [1,2,3] } — header X-Superadmin-Otp required; one OTP authorizes the whole batch.
     */
    public function bulkDestroy(): never
    {
        $acting = $this->authUser();
        if (!$this->userHasPermission($acting, 'invoices.delete')) {
            $this->error('Access denied. Required permission: invoices.delete.', 403);
        }

        $body   = $this->getJsonBody();
        $idsRaw = $body['ids'] ?? null;
        if (!is_array($idsRaw) || $idsRaw === []) {
            $this->error('ids must be a non-empty array.', 422);
        }

        $ids = [];
        foreach ($idsRaw as $v) {
            $n = (int)$v;
            if ($n > 0) {
                $ids[$n] = $n;
            }
        }
        if ($ids === []) {
            $this->error('No valid transaction ids.', 422);
        }
        if (count($ids) > 200) {
            $this->error('Too many transactions (max 200 per request).', 422);
        }

        $rows = $this->collectValidatedLedgerCancelRows($ids);

        if (!$this->isSuperAdminActor($acting)) {
            $requestReason = trim((string)($body['request_reason'] ?? ''));
            $intercept = LedgerTxnChangeService::queueCancel(
                array_map(static fn (array $r): int => (int)($r['id'] ?? 0), $rows),
                $requestReason !== '' ? $requestReason : null,
                $acting
            );
            if ($intercept !== null) {
                $this->respondLedgerChangeQueued($intercept, null);
            }
        }

        usort($rows, function (array $a, array $b): int {
            $pa = $this->txnDeleteSortPriority((string)($a['txn_type'] ?? ''));
            $pb = $this->txnDeleteSortPriority((string)($b['txn_type'] ?? ''));
            if ($pa !== $pb) {
                return $pa <=> $pb;
            }

            return (int)($a['id'] ?? 0) <=> (int)($b['id'] ?? 0);
        });

        $actorId = $acting ? (int)$acting['id'] : null;

        foreach ($rows as $row) {
            $this->performTxnDelete($row, $actorId);
        }

        $this->success([
            'cancelled' => count($rows),
            'txn_ids'   => array_map(static fn (array $r): int => (int)($r['id'] ?? 0), $rows),
        ], 'Transactions cancelled.');
    }

    // ── GET /api/admin/txn/ledger ────────────────────────────────────────────

    /**
     * Return full ledger with running balance for a client or organization.
     * Query params: client_id or organization_id (one is required)
     */
    public function ledger(): never
    {
        $clientId = (int)$this->query('client_id', 0);
        $orgId    = (int)$this->query('organization_id', 0);

        if ($clientId <= 0 && $orgId <= 0) {
            $this->error('client_id or organization_id is required.', 422);
        }

        $ledgerClass = LedgerDimensions::normalizeLedgerClass($this->query('ledger_class', ''));
        $viewRaw     = trim((string)$this->query('ledger_view', 'consolidated'));
        $limit       = max(0, (int)$this->query('limit', 0));
        try {
            $ledgerView = LedgerDimensions::assertLedgerView($viewRaw !== '' ? $viewRaw : 'consolidated');
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        if ($orgId > 0) {
            $entries = $this->txn->getLedgerByOrganization($orgId, $ledgerClass, $ledgerView, $limit);
        } else {
            $entries = $this->txn->getLedgerByClient($clientId, $ledgerClass, $ledgerView, $limit);
        }
        $this->success($entries, 'Ledger retrieved');
    }

    /**
     * Return merged ledger with running balance for all members of a client group.
     * Query params: group_id (required), ledger_class?, ledger_view?, limit?
     */
    public function ledgerByGroup(): never
    {
        $groupId = (int)$this->query('group_id', 0);
        if ($groupId <= 0) {
            $this->error('group_id is required.', 422);
        }

        $ledgerClass = LedgerDimensions::normalizeLedgerClass($this->query('ledger_class', ''));
        $viewRaw     = trim((string)$this->query('ledger_view', 'consolidated'));
        $limit       = max(0, (int)$this->query('limit', 0));
        try {
            $ledgerView = LedgerDimensions::assertLedgerView($viewRaw !== '' ? $viewRaw : 'consolidated');
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        try {
            $entries = $this->txn->getLedgerByGroup($groupId, $ledgerClass, $ledgerView, $limit);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        $this->success($entries, 'Group ledger retrieved');
    }

    /**
     * GET /api/admin/txn/ledger-reconciliation
     * Query: client_id or organization_id (one required), ledger_class?
     */
    public function ledgerReconciliation(): never
    {
        $clientId = (int)$this->query('client_id', 0);
        $orgId    = (int)$this->query('organization_id', 0);
        if ($clientId <= 0 && $orgId <= 0) {
            $this->error('client_id or organization_id is required.', 422);
        }
        if ($clientId > 0 && $orgId > 0) {
            $this->error('Provide only one of client_id or organization_id.', 422);
        }

        $ledgerClass = LedgerDimensions::normalizeLedgerClass($this->query('ledger_class', ''));

        try {
            $payload = $this->txn->getLedgerReconciliation($clientId, $orgId, $ledgerClass);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        $this->success($payload, 'Ledger reconciliation');
    }

    /**
     * GET /api/admin/txn/bill-settlement-report
     * Query: client_id or organization_id, ledger_class, ledger_view, date_from?, date_to?
     */
    public function billSettlementReport(): never
    {
        $clientId = (int)$this->query('client_id', 0);
        $orgId    = (int)$this->query('organization_id', 0);
        if ($clientId <= 0 && $orgId <= 0) {
            $this->error('client_id or organization_id is required.', 422);
        }
        $ledgerClass = LedgerDimensions::normalizeLedgerClass($this->query('ledger_class', ''));
        $viewRaw     = trim((string)$this->query('ledger_view', 'consolidated'));
        try {
            $ledgerView = LedgerDimensions::assertLedgerView($viewRaw !== '' ? $viewRaw : 'consolidated');
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }
        $dateFrom = trim((string)$this->query('date_from', ''));
        $dateTo   = trim((string)$this->query('date_to', ''));
        $df       = $dateFrom !== '' ? $dateFrom : null;
        $dt       = $dateTo !== '' ? $dateTo : null;

        try {
            $payload = BillSettlementReportBuilder::build(
                $this->txn,
                $clientId,
                $orgId,
                $ledgerClass,
                $ledgerView,
                $df,
                $dt
            );
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }
        $this->success($payload, 'Bill settlement report');
    }

    /**
     * GET /api/admin/txn/recovery-by-group
     * Receivables grouped by client group with fees / taxes / reimbursement by ledger class.
     */
    public function recoveryByGroup(): never
    {
        try {
            $bucket = trim((string)$this->query('bucket', 'active'));
            $payload = $this->txn->getRecoveryByGroupReport($bucket);
            $this->success($payload, 'Recovery by group');
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        } catch (\Throwable $e) {
            error_log('[recoveryByGroup] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine() . "\n" . $e->getTraceAsString());
            $this->error('Recovery list failed: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/admin/txn/receipts-with-unallocated
     * Query: client_id or organization_id (one required), ledger_class, ledger_movement_kind
     */
    public function receiptsWithUnallocated(): never
    {
        $clientId = (int)$this->query('client_id', 0);
        $orgId    = (int)$this->query('organization_id', 0);
        if ($clientId <= 0 && $orgId <= 0) {
            $this->error('client_id or organization_id is required.', 422);
        }
        if ($clientId > 0 && $orgId > 0) {
            $this->error('Provide only one of client_id or organization_id.', 422);
        }
        try {
            $lc = LedgerDimensions::assertLedgerClass($this->query('ledger_class', ''));
            $mk = LedgerDimensions::assertLedgerMovementKindRequired($this->query('ledger_movement_kind', ''));
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }
        $rows = $this->txn->listReceiptsWithUnallocatedAdvance($clientId, $orgId, $lc, $mk);
        $this->success($rows, 'Receipts with unallocated balance');
    }

    // ── POST /api/admin/txn/receipt ──────────────────────────────────────────

    /**
     * Book a receipt (payment received from client).
     */
    public function storeReceipt(): never
    {
        $body   = $this->getJsonBody();
        $amount = (float)($body['amount'] ?? 0);
        if ($amount <= 0) {
            $this->error('amount must be greater than zero.', 422);
        }
        $clientId = (int)($body['client_id'] ?? 0);
        $orgId    = (int)($body['organization_id'] ?? 0);
        if ($clientId <= 0 && $orgId <= 0) {
            $this->error('client_id or organization_id is required.', 422);
        }
        if ($clientId > 0 && $orgId > 0) {
            $this->error('Provide only one of client_id or organization_id.', 422);
        }

        $actingUser    = $this->authUser();
        $body['created_by'] = $actingUser ? (int)$actingUser['id'] : null;

        try {
            $body['ledger_class'] = LedgerDimensions::assertLedgerClass($body['ledger_class'] ?? '');
            $body['ledger_movement_kind'] = LedgerDimensions::assertLedgerMovementKindRequired($body['ledger_movement_kind'] ?? '');
            if (LedgerDimensions::isParkedLedgerClass($body['ledger_class'])) {
                $allocRows = TxnReceiptAllocationService::normalizeParkedReceiptAllocations($body);
            } else {
                $allocRows = TxnReceiptAllocationService::normalizeAndValidateAllocations($body, $body['allocations'] ?? null);
            }
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        $this->attachValidatedBankAccount($body);

        $id  = $this->txn->createReceipt($body, $allocRows);
        $row = $this->txn->find($id);
        $this->recordTxnCreated((int)$id, $actingUser ? (int)$actingUser['id'] : null);
        $this->success($row, 'Receipt recorded', 201);
    }

    // ── POST /api/admin/txn/tds ──────────────────────────────────────────────

    /**
     * Book provisional TDS.
     */
    public function storeTds(): never
    {
        $body   = $this->getJsonBody();
        $amount = (float)($body['amount'] ?? 0);
        if ($amount <= 0) {
            $this->error('amount must be greater than zero.', 422);
        }
        if (empty($body['client_id'])) {
            $this->error('client_id is required.', 422);
        }

        $actingUser    = $this->authUser();
        $body['created_by'] = $actingUser ? (int)$actingUser['id'] : null;

        try {
            $this->enforceMovementLedgerDimensions($body, false);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        $id  = $this->txn->createTds($body);
        $row = $this->txn->find($id);
        $this->recordTxnCreated((int)$id, $actingUser ? (int)$actingUser['id'] : null);
        $this->success($row, 'TDS entry created', 201);
    }

    // ── PATCH /api/admin/txn/tds/:id/finalize ────────────────────────────────

    /**
     * Mark a provisional TDS entry as final.
     */
    public function finalizeTds(int $id): never
    {
        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('TDS entry not found.', 404);
        }
        if ($row['tds_status'] !== 'provisional') {
            $this->error('Only provisional TDS entries can be finalized.', 422);
        }

        $acting = $this->authUser();
        $actorId = $acting ? (int)$acting['id'] : null;
        $before  = $this->txnAuditCompactSnapshot($row);
        $this->txn->finalizeTds($id, $actorId);
        $updated = $this->txn->find($id);
        if ($updated !== null) {
            $this->auditTxnLog(
                $actorId,
                'txn.tds_finalized',
                $id,
                [],
                $before,
                $this->txnAuditCompactSnapshot($updated)
            );
        }
        $this->success($updated, 'TDS finalized');
    }

    // ── GET /api/admin/txn/tds ───────────────────────────────────────────────

    /**
     * List TDS entries.
     * Query params: client_id, tds_status (provisional|final)
     */
    public function tdsIndex(): never
    {
        $clientId  = (int)$this->query('client_id', 0);
        $tdsStatus = trim((string)$this->query('tds_status', ''));
        $entries   = $this->txn->getTdsEntries($clientId, $tdsStatus ?: null);
        $this->success($entries, 'TDS entries retrieved');
    }

    // ── POST /api/admin/txn/rebate ───────────────────────────────────────────

    /**
     * Book a rebate/discount.
     */
    public function storeRebate(): never
    {
        $body   = $this->getJsonBody();
        $amount = (float)($body['amount'] ?? 0);
        if ($amount <= 0) {
            $this->error('amount must be greater than zero.', 422);
        }
        if (empty($body['client_id'])) {
            $this->error('client_id is required.', 422);
        }

        $actingUser    = $this->authUser();
        $body['created_by'] = $actingUser ? (int)$actingUser['id'] : null;

        try {
            $this->enforceMovementLedgerDimensions($body, false);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        $id  = $this->txn->createRebate($body);
        $row = $this->txn->find($id);
        $this->success($row, 'Rebate recorded', 201);
    }

    // ── POST /api/admin/txn/credit-note ─────────────────────────────────────

    /**
     * Issue a credit note against an invoice.
     */
    public function storeCreditNote(): never
    {
        $body   = $this->getJsonBody();
        $amount = (float)($body['amount'] ?? 0);
        if ($amount <= 0) {
            $this->error('amount must be greater than zero.', 422);
        }
        if (empty($body['linked_txn_id'])) {
            $this->error('linked_txn_id is required.', 422);
        }

        $actingUser    = $this->authUser();
        $body['created_by'] = $actingUser ? (int)$actingUser['id'] : null;

        try {
            $id = $this->txn->createCreditNote($body);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }
        $row = $this->txn->find($id);
        $this->success($row, 'Credit note created', 201);
    }

    // ── GET /api/admin/txn/opening-balance ───────────────────────────────────

    /**
     * Get opening balances for a contact client or organization.
     * Query: exactly one of client_id or organization_id.
     */
    public function openingBalance(): never
    {
        $clientId = (int)$this->query('client_id', 0);
        $orgId    = (int)$this->query('organization_id', 0);
        if (($clientId <= 0 && $orgId <= 0) || ($clientId > 0 && $orgId > 0)) {
            $this->error('Provide exactly one of client_id or organization_id.', 422);
        }
        try {
            $rows = $this->txn->getOpeningBalance($clientId, $orgId);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }
        $this->success($rows, 'Opening balances retrieved');
    }

    // ── POST /api/admin/txn/opening-balance ──────────────────────────────────

    /**
     * Set/update an opening balance slice (fees or reimbursement) for a client or organization + billing profile.
     */
    public function storeOpeningBalance(): never
    {
        $body        = $this->getJsonBody();
        $clientId    = (int)($body['client_id'] ?? 0);
        $orgId       = (int)($body['organization_id'] ?? 0);
        $profileCode = trim((string)($body['billing_profile_code'] ?? ''));
        $amount      = (float)($body['amount'] ?? 0);
        $type        = trim((string)($body['type'] ?? 'debit'));
        $ledgerClass = LedgerDimensions::normalizeLedgerClass($body['ledger_class'] ?? null);
        if (LedgerDimensions::isParkedLedgerClass($ledgerClass)) {
            $this->error('Opening balance is not supported for parked ledger class.', 422);
        }
        $movementRaw = trim((string)($body['ledger_movement_kind'] ?? $body['ledgerMovementKind'] ?? ''));
        $txnDateRaw  = trim((string)($body['txn_date'] ?? $body['txnDate'] ?? ''));

        $errors = [];
        if (($clientId <= 0 && $orgId <= 0) || ($clientId > 0 && $orgId > 0)) {
            $errors['client_id'][] = 'Provide exactly one of client_id or organization_id.';
        }
        if ($profileCode === '') {
            $errors['billing_profile_code'][] = 'billing_profile_code is required.';
        }
        if ($amount < 0) {
            $errors['amount'][] = 'amount must be zero or greater.';
        }
        if (!in_array($type, ['debit', 'credit'], true)) {
            $errors['type'][] = 'type must be debit or credit.';
        }
        try {
            LedgerDimensions::assertLedgerMovementKindRequired($movementRaw);
        } catch (\InvalidArgumentException $e) {
            $errors['ledger_movement_kind'][] = $e->getMessage();
        }
        if ($amount > 0) {
            if ($txnDateRaw === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $txnDateRaw)) {
                $errors['txn_date'][] = 'txn_date is required as YYYY-MM-DD when saving a non-zero opening balance.';
            } else {
                $dtCheck = \DateTimeImmutable::createFromFormat('Y-m-d', $txnDateRaw);
                if ($dtCheck === false || $dtCheck->format('Y-m-d') !== $txnDateRaw) {
                    $errors['txn_date'][] = 'txn_date must be a valid calendar date.';
                }
            }
        }
        if (!empty($errors)) {
            $this->error('Validation failed.', 422, $errors);
        }

        $actingUser = $this->authUser();
        $actorId    = $actingUser ? (int)$actingUser['id'] : null;
        try {
            $payload = [
                'client_id'              => $clientId,
                'organization_id'        => $orgId,
                'billing_profile_code'   => $profileCode,
                'amount'                 => $amount,
                'type'                   => $type,
                'ledger_class'           => $ledgerClass,
                'ledger_movement_kind'   => $movementRaw,
                'created_by'             => $actorId,
            ];
            if ($amount > 0 && $txnDateRaw !== '') {
                $payload['txn_date'] = $txnDateRaw;
            }

            $existingOb = $this->findOpeningBalanceSliceRow(
                $clientId,
                $orgId,
                $profileCode,
                $ledgerClass,
                $movementRaw
            );
            if ($existingOb !== null) {
                $this->auditTxnLog(
                    $actorId,
                    'txn.cancelled',
                    (int)$existingOb['id'],
                    ['txn_type' => 'opening_balance', 'reason' => 'opening_balance_replace'],
                    $this->txnAuditCompactSnapshot($existingOb),
                    null
                );
            }

            $id = $this->txn->setOpeningBalance($payload);
            if ($id === null) {
                $this->success(null, 'Opening balance cleared');
            }
            $this->recordTxnCreated((int)$id, $actorId);
            $row = $this->txn->find($id);
            $this->success($row, 'Opening balance saved');
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        } catch (\Throwable $e) {
            $this->error('Failed to save opening balance: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GSTIN from contact or organization for place-of-supply.
     */
    private function resolveRecipientGstin(int $clientId, int $orgId): ?string
    {
        if ($clientId > 0) {
            $c = (new ClientModel())->find($clientId);

            return $c ? trim((string)($c['gstin'] ?? '')) : null;
        }
        if ($orgId > 0) {
            $o = (new OrganizationModel())->find($orgId);

            return $o ? trim((string)($o['gstin'] ?? '')) : null;
        }

        return null;
    }

    /**
     * @param array<string, mixed>|null $acting
     */
    private function userHasPermission(?array $acting, string $permission): bool
    {
        if ($acting === null) {
            return false;
        }
        if (strtolower((string)($acting['email'] ?? '')) === strtolower(AuthConfig::SUPER_ADMIN_EMAIL)) {
            return true;
        }
        $role = (string)($acting['role_name'] ?? '');
        if (in_array($role, ['super_admin', 'admin'], true)) {
            return true;
        }
        $permissions = $acting['role_permissions_array'] ?? [];
        if (in_array('*', $permissions, true)) {
            return true;
        }

        return in_array($permission, $permissions, true);
    }

    private function maskEmail(string $email): string
    {
        $parts = explode('@', $email, 2);
        if (count($parts) !== 2) {
            return '***@***.***';
        }
        $local  = $parts[0];
        $domain = $parts[1];
        $len    = strlen($local);
        if ($len <= 2) {
            $masked = $local[0] . str_repeat('*', max(1, $len - 1));
        } else {
            $masked = $local[0] . str_repeat('*', $len - 2) . $local[$len - 1];
        }

        return $masked . '@' . $domain;
    }

    /**
     * @param array<string, mixed>      $beforeRow
     * @param array<string, mixed>|null $afterRow
     * @param array<string, mixed>|null $acting
     */
    private function notifyAdminsInvoiceChange(string $verb, array $beforeRow, ?array $afterRow, ?array $acting): void
    {
        $actionLabel = match ($verb) {
            'deleted' => 'deleted',
            'cancelled' => 'cancelled',
            default => 'updated',
        };
        $actorName   = (string)(($acting ?? [])['name'] ?? 'Unknown');
        $actorEmail  = (string)(($acting ?? [])['email'] ?? 'Unknown');
        $timestamp   = date('d M Y, h:i A T');
        $txnId       = (string)($beforeRow['id'] ?? '');
        $invoiceRef  = (string)($beforeRow['invoice_number'] ?? '—');
        $clientName  = (string)($beforeRow['client_name'] ?? '—');
        $summary     = match ($verb) {
            'deleted' => 'Invoice transaction removed from the ledger.',
            'cancelled' => 'Invoice transaction cancelled (removed from active ledger; row retained for audit).',
            default => $this->summarizeInvoiceDiff($beforeRow, $afterRow ?? []),
        };

        try {
            $htmlBody = BrevoMailer::renderTemplate('invoice-changed-notify', [
                'actionLabel' => $actionLabel,
                'txnId'       => $txnId,
                'invoiceRef'  => $invoiceRef,
                'clientName'  => $clientName,
                'actorName'   => $actorName,
                'actorEmail'  => $actorEmail,
                'timestamp'   => $timestamp,
                'summary'     => $summary,
            ]);
            if ($htmlBody === '') {
                return;
            }
            $subject = 'Ledger invoice ' . $actionLabel . ' - CA Rahul Gupta';
            foreach ($this->users->listActiveAdminNotificationRecipients() as $rec) {
                BrevoMailer::send($rec['email'], $rec['name'], $subject, $htmlBody);
            }
        } catch (\Throwable $e) {
            error_log('[TxnController] Admin invoice notification failed: ' . $e->getMessage());
        }
    }

    /**
     * @param array<string, mixed> $before
     * @param array<string, mixed> $after
     */
    private function summarizeInvoiceDiff(array $before, array $after): string
    {
        $keys = ['txn_date', 'narration', 'debit', 'credit', 'amount', 'billing_profile_code', 'invoice_number', 'due_date', 'invoice_status', 'notes', 'status'];
        $parts = [];
        foreach ($keys as $k) {
            $b = $before[$k] ?? null;
            $a = $after[$k] ?? null;
            if ((string)(is_scalar($b) ? $b : json_encode($b)) !== (string)(is_scalar($a) ? $a : json_encode($a))) {
                $parts[] = "{$k}: " . (is_scalar($b) ? (string)$b : '…') . ' → ' . (is_scalar($a) ? (string)$a : '…');
            }
        }
        $bLines = $before['line_items'] ?? null;
        $aLines = $after['line_items'] ?? null;
        $bJson  = is_string($bLines) ? $bLines : json_encode($bLines ?? []);
        $aJson  = is_string($aLines) ? $aLines : json_encode($aLines ?? []);
        if ($bJson !== $aJson) {
            $parts[] = 'line_items: updated';
        }

        return $parts !== [] ? implode('; ', $parts) : 'Fields updated (no scalar diff detected).';
    }

    /**
     * Validate firm_bank_account_id matches billing_profile_code and normalize key on body.
     *
     * @param array<string, mixed> $body
     */
    private function attachValidatedBankAccount(array &$body): void
    {
        $bid = (int)($body['firm_bank_account_id'] ?? $body['firmBankAccountId'] ?? 0);
        if ($bid <= 0) {
            $this->error('firm_bank_account_id is required.', 422);
        }
        $profile = trim((string)($body['billing_profile_code'] ?? ''));
        if ($profile === '') {
            $this->error('billing_profile_code is required to select the billing firm bank account.', 422);
        }
        try {
            (new FirmBankAccountModel())->assertMatchesBillingProfile($bid, $profile);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }
        $body['firm_bank_account_id'] = $bid;
    }

    // ── GET /api/admin/txn/bank-ledger ─────────────────────────────────────────

    /** Query: firm_bank_account_id, date_from?, date_to? */
    public function bankLedger(): never
    {
        $aid = (int)$this->query('firm_bank_account_id', 0);
        if ($aid <= 0) {
            $this->error('firm_bank_account_id is required.', 422);
        }
        if (CashBookAccess::isCashBookOnlyUser($this->authUser())) {
            $cashErr = CashBookAccess::assertCashAccountId($aid);
            if ($cashErr !== null) {
                $this->error($cashErr, 403);
            }
        }
        $df = trim((string)$this->query('date_from', ''));
        $dt = trim((string)$this->query('date_to', ''));
        $rows = $this->txn->getBankLedger($aid, $df, $dt);
        $this->success($rows, 'Bank ledger');
    }

    // ── GET /api/admin/txn/firm-internal ──────────────────────────────────────

    /** Query: kind all|contra|expense|inflow|intra_transfer|inter_transfer, page, per_page, date_from, date_to */
    public function firmInternal(): never
    {
        $page    = max(1, (int)$this->query('page', 1));
        $perPage = min(100, max(1, (int)$this->query('per_page', 50)));
        $kind    = trim((string)$this->query('kind', 'all'));
        $df      = trim((string)$this->query('date_from', ''));
        $dt      = trim((string)$this->query('date_to', ''));
        $cashOnly = CashBookAccess::isCashBookOnlyUser($this->authUser());
        $res = $this->txn->paginateFirmInternal($page, $perPage, $kind, $df, $dt, $cashOnly);
        foreach ($res['rows'] as &$firmRow) {
            LedgerTxnChangeService::attachPendingToTxnRow($firmRow);
        }
        unset($firmRow);
        $this->success($res['rows'], 'Firm internal transactions', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $res['total'],
                'last_page' => (int)ceil(max(1, $res['total']) / $perPage),
            ],
        ]);
    }

    /** POST /api/admin/txn/:id/razorpay-order */
    public function razorpayOrder(int $id): never
    {
        $inv = $this->txn->find($id);
        if ($inv === null || ($inv['txn_type'] ?? '') !== 'invoice') {
            $this->error('Invoice transaction not found.', 404);
        }
        $total = (float)($inv['amount'] ?? 0);
        $paid  = $this->txn->sumLinkedReceipts($id);
        $remaining = max(0, round($total - $paid, 2));
        if ($remaining <= 0) {
            $this->error('Invoice is already fully paid.', 422);
        }

        $rz = new RazorpayClient();
        if (!$rz->isConfigured()) {
            $this->error('Razorpay is not configured on the server.', 503);
        }

        $body      = $this->getJsonBody();
        $amountInr = $remaining;
        if (isset($body['amount']) && (float)$body['amount'] > 0) {
            $amountInr = min($remaining, round((float)$body['amount'], 2));
        }
        $paise = (int)round($amountInr * 100);
        if ($paise < 100) {
            $this->error('Order amount must be at least ₹1.', 422);
        }

        $receipt = 'invtxn_' . $id . '_' . time();
        $order    = $rz->createOrder($paise, $receipt, [
            'invoice_txn_id' => (string)$id,
        ]);
        $orderId = (string)($order['id'] ?? '');
        if ($orderId === '') {
            $this->error('Razorpay did not return an order id.', 502);
        }

        $this->success([
            'orderId'     => $orderId,
            'amount'      => $amountInr,
            'amountPaise' => $paise,
            'currency'    => 'INR',
            'keyId'       => trim((string)(getenv('RAZORPAY_KEY_ID') ?: '')),
        ], 'Razorpay order created');
    }

    /**
     * Compact row for admin_audit_log snapshots / compare-after-edit.
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
            'firm_bank_account_id', 'counterparty_firm_bank_account_id', 'firm_expense_category',
        ];
        $out = [];
        foreach ($keys as $k) {
            if (array_key_exists($k, $row)) {
                $out[$k] = $row[$k];
            }
        }

        return $out;
    }

    /**
     * Find an opening_balance txn row for a single entity + billing profile + ledger slice.
     *
     * @return array<string, mixed>|null
     */
    private function findOpeningBalanceSliceRow(
        int $clientId,
        int $orgId,
        string $profileCode,
        string $ledgerClass,
        string $movementKind
    ): ?array {
        try {
            $rows = $this->txn->getOpeningBalance(
                $clientId > 0 ? $clientId : 0,
                $orgId > 0 ? $orgId : 0
            );
        } catch (\InvalidArgumentException) {
            return null;
        }

        foreach ($rows as $row) {
            if (($row['billing_profile_code'] ?? '') !== $profileCode) {
                continue;
            }
            if (LedgerDimensions::normalizeLedgerClass($row['ledger_class'] ?? null) !== $ledgerClass) {
                continue;
            }
            if ((string)($row['ledger_movement_kind'] ?? '') !== $movementKind) {
                continue;
            }

            return $row;
        }

        return null;
    }

    /**
     * @param array<string, mixed>|null $beforeSnapshot
     * @param array<string, mixed>|null $afterSnapshot
     */
    private function auditTxnLog(
        ?int $actorId,
        string $action,
        int $entityId,
        array $metadata = [],
        ?array $beforeSnapshot = null,
        ?array $afterSnapshot = null
    ): void {
        try {
            (new AdminAuditLogModel())->insert(
                $actorId,
                $action,
                'txn',
                $entityId,
                $metadata,
                $beforeSnapshot,
                $afterSnapshot
            );
        } catch (\Throwable $e) {
            error_log('[TxnController] txn audit log failed: ' . $e->getMessage());
        }
    }

    private function recordTxnCreated(int $id, ?int $actorId): void
    {
        $r = $this->txn->find($id);
        if ($r === null) {
            return;
        }
        $snap = $this->txnAuditCompactSnapshot($r);
        $this->auditTxnLog(
            $actorId,
            'txn.created',
            $id,
            ['txn_type' => (string)($r['txn_type'] ?? '')],
            null,
            $snap
        );
    }

    /**
     * Require ledger_class + ledger_movement_kind for client ledger movements; optionally validate receipt vs invoice.
     *
     * @param array<string, mixed> $body
     */
    private function enforceMovementLedgerDimensions(array &$body, bool $validateReceiptInvoiceLink): void
    {
        $body['ledger_class'] = LedgerDimensions::assertLedgerClass($body['ledger_class'] ?? '');
        $body['ledger_movement_kind'] = LedgerDimensions::assertLedgerMovementKindRequired($body['ledger_movement_kind'] ?? '');
        if (!$validateReceiptInvoiceLink || empty($body['linked_txn_id'])) {
            return;
        }
        $inv = $this->txn->find((int)$body['linked_txn_id']);
        if ($inv === null || ($inv['txn_type'] ?? '') !== 'invoice') {
            throw new \InvalidArgumentException('linked_txn_id must reference an invoice.');
        }
        $invLc = LedgerDimensions::normalizeLedgerClass($inv['ledger_class'] ?? null);
        if ($invLc !== $body['ledger_class']) {
            throw new \InvalidArgumentException('Receipt ledger_class must match the linked invoice.');
        }
        LedgerDimensions::assertReceiptMovementMatchesInvoice($inv, $body['ledger_movement_kind']);
    }

    /**
     * @param array<string, mixed> $body
     */
    private function enforceClientCostLedgerDimensions(array &$body): void
    {
        $body['ledger_class'] = LedgerDimensions::assertClientCostsLedgerClass(
            $body['ledger_class'] ?? LedgerDimensions::CLASS_CLIENT_COSTS
        );
        $body['ledger_movement_kind'] = LedgerDimensions::assertLedgerMovementKindRequired(
            $body['ledger_movement_kind'] ?? ''
        );
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $body
     */
    private function applyPaymentClientCostTxnUpdate(int $id, array $row, array $body, ?int $actorId): void
    {
        foreach (['client_id', 'organization_id', 'ledger_class'] as $field) {
            if (!array_key_exists($field, $body)) {
                continue;
            }
            if ((string)$body[$field] !== (string)($row[$field] ?? '')) {
                $this->error('Cannot change ' . $field . ' on this payment via edit.', 422);
            }
        }
        if (!empty($body['settlement_lines'])) {
            $this->error('Client cost payments cannot be settled from receipts or unallocated advance.', 422);
        }

        $metaKeys = [
            'txn_date', 'narration', 'notes', 'payment_method', 'reference_number',
            'expense_purpose', 'firm_bank_account_id',
        ];
        $newAmount = array_key_exists('amount', $body)
            ? round((float)$body['amount'], 2)
            : round((float)($row['amount'] ?? 0), 2);
        if ($newAmount <= 0) {
            $this->error('amount must be greater than zero.', 422);
        }

        $ledgerDims = $this->resolveTxnLedgerDimensions($row, $body, true);

        $resolveBankId = function (array $metaSlice) use ($row, $id): int {
            if (!empty($metaSlice['firm_bank_account_id'])) {
                $tmpBody = array_merge(
                    $metaSlice,
                    ['billing_profile_code' => (string)($row['billing_profile_code'] ?? '')]
                );
                $this->attachValidatedBankAccount($tmpBody);

                return (int) $tmpBody['firm_bank_account_id'];
            }

            return $this->txn->findPaymentClientCostBankLegAccountId($id);
        };

        $patch = array_intersect_key($body, array_flip($metaKeys));
        $patch = array_merge($patch, ['ledger_movement_kind' => $ledgerDims['ledger_movement_kind']]);
        $this->applyMethodNarrationSync($row, $patch, 'Client cost — ');
        $patch['amount'] = $newAmount;
        $patch['debit']  = 0;
        $patch['credit'] = 0;
        $bankId          = $resolveBankId($patch);
        unset($patch['firm_bank_account_id']);
        if ($bankId > 0) {
            $patch['paid_from'] = $this->resolvePaidFromLabelForBankId($bankId);
        }
        $this->txn->update($id, $patch, $actorId);
        if ($bankId > 0) {
            $fresh = $this->txn->find($id);
            $this->txn->syncPaymentClientCostBankLeg(
                $id,
                is_array($fresh) ? $fresh : $row,
                $newAmount,
                $bankId
            );
        }
    }

    /**
     * Apply a pending Team Approvals ledger change (called from LedgerTxnChangeApprovalController).
     *
     * @return array<string, mixed>
     */
    public function executeApprovedLedgerChange(int $requestId, int $decidedByActorId): array
    {
        $model = new LedgerTxnChangeRequestModel();
        $req   = $model->find($requestId);
        if ($req === null || ($req['status'] ?? '') !== 'pending') {
            $this->error('Request not found or already decided.', 404);
        }

        $action  = (string)($req['action'] ?? '');
        $payload = LedgerTxnChangeRequestModel::decodeJsonField($req['payload'] ?? []);
        $txnId   = $req['txn_id'] !== null ? (int)$req['txn_id'] : 0;

        return match ($action) {
            LedgerTxnChangeRequestModel::ACTION_UPDATE => $this->executeApprovedLedgerUpdate(
                $requestId,
                $txnId,
                $payload,
                $decidedByActorId
            ),
            LedgerTxnChangeRequestModel::ACTION_REVERSE => $this->executeApprovedLedgerReverse(
                $requestId,
                $txnId,
                $payload,
                $decidedByActorId
            ),
            LedgerTxnChangeRequestModel::ACTION_CANCEL_REVERSAL => $this->executeApprovedLedgerCancelReversal(
                $requestId,
                $txnId,
                $decidedByActorId
            ),
            LedgerTxnChangeRequestModel::ACTION_CANCEL => $this->executeApprovedLedgerCancel(
                $requestId,
                $payload,
                $decidedByActorId
            ),
            LedgerTxnChangeRequestModel::ACTION_REINSTATE => $this->executeApprovedLedgerReinstate(
                $requestId,
                $txnId,
                $decidedByActorId
            ),
            default => $this->error('Unknown approval action.', 422),
        };
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function executeApprovedLedgerUpdate(
        int $requestId,
        int $txnId,
        array $payload,
        int $decidedByActorId
    ): array {
        if ($txnId <= 0) {
            $this->error('Invalid transaction id on approval request.', 422);
        }
        $row = $this->txn->find($txnId);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }
        $type = (string)($row['txn_type'] ?? '');
        if (!$this->txnRequiresTeamApproval($type)) {
            $this->error('This transaction type cannot be updated through ledger approval.', 422);
        }

        $body = $payload;
        unset($body['txn_type']);
        $beforeSnap = $this->txnAuditCompactSnapshot($row);

        switch ($type) {
            case 'invoice':
                $this->txn->update($txnId, $body, $decidedByActorId);
                break;
            case 'receipt':
                $this->applyReceiptTxnUpdate($txnId, $row, $body, $decidedByActorId);
                break;
            case 'payment_expense':
                $this->applyPaymentExpenseTxnUpdate($txnId, $row, $body, $decidedByActorId);
                break;
            case 'payment_client_cost':
                $this->applyPaymentClientCostTxnUpdate($txnId, $row, $body, $decidedByActorId);
                break;
            case 'tds_provisional':
            case 'tds_final':
                $this->applyTdsTxnUpdate($txnId, $row, $body, $decidedByActorId);
                break;
            case 'firm_expense':
            case 'firm_inflow':
                $this->applyFirmSimpleTxnUpdate($txnId, $row, $body, $decidedByActorId);
                break;
            case 'firm_bank_transfer':
                $this->applyFirmBankTransferPairUpdate($txnId, $body, $decidedByActorId);
                break;
            default:
                $this->txn->update($txnId, $body, $decidedByActorId);
        }

        $updated   = $this->txn->find($txnId);
        $afterSnap = $this->txnAuditCompactSnapshot($updated ?? []);
        if ($updated !== null && $beforeSnap !== $afterSnap) {
            $this->auditTxnLog(
                $decidedByActorId,
                'txn.updated',
                $txnId,
                ['txn_type' => $type, 'approval_id' => $requestId, 'via' => 'team_approval'],
                $beforeSnap,
                $afterSnap
            );
        }
        if ($type === 'invoice') {
            (new CommissionSyncService())->syncInvoiceSafe($txnId);
            $this->notifyAdminsInvoiceChange('updated', $row, $updated, null);
        }

        return ['txn_id' => $txnId, 'action' => 'update', 'txn' => $updated];
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function executeApprovedLedgerReverse(
        int $requestId,
        int $txnId,
        array $payload,
        int $decidedByActorId
    ): array {
        if ($txnId <= 0) {
            $this->error('Invalid transaction id on approval request.', 422);
        }
        $reason = trim((string)($payload['reason'] ?? ''));
        if (strlen($reason) < 10) {
            $this->error('reason must be at least 10 characters.', 422);
        }

        $row = $this->txn->find($txnId);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }
        $this->assertTxnReversibleForUserFlow($row, false);

        $beforeOrig = $this->txnAuditCompactSnapshot($row);
        try {
            $result = $this->txn->reverseLedgerEntry($txnId, $reason, $decidedByActorId);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        $newId = (int)$result['new_id'];
        foreach ($result['affected_invoice_ids'] as $iid) {
            (new CommissionSyncService())->syncInvoiceSafe((int)$iid);
        }

        $origAfter = $this->txn->find($txnId);
        $revRow    = $this->txn->find($newId);
        $this->auditTxnLog(
            $decidedByActorId,
            'txn.reversed',
            $txnId,
            [
                'reversal_reason' => $reason,
                'mode'            => 'team_approval',
                'approval_id'     => $requestId,
                'reversal_txn_id' => $newId,
                'txn_type'        => (string)($row['txn_type'] ?? ''),
            ],
            $beforeOrig,
            [
                'original' => $origAfter !== null ? $this->txnAuditCompactSnapshot($origAfter) : null,
                'reversal' => $revRow !== null ? $this->txnAuditCompactSnapshot($revRow) : null,
            ]
        );
        if ($revRow !== null) {
            $this->recordTxnCreated($newId, $decidedByActorId);
        }

        return [
            'txn_id'          => $txnId,
            'action'          => 'reverse',
            'reversal_txn_id' => $newId,
        ];
    }

    /** @return array<string, mixed> */
    private function executeApprovedLedgerCancelReversal(
        int $requestId,
        int $txnId,
        int $decidedByActorId
    ): array {
        if ($txnId <= 0) {
            $this->error('Invalid transaction id on approval request.', 422);
        }
        $row = $this->txn->find($txnId);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }
        $this->assertTxnCancelReversalForUserFlow($row, false);

        $beforeOrig = $this->txnAuditCompactSnapshot($row);
        try {
            $result = $this->txn->cancelLedgerReversalForOriginal($txnId, $decidedByActorId);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        $origAfter     = $this->txn->find($txnId);
        $reversalTxnId = $result['reversal_txn_id'] ?? null;
        $revAfter      = $reversalTxnId !== null ? $this->txn->find((int)$reversalTxnId) : null;
        $this->auditTxnLog(
            $decidedByActorId,
            'txn.reversal_cancelled',
            $txnId,
            [
                'mode'            => 'team_approval',
                'approval_id'     => $requestId,
                'reversal_txn_id' => $reversalTxnId,
                'txn_type'        => (string)($row['txn_type'] ?? ''),
            ],
            $beforeOrig,
            [
                'original' => $origAfter !== null ? $this->txnAuditCompactSnapshot($origAfter) : null,
                'reversal' => $revAfter !== null ? $this->txnAuditCompactSnapshot($revAfter) : null,
            ]
        );

        return ['txn_id' => $txnId, 'action' => 'cancel_reversal'];
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function executeApprovedLedgerCancel(
        int $requestId,
        array $payload,
        int $decidedByActorId
    ): array {
        $idsRaw = $payload['ids'] ?? null;
        if (!is_array($idsRaw) || $idsRaw === []) {
            $this->error('Cancel approval has no transaction ids.', 422);
        }

        $ids = [];
        foreach ($idsRaw as $v) {
            $n = (int)$v;
            if ($n > 0) {
                $ids[$n] = $n;
            }
        }
        if ($ids === []) {
            $this->error('No valid transaction ids.', 422);
        }

        $rows = [];
        foreach ($ids as $id) {
            $row = $this->txn->find($id);
            if ($row === null) {
                $this->error('Transaction not found: ' . $id, 404);
            }
            if (in_array((string)($row['status'] ?? ''), ['cancelled', 'deleted'], true)) {
                $this->error('Transaction already cancelled: ' . $id, 422);
            }
            if ((string)($row['status'] ?? '') === 'reversed') {
                $this->error(
                    'Cannot cancel reversed posting id ' . $id . ' until its ledger reversal is cancelled.',
                    422
                );
            }
            $tt = (string)($row['txn_type'] ?? '');
            if (!$this->txnRequiresSuperadminDelete($tt) && !$this->txnRequiresFirmTeamApproval($tt)) {
                $this->error('Cancel approval is not allowed for transaction type: ' . $tt, 422);
            }
            $rows[] = $row;
        }

        usort($rows, function (array $a, array $b): int {
            $pa = $this->txnDeleteSortPriority((string)($a['txn_type'] ?? ''));
            $pb = $this->txnDeleteSortPriority((string)($b['txn_type'] ?? ''));
            if ($pa !== $pb) {
                return $pa <=> $pb;
            }

            return (int)($a['id'] ?? 0) <=> (int)($b['id'] ?? 0);
        });

        foreach ($rows as $row) {
            $this->performTxnDelete($row, $decidedByActorId);
        }

        return [
            'action'    => 'cancel',
            'approval_id' => $requestId,
            'cancelled' => count($rows),
            'txn_ids'   => array_map(static fn (array $r): int => (int)($r['id'] ?? 0), $rows),
        ];
    }

    private function executeApprovedLedgerReinstate(
        int $requestId,
        int $txnId,
        int $decidedByActorId
    ): array {
        if ($txnId <= 0) {
            $this->error('Invalid transaction id on approval request.', 422);
        }
        $row = $this->txn->find($txnId);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }
        $this->assertTxnReinstateAllowed($row);

        $beforeSnap = $this->txnAuditCompactSnapshot($row);
        $this->performTxnReinstate($row, $decidedByActorId);
        $after = $this->txn->find($txnId);
        $this->auditTxnLog(
            $decidedByActorId,
            'txn.reinstated',
            $txnId,
            [
                'approval_id' => $requestId,
                'txn_type'    => (string)($row['txn_type'] ?? ''),
                'via'         => 'team_approval',
            ],
            $beforeSnap,
            $after !== null ? $this->txnAuditCompactSnapshot($after) : null
        );

        return [
            'action'      => 'reinstate',
            'approval_id' => $requestId,
            'txn_id'      => $txnId,
        ];
    }

    /**
     * @param array<int, int> $ids id => id map
     *
     * @return list<array<string, mixed>>
     */
    private function collectValidatedLedgerCancelRows(array $ids): array
    {
        $rows = [];
        foreach ($ids as $id) {
            $row = $this->txn->find($id);
            if ($row === null) {
                $this->error('Transaction not found: ' . $id, 404);
            }
            if (in_array((string)($row['status'] ?? ''), ['cancelled', 'deleted'], true)) {
                $this->error('Transaction already cancelled: ' . $id, 422);
            }
            if ((string)($row['status'] ?? '') === 'reversed') {
                $this->error(
                    'Cannot cancel reversed posting id ' . $id . ' until its ledger reversal is cancelled.',
                    422
                );
            }
            $tt = (string)($row['txn_type'] ?? '');
            $cashMirrorOnly = [
                TxnModel::TXN_TYPE_RECEIPT_BANK_LEG,
                TxnModel::TXN_TYPE_PAYMENT_EXPENSE_BANK_LEG,
                TxnModel::TXN_TYPE_PAYMENT_CLIENT_COST_BANK_LEG,
                TxnModel::TXN_TYPE_RECEIPT_BANK_LEG_REVERSAL,
                TxnModel::TXN_TYPE_PAYMENT_EXPENSE_BANK_LEG_REVERSAL,
                TxnModel::TXN_TYPE_PAYMENT_CLIENT_COST_BANK_LEG_REVERSAL,
            ];
            if (in_array($tt, $cashMirrorOnly, true)) {
                $this->error(
                    'Bulk delete cannot include firm cash-book leg id ' . $id . '. Remove it and delete the client transaction instead.',
                    422
                );
            }
            if (in_array($tt, ['receipt_reversal', 'payment_expense_reversal', 'payment_client_cost_reversal', 'tds_reversal'], true)) {
                $this->error(
                    'Bulk delete cannot include ledger reversal id ' . $id . '. Cancel the reversal on the original posting instead.',
                    422
                );
            }
            if (!$this->txnRequiresSuperadminDelete($tt)) {
                $this->error('Bulk delete is not allowed for transaction type: ' . $tt, 422);
            }
            $rows[] = $row;
        }

        return $rows;
    }

    /**
     * @param array{type: string, summary: array<string, mixed>} $intercept
     * @param array<string, mixed>|null $row
     */
    /**
     * @param array<string, mixed>|null $actor
     */
    private function respondLedgerChangeQueued(array $intercept, ?array $row, ?array $actor = null): never
    {
        if (($intercept['type'] ?? '') === 'blocked') {
            $this->error(
                'A ledger change is already pending Super Admin approval (Approval #'
                . (int)($intercept['summary']['approval_id'] ?? 0) . ').',
                422,
                [],
                ['pending_ledger_change' => $intercept['summary']]
            );
        }
        if (($intercept['type'] ?? '') === 'reason_required') {
            $this->error(\App\Libraries\ApprovalReason::ERROR_MESSAGE, 422);
        }

        $approvalId = (int)($intercept['summary']['approval_id'] ?? 0);
        $action     = (string)($intercept['summary']['action'] ?? '');
        $label      = LedgerTxnChangeService::actionLabel($action);
        $txnId      = $row !== null ? (int)($row['id'] ?? 0) : 0;
        if ($txnId > 0) {
            $actorId = $actor ? (int)($actor['id'] ?? 0) : null;
            $this->auditTxnLog(
                $actorId,
                'txn.change_requested',
                $txnId,
                [
                    'approval_id' => $approvalId,
                    'action'      => $action,
                    'txn_type'    => (string)($row['txn_type'] ?? ''),
                ],
                $this->txnAuditCompactSnapshot($row),
                null
            );
        }
        $msg = $label . ' submitted for Super Admin approval (Approval #' . $approvalId . ').';
        $this->success($row, $msg, 200, ['pending_ledger_change' => $intercept['summary']]);
    }

    /** @param array<string, mixed>|null $actor */
    private function isSuperAdminActor(?array $actor): bool
    {
        if ($actor === null) {
            return false;
        }
        if ($this->isSuperAdminEmail((string)($actor['email'] ?? ''))) {
            return true;
        }

        return ($actor['role_name'] ?? '') === 'super_admin';
    }
}
