<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\FirmBankAccountModel;

final class FirmBankAccountController extends BaseController
{
    private FirmBankAccountModel $model;

    public function __construct()
    {
        $this->model = new FirmBankAccountModel();
    }

    /** GET /api/admin/firm-bank-accounts */
    public function index(): never
    {
        $code = trim((string)$this->query('billing_firm_code', ''));
        if ($code !== '') {
            $rows = $this->model->listByFirmCode($code, false);
        } else {
            $rows = $this->model->all();
        }
        $this->success(array_map([self::class, 'toApi'], $rows));
    }

    /** POST /api/admin/firm-bank-accounts */
    public function store(): never
    {
        $body = $this->getJsonBody();
        $bf   = trim((string)($body['billing_firm_code'] ?? $body['billingFirmCode'] ?? ''));
        $name = trim((string)($body['name'] ?? ''));
        $type = strtolower(trim((string)($body['account_type'] ?? $body['accountType'] ?? 'bank')));
        if ($bf === '' || $name === '') {
            $this->error('billing_firm_code and name are required.', 422);
        }
        if (!in_array($type, ['bank', 'cash'], true)) {
            $this->error('account_type must be bank or cash.', 422);
        }
        [$obAmount, $obType] = self::parseOpeningBalanceFields($body);
        $row = $this->model->create([
            'billing_firm_code'     => strtoupper($bf),
            'name'                  => $name,
            'account_type'          => $type,
            'currency'              => (string)($body['currency'] ?? 'INR'),
            'is_active'             => !isset($body['is_active']) || !empty($body['is_active']) || !empty($body['isActive']),
            'opening_balance'       => $obAmount,
            'opening_balance_type'  => $obType,
            'opening_balance_date'  => $body['opening_balance_date'] ?? $body['openingBalanceDate'] ?? null,
            'account_number_last4'  => $body['account_number_last4'] ?? $body['accountNumberLast4'] ?? null,
            'ifsc'                  => $body['ifsc'] ?? null,
            'notes'                 => $body['notes'] ?? null,
        ]);
        $this->success(self::toApi($row), 'Bank account created', 201);
    }

    /** PUT /api/admin/firm-bank-accounts/:id */
    public function update(int $id): never
    {
        $existing = $this->model->find($id);
        if ($existing === null) {
            $this->error('Bank account not found.', 404);
        }
        $body = $this->getJsonBody();
        if (!$this->canManageFirmBankAccounts()) {
            $body = $this->openingBalanceOnlyBody($body, $existing);
            if ($body === []) {
                $this->error('Access denied. You may only update opening balance.', 403);
            }
        }
        $data = [];
        if (isset($body['name'])) {
            $data['name'] = trim((string)$body['name']);
        }
        if (isset($body['account_type']) || isset($body['accountType'])) {
            $t = strtolower(trim((string)($body['account_type'] ?? $body['accountType'])));
            if (!in_array($t, ['bank', 'cash'], true)) {
                $this->error('account_type must be bank or cash.', 422);
            }
            $data['account_type'] = $t;
        }
        if (array_key_exists('is_active', $body) || array_key_exists('isActive', $body)) {
            $data['is_active'] = !empty($body['is_active']) || !empty($body['isActive']);
        }
        if (self::bodyHasOpeningBalanceFields($body)) {
            [$obAmount, $obType] = self::parseOpeningBalanceFields($body, $existing);
            $data['opening_balance']      = $obAmount;
            $data['opening_balance_type'] = $obType;
        }
        if (array_key_exists('opening_balance_date', $body) || array_key_exists('openingBalanceDate', $body)) {
            $data['opening_balance_date'] = $body['opening_balance_date'] ?? $body['openingBalanceDate'];
        }
        if (array_key_exists('account_number_last4', $body) || array_key_exists('accountNumberLast4', $body)) {
            $data['account_number_last4'] = $body['account_number_last4'] ?? $body['accountNumberLast4'];
        }
        if (array_key_exists('ifsc', $body)) {
            $data['ifsc'] = $body['ifsc'];
        }
        if (array_key_exists('notes', $body)) {
            $data['notes'] = $body['notes'];
        }
        if ($data === []) {
            $this->success(self::toApi($this->model->find($id)));
        }
        $this->model->update($id, $data);
        $this->success(self::toApi($this->model->find($id)), 'Updated');
    }

