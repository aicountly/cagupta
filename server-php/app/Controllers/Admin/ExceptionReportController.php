<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\ClientModel;
use App\Models\OrganizationModel;

/**
 * Read-only exception lists for incomplete contact / organization master data.
 */
class ExceptionReportController extends BaseController
{
    // ── GET /api/admin/reports/contact-exceptions ────────────────────────────

    public function contactExceptions(): never
    {
        $allowed = ClientModel::exceptionReportAllowedKeys();
        $missing = $this->parseMissingKeys((string)$this->query('missing', ''), $allowed);
        if ($missing === []) {
            $this->error('Provide at least one `missing` field (allowed: ' . implode(', ', $allowed) . ').', 400);
        }

        $page       = max(1, (int)$this->query('page', 1));
        $perPage    = min(100, max(1, (int)$this->query('per_page', 20)));
        $activeOnly = !$this->queryFlagIncludeInactive();

        $model  = new ClientModel();
        $result = $model->exceptionPaginate($page, $perPage, $missing, $activeOnly);

        $this->success($result['rows'], 'Contact exceptions', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => $result['total'] > 0 ? (int)ceil($result['total'] / $perPage) : 1,
            ],
            'missing_applied' => $missing,
        ]);
    }

    // ── GET /api/admin/reports/organization-exceptions ─────────────────────

    public function organizationExceptions(): never
    {
        $allowed = OrganizationModel::exceptionReportAllowedKeys();
        $missing = $this->parseMissingKeys((string)$this->query('missing', ''), $allowed);
        if ($missing === []) {
            $this->error('Provide at least one `missing` field (allowed: ' . implode(', ', $allowed) . ').', 400);
        }

        $page       = max(1, (int)$this->query('page', 1));
        $perPage    = min(100, max(1, (int)$this->query('per_page', 20)));
        $activeOnly = !$this->queryFlagIncludeInactive();

        $model  = new OrganizationModel();
        $result = $model->exceptionPaginate($page, $perPage, $missing, $activeOnly);

        $this->success($result['rows'], 'Organization exceptions', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => $result['total'] > 0 ? (int)ceil($result['total'] / $perPage) : 1,
            ],
            'missing_applied' => $missing,
        ]);
    }

    /**
     * @param list<string> $allowed
     *
     * @return list<string>
     */
    private function parseMissingKeys(string $raw, array $allowed): array
    {
        $parts = preg_split('/[\s,]+/', strtolower(trim($raw)), -1, PREG_SPLIT_NO_EMPTY);
        if ($parts === false) {
            return [];
        }
        $out = [];
        foreach ($parts as $p) {
            if (in_array($p, $allowed, true) && !in_array($p, $out, true)) {
                $out[] = $p;
            }
        }

        return $out;
    }

    private function queryFlagIncludeInactive(): bool
    {
        $v = $this->query('include_inactive', '');
        if ($v === null || $v === '') {
            return false;
        }
        $s = strtolower(trim((string)$v));

        return in_array($s, ['1', 'true', 'yes', 'on'], true);
    }
}
