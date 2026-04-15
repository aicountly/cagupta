<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Auth as AuthConfig;
use App\Controllers\BaseController;
use App\Libraries\BrevoMailer;
use App\Libraries\CommissionSyncService;
use App\Libraries\GstInvoiceTax;
use App\Libraries\OtpService;
use App\Libraries\RazorpayClient;
use App\Models\ClientModel;
use App\Models\OrganizationModel;
use App\Models\TxnModel;
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
     *               expense_purpose, tds_status, status, date_from, date_to
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

        $result = $this->txn->paginate(
            $page, $perPage, $search, $txnType,
            $clientId, $orgId, $tdsStatus, $status, $dateFrom, $dateTo, $expensePurpose, $paymentMethodFilter, $paidFromFilter
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
            'opening_balance', 'invoice', 'payment_expense',
            'receipt', 'tds_provisional', 'tds_final', 'rebate', 'credit_note',
        ];
        if (!in_array($txnType, $valid, true)) {
            $this->error('Invalid or missing txn_type.', 422);
        }

        $actingUser = $this->authUser();
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
                    $prepared         = GstInvoiceTax::prepareInvoice($body, $recipientGstin);
                    $id               = $this->txn->createInvoice(array_merge($body, $prepared));
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
                $id = $this->txn->createReceipt($body);
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
                $id = $this->txn->createPaymentExpense($body);
                break;
            case 'tds_provisional':
                $id = $this->txn->createTds($body);
                break;
            case 'rebate':
                $id = $this->txn->createRebate($body);
                break;
            case 'credit_note':
                $id = $this->txn->createCreditNote($body);
                break;
            case 'opening_balance':
                $id = $this->txn->setOpeningBalance($body);
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
        $this->success($row, 'Transaction created', 201);
    }

    // ── GET /api/admin/txn/:id ───────────────────────────────────────────────

    public function show(int $id): never
    {
        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }
        $this->success($row);
    }

    // ── POST /api/admin/txn/:id/request-invoice-modify-otp ─────────────────────

    /**
     * Send a superadmin OTP to authorize ledger invoice update or delete.
     * Query or JSON body: intent = update | delete
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
        if (($row['txn_type'] ?? '') !== 'invoice') {
            $this->error('OTP requests are only for invoice transactions.', 422);
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
        try {
            $htmlBody = BrevoMailer::renderTemplate('invoice-modify-otp', [
                'userName'       => (string)($super['name'] ?? $email),
                'otpCode'        => $otp,
                'expiryMinutes'  => (string)OtpService::expiryMinutes(),
                'intentLabel'    => $intentLabel,
                'txnId'          => (string)$id,
                'invoiceRef'     => (string)($row['invoice_number'] ?? '—'),
            ]);
            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $email,
                    (string)($super['name'] ?? $email),
                    'Invoice change OTP - CA Rahul Gupta',
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[TxnController] Invoice modify OTP email failed: ' . $e->getMessage());
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

        $body = $this->getJsonBody();
        if (($row['txn_type'] ?? '') === 'invoice') {
            $otp = $this->readSuperadminOtpFromRequest();
            if ($otp === '' || !$this->verifySuperadminOtp($otp)) {
                $this->error('Valid superadmin OTP is required to modify an invoice. Request a code first.', 403);
            }
            unset($body['txn_type']);
        }

        $this->txn->update($id, $body);
        $updated = $this->txn->find($id);
        if (($row['txn_type'] ?? '') === 'invoice') {
            (new CommissionSyncService())->syncInvoiceSafe($id);
            $this->notifyAdminsInvoiceChange('updated', $row, $updated, $this->authUser());
        }
        $this->success($updated, 'Transaction updated');
    }

    // ── DELETE /api/admin/txn/:id ────────────────────────────────────────────

    public function destroy(int $id): never
    {
        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }

        $isInvoice = (($row['txn_type'] ?? '') === 'invoice');
        if ($isInvoice) {
            if (!$this->userHasPermission($this->authUser(), 'invoices.delete')) {
                $this->error('Access denied. Required permission: invoices.delete.', 403);
            }
            $otp = $this->readSuperadminOtpFromRequest();
            if ($otp === '' || !$this->verifySuperadminOtp($otp)) {
                $this->error('Valid superadmin OTP is required to delete an invoice. Request a code first.', 403);
            }
        } elseif (!$this->userHasPermission($this->authUser(), 'invoices.edit')) {
            $this->error('Access denied. Required permission: invoices.edit.', 403);
        }

        if ($isInvoice) {
            (new CommissionSyncService())->onInvoiceDeleted($id);
        }
        $this->txn->delete($id);
        if ($isInvoice) {
            $this->notifyAdminsInvoiceChange('deleted', $row, null, $this->authUser());
        }
        $this->success(null, 'Transaction deleted');
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

        if ($orgId > 0) {
            $entries = $this->txn->getLedgerByOrganization($orgId);
        } else {
            $entries = $this->txn->getLedgerByClient($clientId);
        }
        $this->success($entries, 'Ledger retrieved');
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

        $id  = $this->txn->createReceipt($body);
        $row = $this->txn->find($id);
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

        $id  = $this->txn->createTds($body);
        $row = $this->txn->find($id);
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

        $this->txn->finalizeTds($id);
        $updated = $this->txn->find($id);
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
        if (empty($body['client_id'])) {
            $this->error('client_id is required.', 422);
        }

        $actingUser    = $this->authUser();
        $body['created_by'] = $actingUser ? (int)$actingUser['id'] : null;

        $id  = $this->txn->createCreditNote($body);
        $row = $this->txn->find($id);
        $this->success($row, 'Credit note created', 201);
    }

    // ── GET /api/admin/txn/opening-balance ───────────────────────────────────

    /**
     * Get opening balances for a client.
     * Query param: client_id (required)
     */
    public function openingBalance(): never
    {
        $clientId = (int)$this->query('client_id', 0);
        if ($clientId <= 0) {
            $this->error('client_id is required.', 422);
        }
        $rows = $this->txn->getOpeningBalance($clientId);
        $this->success($rows, 'Opening balances retrieved');
    }

    // ── POST /api/admin/txn/opening-balance ──────────────────────────────────

    /**
     * Set/update an opening balance for a client + billing profile.
     */
    public function storeOpeningBalance(): never
    {
        $body        = $this->getJsonBody();
        $clientId    = (int)($body['client_id'] ?? 0);
        $profileCode = trim((string)($body['billing_profile_code'] ?? ''));
        $amount      = (float)($body['amount'] ?? 0);
        $type        = trim((string)($body['type'] ?? 'debit'));

        $errors = [];
        if ($clientId <= 0) {
            $errors['client_id'][] = 'client_id is required.';
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
        if (!empty($errors)) {
            $this->error('Validation failed.', 422, $errors);
        }

        $actingUser = $this->authUser();
        try {
            $id = $this->txn->setOpeningBalance([
                'client_id'            => $clientId,
                'billing_profile_code' => $profileCode,
                'amount'               => $amount,
                'type'                 => $type,
                'created_by'           => $actingUser ? (int)$actingUser['id'] : null,
            ]);
            $row = $this->txn->find($id);
            $this->success($row, 'Opening balance saved');
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
        $actionLabel = $verb === 'deleted' ? 'deleted' : 'updated';
        $actorName   = (string)(($acting ?? [])['name'] ?? 'Unknown');
        $actorEmail  = (string)(($acting ?? [])['email'] ?? 'Unknown');
        $timestamp   = date('d M Y, h:i A T');
        $txnId       = (string)($beforeRow['id'] ?? '');
        $invoiceRef  = (string)($beforeRow['invoice_number'] ?? '—');
        $clientName  = (string)($beforeRow['client_name'] ?? '—');
        $summary     = $verb === 'deleted'
            ? 'Invoice transaction removed from the ledger.'
            : $this->summarizeInvoiceDiff($beforeRow, $afterRow ?? []);

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
}