    /** DELETE /api/admin/firm-bank-accounts/:id */
    public function destroy(int $id): never
    {
        if ($this->model->find($id) === null) {
            $this->error('Bank account not found.', 404);
        }
        if ($this->model->countTxnReferences($id) > 0) {
            $this->error('Cannot delete: transactions reference this account.', 409);
        }
        $this->model->delete($id);
        $this->success(null, 'Deleted');
    }

    /** Staff with invoices.edit may adjust opening balance only; settings.view may change any field. */
    private function canManageFirmBankAccounts(): bool
    {
        return $this->userHasPermission($this->authUser(), 'settings.view');
    }

    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    private function openingBalanceOnlyBody(array $body, array $existing): array
    {
        $allowed = [];
        if (self::bodyHasOpeningBalanceFields($body)) {
            [$obAmount, $obType] = self::parseOpeningBalanceFields($body, $existing);
            $allowed['opening_balance']      = $obAmount;
            $allowed['opening_balance_type'] = $obType;
        }
        if (array_key_exists('opening_balance_date', $body) || array_key_exists('openingBalanceDate', $body)) {
            $allowed['opening_balance_date'] = $body['opening_balance_date'] ?? $body['openingBalanceDate'];
        }

        return $allowed;
    }

    /** @param array<string, mixed> $body */
    private static function bodyHasOpeningBalanceFields(array $body): bool
    {
        return array_key_exists('opening_balance', $body)
            || array_key_exists('openingBalance', $body)
            || array_key_exists('opening_balance_type', $body)
            || array_key_exists('openingBalanceType', $body)
            || array_key_exists('type', $body);
    }

    /**
     * @param array<string, mixed>      $body
     * @param array<string, mixed>|null $existing
     * @return array{0: float, 1: string}
     */
    private static function parseOpeningBalanceFields(array $body, ?array $existing = null): array
    {
        $hasAmount = array_key_exists('opening_balance', $body) || array_key_exists('openingBalance', $body);
        $hasType   = array_key_exists('opening_balance_type', $body)
            || array_key_exists('openingBalanceType', $body)
            || array_key_exists('type', $body);

        if ($existing !== null) {
            $amount = $hasAmount
                ? abs((float)($body['opening_balance'] ?? $body['openingBalance']))
                : abs((float)($existing['opening_balance'] ?? 0));
            $typeRaw = $hasType
                ? ($body['opening_balance_type'] ?? $body['openingBalanceType'] ?? $body['type'])
                : ($existing['opening_balance_type'] ?? 'debit');
        } else {
            $amount  = abs((float)($body['opening_balance'] ?? $body['openingBalance'] ?? 0));
            $typeRaw = $body['opening_balance_type']
                ?? $body['openingBalanceType']
                ?? $body['type']
                ?? 'debit';
        }

        return [$amount, FirmBankAccountModel::normalizeOpeningBalanceType((string)$typeRaw)];
    }

    /**
     * @param array<string, mixed>|null $acting
     */
    private function userHasPermission(?array $acting, string $permission): bool
    {
        if ($acting === null) {
            return false;
        }
        $permissions = $acting['role_permissions_array'] ?? [];
        if (in_array('*', $permissions, true)) {
            return true;
        }

        return in_array($permission, $permissions, true);
    }

    /** @param array<string, mixed> $row */
    private static function toApi(array $row): array
    {
        return [
            'id'                  => (int)$row['id'],
            'billingFirmCode'     => (string)$row['billing_firm_code'],
            'billingFirmName'     => (string)($row['billing_firm_name'] ?? ''),
            'name'                => (string)$row['name'],
            'accountType'         => (string)$row['account_type'],
            'currency'            => (string)($row['currency'] ?? 'INR'),
            'isActive'            => (bool)($row['is_active'] ?? true),
            'openingBalance'      => abs((float)($row['opening_balance'] ?? 0)),
            'openingBalanceType'  => FirmBankAccountModel::normalizeOpeningBalanceType($row['opening_balance_type'] ?? 'debit'),
            'openingBalanceDate'  => $row['opening_balance_date'] ?? null,
            'accountNumberLast4'  => $row['account_number_last4'] ?? null,
            'ifsc'                => $row['ifsc'] ?? null,
            'notes'               => $row['notes'] ?? null,
        ];
    }
}
