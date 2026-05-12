<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\BillingFirmModel;

/**
 * CRUD for billing_firms (billing_profile_code on txn).
 */
final class BillingFirmController extends BaseController
{
    private BillingFirmModel $model;

    public function __construct()
    {
        $this->model = new BillingFirmModel();
    }

    /** GET /api/admin/billing-firms */
    public function index(): never
    {
        try {
            $rows = $this->model->all();
        } catch (\PDOException $e) {
            error_log('[BillingFirmController] index: ' . $e->getMessage());
            $this->error('Could not load billing firms.', 500);
        }
        $out = array_map([self::class, 'toApi'], $rows);
        $this->success($out, 'Billing firms retrieved');
    }

    /** POST /api/admin/billing-firms */
    public function store(): never
    {
        $body = $this->getJsonBody();
        $code = strtoupper(trim((string)($body['code'] ?? '')));
        if ($code === '' || strlen($code) > 50) {
            $this->error('A valid code (max 50 chars) is required.', 422);
        }
        if ($this->model->findByCode($code) !== null) {
            $this->error('A billing firm with this code already exists.', 409);
        }
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') {
            $this->error('Firm name is required.', 422);
        }
        $gstReg = self::coerceBoolean($body['gstRegistered'] ?? $body['gst_registered'] ?? false);
        $gstin  = strtoupper(preg_replace('/\s+/', '', (string)($body['gstin'] ?? '')) ?? '');
        $state  = strtoupper(trim((string)($body['stateCode'] ?? $body['state_code'] ?? '')));
        $rate   = self::normalizeGstRate($body['defaultGstRate'] ?? $body['default_gst_rate'] ?? 18);
        if ($gstReg && (strlen($state) !== 2)) {
            $this->error('Enter a 2-digit state code when GST registered.', 422);
        }
        try {
            $row = $this->model->create($code, [
                'name'              => $name,
                'gst_registered'    => $gstReg,
                'gstin'             => $gstReg ? $gstin : '',
                'state_code'        => $gstReg ? substr($state, 0, 2) : '',
                'default_gst_rate'  => $gstReg ? $rate : 18.0,
            ]);
        } catch (\PDOException $e) {
            error_log('[BillingFirmController] store: ' . $e->getMessage());
            $ei = $e->errorInfo ?? [];
            $st = \is_array($ei) ? (string)($ei[0] ?? '') : '';
            if ($st === '23505' || str_contains($e->getMessage(), 'duplicate key')) {
                $this->error('A billing firm with this code already exists.', 409);
            }
            if (str_contains($e->getMessage(), 'billing_firms') && str_contains($e->getMessage(), 'does not exist')) {
                $this->error('Billing firms are not set up on this server. Apply migration 049_billing_firms.', 500);
            }
            $this->error('Could not create billing firm.', 500);
        }
        $this->success(self::toApi($row), 'Billing firm created', 201);
    }

    /** PUT /api/admin/billing-firms/:code */
    public function update(string $code): never
    {
        $code = urldecode($code);
        if ($this->model->findByCode($code) === null) {
            $this->error('Billing firm not found.', 404);
        }
        $body = $this->getJsonBody();
        $data = [];
        if (array_key_exists('name', $body)) {
            $n = trim((string)$body['name']);
            if ($n === '') {
                $this->error('Firm name cannot be empty.', 422);
            }
            $data['name'] = $n;
        }
        if (array_key_exists('gstRegistered', $body) || array_key_exists('gst_registered', $body)) {
            $data['gst_registered'] = self::coerceBoolean($body['gstRegistered'] ?? $body['gst_registered'] ?? false);
        }
        if (array_key_exists('gstin', $body)) {
            $data['gstin'] = strtoupper(preg_replace('/\s+/', '', (string)$body['gstin']) ?? '');
        }
        if (array_key_exists('stateCode', $body) || array_key_exists('state_code', $body)) {
            $data['state_code'] = strtoupper(trim((string)($body['stateCode'] ?? $body['state_code'] ?? '')));
        }
        if (array_key_exists('defaultGstRate', $body) || array_key_exists('default_gst_rate', $body)) {
            $data['default_gst_rate'] = self::normalizeGstRate($body['defaultGstRate'] ?? $body['default_gst_rate']);
        }
        $gstReg = $data['gst_registered'] ?? null;
        if ($gstReg === true && isset($data['state_code']) && strlen($data['state_code']) !== 2) {
            $this->error('State code must be 2 digits when GST registered.', 422);
        }
        if ($data === []) {
            $this->success(self::toApi($this->model->findByCode($code)), 'No changes');
        }
        try {
            $this->model->update($code, $data);
        } catch (\PDOException $e) {
            error_log('[BillingFirmController] update: ' . $e->getMessage());
            $this->error('Could not update billing firm.', 500);
        }
        $row = $this->model->findByCode($code);
        $this->success(self::toApi($row), 'Billing firm updated');
    }

    /** DELETE /api/admin/billing-firms/:code */
    public function destroy(string $code): never
    {
        $code = urldecode($code);
        if ($this->model->findByCode($code) === null) {
            $this->error('Billing firm not found.', 404);
        }
        if ($this->model->countBankAccounts($code) > 0) {
            $this->error('Cannot delete: bank accounts exist for this billing firm.', 409);
        }
        try {
            $this->model->delete($code);
        } catch (\PDOException $e) {
            error_log('[BillingFirmController] destroy: ' . $e->getMessage());
            $this->error('Could not delete billing firm.', 500);
        }
        $this->success(null, 'Billing firm deleted');
    }

    private static function normalizeGstRate(mixed $raw): float
    {
        $r = (float)$raw;
        if (!is_finite($r)) {
            $r = 18.0;
        }
        return min(40.0, max(0.0, $r));
    }

    /** JSON body booleans + PDO/pg returning "t"/"f" for BOOLEAN columns. */
    private static function coerceBoolean(mixed $v): bool
    {
        if (\is_bool($v)) {
            return $v;
        }
        if (\is_int($v) || \is_float($v)) {
            return $v !== 0;
        }
        $s = strtolower(trim((string)$v));
        if ($s === 't' || $s === 'f') {
            return $s === 't';
        }

        return filter_var($v, FILTER_VALIDATE_BOOLEAN);
    }

    /** @param array<string, mixed>|null $row */
    private static function toApi(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $code = (string)$row['code'];
        $rate = (float)($row['default_gst_rate'] ?? 18);
        if (!is_finite($rate)) {
            $rate = 18.0;
        }
        $rate = min(40.0, max(0.0, $rate));
        return [
            'id'             => $code,
            'code'           => $code,
            'name'           => (string)$row['name'],
            'gstRegistered'  => self::coerceBoolean($row['gst_registered'] ?? false),
            'gstin'          => (string)($row['gstin'] ?? ''),
            'stateCode'      => (string)($row['state_code'] ?? ''),
            'defaultGstRate' => $rate,
        ];
    }
}
