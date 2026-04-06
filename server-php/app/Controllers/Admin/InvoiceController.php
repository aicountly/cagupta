<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\InvoiceModel;

/**
 * InvoiceController — CRUD for the `invoices` table.
 *
 * All endpoints require Bearer token + role: super_admin or admin.
 */
class InvoiceController extends BaseController
{
    private InvoiceModel $invoices;

    public function __construct()
    {
        $this->invoices = new InvoiceModel();
    }

    // ── GET /api/admin/invoices ──────────────────────────────────────────────

    /**
     * Return a paginated list of invoices.
     *
     * Query params: page, per_page, search, status
     */
    public function index(): never
    {
        $page    = max(1, (int)$this->query('page', 1));
        $perPage = min(100, max(1, (int)$this->query('per_page', 20)));
        $search  = trim((string)$this->query('search', ''));
        $status  = trim((string)$this->query('status', ''));

        $result = $this->invoices->paginate($page, $perPage, $search, $status);

        $this->success($result['invoices'], 'Invoices retrieved', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => (int)ceil($result['total'] / $perPage),
            ],
        ]);
    }

    // ── POST /api/admin/invoices ─────────────────────────────────────────────

    /**
     * Create a new invoice.
     *
     * Body: { client_id?, invoice_date?, due_date?, total, status?,
     *         amount_paid?, notes?, billing_profile_code? }
     */
    public function store(): never
    {
        $body  = $this->getJsonBody();
        $total = (float)($body['total'] ?? $body['total_amount'] ?? 0);

        if ($total <= 0) {
            $this->error('Invoice total must be greater than zero.', 422);
        }

        $actingUser = $this->authUser();

        $newId = $this->invoices->create([
            'client_id'            => isset($body['client_id']) ? (int)$body['client_id'] : null,
            'invoice_date'         => $body['invoice_date']         ?? date('Y-m-d'),
            'due_date'             => $body['due_date']             ?? null,
            'total'                => $total,
            'amount_paid'          => (float)($body['amount_paid']  ?? 0),
            'status'               => $body['status']               ?? 'draft',
            'notes'                => $body['notes']                ?? null,
            'billing_profile_code' => $body['billing_profile_code'] ?? null,
            'created_by'           => $actingUser ? (int)$actingUser['id'] : null,
        ]);

        $invoice = $this->invoices->find($newId);
        $this->success($invoice, 'Invoice created', 201);
    }

    // ── GET /api/admin/invoices/:id ──────────────────────────────────────────

    /**
     * Return a single invoice.
     */
    public function show(int $id): never
    {
        $invoice = $this->invoices->find($id);
        if ($invoice === null) {
            $this->error('Invoice not found.', 404);
        }
        $this->success($invoice);
    }

    // ── PUT /api/admin/invoices/:id ──────────────────────────────────────────

    /**
     * Update an invoice.
     */
    public function update(int $id): never
    {
        $invoice = $this->invoices->find($id);
        if ($invoice === null) {
            $this->error('Invoice not found.', 404);
        }

        $body = $this->getJsonBody();
        $data = [];

        $allowed = ['status', 'amount_paid', 'notes', 'due_date', 'billing_profile_code'];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }

        $this->invoices->update($id, $data);
        $updated = $this->invoices->find($id);
        $this->success($updated, 'Invoice updated');
    }

    // ── DELETE /api/admin/invoices/:id ───────────────────────────────────────

    /**
     * Delete an invoice.
     */
    public function destroy(int $id): never
    {
        $invoice = $this->invoices->find($id);
        if ($invoice === null) {
            $this->error('Invoice not found.', 404);
        }

        $this->invoices->delete($id);
        $this->success(null, 'Invoice deleted');
    }

    // ── GET /api/admin/invoices/ledger ────────────────────────────────────────

    /**
     * Return ledger entries for a client.
     *
     * Query params: client_id (required)
     */
    public function ledger(): never
    {
        $clientId = (int)$this->query('client_id', 0);

        if ($clientId <= 0) {
            $this->error('client_id is required.', 422);
        }

        $entries = $this->invoices->getLedgerByClient($clientId);
        $this->success($entries, 'Ledger entries retrieved');
    }

    // ── POST /api/admin/invoices/:id/payment ─────────────────────────────────

    /**
     * Record a payment against an invoice.
     *
     * Body: { amount, paymentDate?, method?, reference?, billingProfileCode? }
     */
    public function recordPayment(int $id): never
    {
        $invoice = $this->invoices->find($id);
        if ($invoice === null) {
            $this->error('Invoice not found.', 404);
        }

        $body   = $this->getJsonBody();
        $amount = (float)($body['amount'] ?? 0);

        if ($amount <= 0) {
            $this->error('Payment amount must be greater than zero.', 422);
        }

        $actingUser = $this->authUser();

        $this->invoices->addPayment($id, [
            'amount'               => $amount,
            'payment_date'         => $body['paymentDate']         ?? $body['payment_date'] ?? date('Y-m-d'),
            'payment_method'       => $body['method']              ?? $body['payment_method'] ?? null,
            'reference_number'     => $body['reference']           ?? $body['reference_number'] ?? null,
            'billing_profile_code' => $body['billingProfileCode']  ?? $body['billing_profile_code'] ?? null,
            'notes'                => $body['notes']               ?? null,
            'created_by'           => $actingUser ? (int)$actingUser['id'] : null,
        ]);

        $updated = $this->invoices->find($id);
        $this->success($updated, 'Payment recorded');
    }
}
