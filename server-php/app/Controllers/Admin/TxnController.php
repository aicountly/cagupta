<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\TxnModel;

/**
 * TxnController — unified transaction endpoints.
 *
 * All endpoints require Bearer token authentication.
 */
class TxnController extends BaseController
{
    private TxnModel $txn;

    public function __construct()
    {
        $this->txn = new TxnModel();
    }

    // ── GET /api/admin/txn ───────────────────────────────────────────────────

    /**
     * List/paginate transactions with optional filters.
     *
     * Query params: page, per_page, search, txn_type, client_id,
     *               tds_status, status, date_from, date_to
     */
    public function index(): never
    {
        $page      = max(1, (int)$this->query('page', 1));
        $perPage   = min(100, max(1, (int)$this->query('per_page', 20)));
        $search    = trim((string)$this->query('search', ''));
        $txnType   = trim((string)$this->query('txn_type', ''));
        $clientId  = (int)$this->query('client_id', 0);
        $tdsStatus = trim((string)$this->query('tds_status', ''));
        $status    = trim((string)$this->query('status', ''));
        $dateFrom  = trim((string)$this->query('date_from', ''));
        $dateTo    = trim((string)$this->query('date_to', ''));

        $result = $this->txn->paginate(
            $page, $perPage, $search, $txnType,
            $clientId, $tdsStatus, $status, $dateFrom, $dateTo
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
                $id = $this->txn->createInvoice($body);
                break;
            case 'receipt':
                $id = $this->txn->createReceipt($body);
                break;
            case 'payment_expense':
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

    // ── PUT /api/admin/txn/:id ───────────────────────────────────────────────

    public function update(int $id): never
    {
        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }

        $body = $this->getJsonBody();
        $this->txn->update($id, $body);
        $updated = $this->txn->find($id);
        $this->success($updated, 'Transaction updated');
    }

    // ── DELETE /api/admin/txn/:id ────────────────────────────────────────────

    public function destroy(int $id): never
    {
        $row = $this->txn->find($id);
        if ($row === null) {
            $this->error('Transaction not found.', 404);
        }
        $this->txn->delete($id);
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
        if (empty($body['client_id'])) {
            $this->error('client_id is required.', 422);
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
}
