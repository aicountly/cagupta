<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\ClientEngagementGapModel;
use App\Models\MemorandumRevenueModel;

final class ClientEngagementReportController extends BaseController
{
    /** GET /api/admin/settings/memorandum-revenue-types */
    public function memorandumIndex(): never
    {
        $u = $this->authUser();
        if ($u === null) {
            $this->error('Unauthorized.', 401);
        }
        $p = $u['role_permissions_array'] ?? [];
        if (!in_array('*', $p, true) && !in_array('settings.view', $p, true)) {
            $this->error('Forbidden', 403);
        }
        $this->success(['engagement_type_ids' => (new MemorandumRevenueModel())->listEngagementTypeIds()]);
    }

    /** PUT /api/admin/settings/memorandum-revenue-types */
    public function memorandumUpdate(): never
    {
        $u = $this->authUser();
        if ($u === null) {
            $this->error('Unauthorized.', 401);
        }
        $p = $u['role_permissions_array'] ?? [];
        if (!in_array('*', $p, true) && !in_array('settings.view', $p, true)) {
            $this->error('Forbidden', 403);
        }
        $body = $this->getJsonBody();
        $ids  = $body['engagement_type_ids'] ?? [];
        if (!is_array($ids)) {
            $ids = [];
        }
        (new MemorandumRevenueModel())->replaceAll($ids);
        $this->success(['engagement_type_ids' => (new MemorandumRevenueModel())->listEngagementTypeIds()]);
    }

    /** GET /api/admin/reports/client-engagement-gaps */
    public function gaps(): never
    {
        $u = $this->authUser();
        if ($u === null) {
            $this->error('Unauthorized.', 401);
        }
        $p = $u['role_permissions_array'] ?? [];
        if (!in_array('*', $p, true) && !in_array('clients.view', $p, true)) {
            $this->error('Forbidden', 403);
        }
        $minBill = (float)$this->query('min_billing', 0);
        $minGap  = max(0, (int)$this->query('min_gap_days', 0));
        $groupId = max(0, (int)$this->query('group_id', 0));
        $from    = trim((string)$this->query('from', ''));
        $to      = trim((string)$this->query('to', ''));
        if ($from === '' || $to === '') {
            $to = date('Y-m-d');
            $from = date('Y-m-d', strtotime('-12 months'));
        }
        $rows = (new ClientEngagementGapModel())->buildReport($from, $to, $minBill, $minGap, $groupId);
        $this->success($rows, 'OK', 200, ['period' => ['from' => $from, 'to' => $to]]);
    }
}
