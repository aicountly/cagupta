<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\AppointmentFeeRuleModel;

/**
 * CRUD for appointment fee rule templates.
 */
class AppointmentFeeRuleController extends BaseController
{
    private AppointmentFeeRuleModel $rules;

    public function __construct()
    {
        $this->rules = new AppointmentFeeRuleModel();
    }

    /** GET /api/admin/appointment-fee-rules */
    public function index(): never
    {
        $all = trim((string)$this->query('all', '')) === '1';
        $rows = $all ? $this->rules->listAll() : $this->rules->listActive();
        $this->success($rows, 'Fee rules retrieved');
    }

    /** GET /api/admin/appointment-fee-rules/:id */
    public function show(int $id): never
    {
        $row = $this->rules->find($id);
        if ($row === null) {
            $this->error('Fee rule not found.', 404);
        }
        $this->success($row);
    }

    /** POST /api/admin/appointment-fee-rules */
    public function store(): never
    {
        $body = $this->getJsonBody();
        $name  = trim((string)($body['name'] ?? ''));
        $model = trim((string)($body['pricing_model'] ?? ''));
        if ($name === '') {
            $this->error('name is required.', 422);
        }
        if (!in_array($model, ['fixed_meeting', 'per_hour'], true)) {
            $this->error('pricing_model must be fixed_meeting or per_hour.', 422);
        }
        $amount = (float)($body['amount'] ?? 0);
        if ($amount < 0) {
            $this->error('amount cannot be negative.', 422);
        }
        $lk = trim((string)($body['default_line_kind'] ?? 'professional_fee'));
        if (!in_array($lk, ['professional_fee', 'cost_recovery'], true)) {
            $this->error('default_line_kind must be professional_fee or cost_recovery.', 422);
        }

        $id = $this->rules->create([
            'name'                          => $name,
            'pricing_model'                 => $model,
            'amount'                        => $amount,
            'default_billing_profile_code'  => $body['default_billing_profile_code'] ?? null,
            'default_line_description'      => $body['default_line_description'] ?? null,
            'default_line_kind'             => $lk,
            'is_active'                     => $body['is_active'] ?? true,
        ]);
        $this->success($this->rules->find($id), 'Fee rule created', 201);
    }

    /** PUT /api/admin/appointment-fee-rules/:id */
    public function update(int $id): never
    {
        if ($this->rules->find($id) === null) {
            $this->error('Fee rule not found.', 404);
        }
        $body = $this->getJsonBody();
        if (isset($body['pricing_model'])) {
            $m = trim((string)$body['pricing_model']);
            if (!in_array($m, ['fixed_meeting', 'per_hour'], true)) {
                $this->error('pricing_model must be fixed_meeting or per_hour.', 422);
            }
            $body['pricing_model'] = $m;
        }
        $this->rules->update($id, $body);
        $this->success($this->rules->find($id), 'Fee rule updated');
    }

    /** DELETE /api/admin/appointment-fee-rules/:id */
    public function destroy(int $id): never
    {
        if ($this->rules->find($id) === null) {
            $this->error('Fee rule not found.', 404);
        }
        $this->rules->delete($id);
        $this->success(null, 'Fee rule deleted');
    }
}
