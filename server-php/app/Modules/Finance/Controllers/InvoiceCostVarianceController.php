<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Auth as AuthConfig;
use App\Controllers\BaseController;
use App\Libraries\InvoiceCostAnalysis;
use App\Models\TxnModel;

/**
 * Invoice cost-analysis preview (raise invoice UI) and variance report (Accounts / Super Admin).
 */
final class InvoiceCostVarianceController extends BaseController
{
    /** POST /api/admin/invoices/cost-analysis-preview */
    public function preview(): never
    {
        $acting = $this->authUser();
        if ($acting === null) {
            $this->error('Unauthorized.', 401);
        }
        if (!$this->hasInvoiceCreateAccess($acting)) {
            $this->error('Access denied.', 403);
        }

        $body     = $this->getJsonBody();
        $analysis = InvoiceCostAnalysis::analyzeInvoiceBody($body);
        $this->success([
            'analysis'   => $analysis,
            'violations' => InvoiceCostAnalysis::validationViolations($analysis),
        ]);
    }

    /** GET /api/admin/invoices/cost-variance-report?date_from=&date_to= */
    public function varianceReport(): never
    {
        $acting = $this->authUser();
        if ($acting === null) {
            $this->error('Unauthorized.', 401);
        }
        if (!$this->mayViewVarianceReport($acting)) {
            $this->error('Access denied.', 403);
        }

        $from = trim((string)$this->query('date_from', ''));
        $to   = trim((string)$this->query('date_to', ''));
        if ($from === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
            $this->error('date_from (YYYY-MM-DD) is required.', 422);
        }
        if ($to === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
            $this->error('date_to (YYYY-MM-DD) is required.', 422);
        }

        $rows = (new TxnModel())->listInvoiceCostVarianceRows($from, $to);
        $this->success($rows);
    }

    /** @param array<string, mixed> $acting */
    private function hasInvoiceCreateAccess(array $acting): bool
    {
        $email = strtolower(trim((string)($acting['email'] ?? '')));
        if ($email !== '' && $email === strtolower(AuthConfig::SUPER_ADMIN_EMAIL)) {
            return true;
        }
        $role = strtolower(trim((string)($acting['role_name'] ?? '')));
        if (in_array($role, ['super_admin', 'admin'], true)) {
            return true;
        }
        $permissions = $acting['role_permissions_array'] ?? [];
        if (in_array('*', $permissions, true)) {
            return true;
        }

        return in_array('invoices.create', $permissions, true);
    }

    /** @param array<string, mixed> $acting */
    private function mayViewVarianceReport(array $acting): bool
    {
        $email = strtolower(trim((string)($acting['email'] ?? '')));
        if ($email !== '' && $email === strtolower(AuthConfig::SUPER_ADMIN_EMAIL)) {
            return true;
        }
        $role = strtolower(trim((string)($acting['role_name'] ?? '')));

        return in_array($role, ['super_admin', 'accounts'], true);
    }
}
