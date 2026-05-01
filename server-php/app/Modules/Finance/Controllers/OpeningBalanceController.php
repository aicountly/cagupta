<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\OpeningBalanceModel;

/**
 * OpeningBalanceController — GET and POST/PUT opening balances per client
 * per billing profile.
 *
 * All endpoints require Bearer token + role: super_admin or admin.
 */
class OpeningBalanceController extends BaseController
{
    private OpeningBalanceModel $model;

    public function __construct()
    {
        $this->model = new OpeningBalanceModel();
    }

    // ── GET /api/admin/opening-balances?client_id=X ──────────────────────────

    /**
     * Return all opening balances for a client.
     *
     * Query params: client_id (required)
     */
    public function index(): never
    {
        $clientId = (int)$this->query('client_id', 0);

        if ($clientId <= 0) {
            $this->error('client_id is required.', 422);
        }

        $rows = $this->model->forClient($clientId);
        $this->success($rows, 'Opening balances retrieved');
    }

    // ── POST /api/admin/opening-balances ─────────────────────────────────────

    /**
     * Upsert an opening balance for a client + billing profile.
     *
     * Body: { client_id, billing_profile_code, amount, type (debit|credit) }
     */
    public function store(): never
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

        $row = $this->model->upsert($clientId, $profileCode, $amount, $type);
        $this->success($row, 'Opening balance saved', 200);
    }

    // ── DELETE /api/admin/opening-balances ───────────────────────────────────

    /**
     * Delete an opening balance.
     *
     * Query params: client_id, billing_profile_code
     */
    public function destroy(): never
    {
        $clientId    = (int)$this->query('client_id', 0);
        $profileCode = trim((string)$this->query('billing_profile_code', ''));

        if ($clientId <= 0 || $profileCode === '') {
            $this->error('client_id and billing_profile_code are required.', 422);
        }

        $this->model->delete($clientId, $profileCode);
        $this->success(null, 'Opening balance deleted');
    }
}
