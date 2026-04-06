<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Config\Database;
use PDO;

/**
 * DashboardController — aggregate statistics for the dashboard.
 *
 * All endpoints require Bearer token + role: super_admin or admin.
 */
class DashboardController extends BaseController
{
    // ── GET /api/admin/dashboard/stats ───────────────────────────────────────

    /**
     * Return high-level counts for the dashboard stat cards.
     *
     * Response: { activeClients, activeServices, pendingTasks,
     *             totalOutstanding, documentsThisMonth, appointmentsToday }
     */
    public function stats(): never
    {
        $db = Database::getConnection();

        // Active clients (contacts that are active)
        $stmt = $db->query("SELECT COUNT(*) FROM clients WHERE is_active = TRUE");
        $activeClients = (int)$stmt->fetchColumn();

        // Active services (non-completed, non-cancelled)
        $stmt = $db->query("SELECT COUNT(*) FROM services WHERE status NOT IN ('completed','cancelled')");
        $activeServices = (int)$stmt->fetchColumn();

        // Pending tasks — count of non-done task entries across all services
        // tasks is stored as JSONB; count elements with status != 'done'
        $stmt = $db->query(
            "SELECT COALESCE(SUM(
                (SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(tasks, '[]'::jsonb)) t
                 WHERE (t->>'status') IS DISTINCT FROM 'done')
             ), 0)
             FROM services
             WHERE tasks IS NOT NULL AND tasks != 'null'::jsonb"
        );
        $pendingTasks = (int)$stmt->fetchColumn();

        // Total outstanding — sum of (total - amount_paid) for non-paid invoices
        $stmt = $db->query(
            "SELECT COALESCE(SUM(total - amount_paid), 0)
             FROM invoices
             WHERE status NOT IN ('paid','cancelled')"
        );
        $totalOutstanding = (float)$stmt->fetchColumn();

        // Documents uploaded this month
        $stmt = $db->query(
            "SELECT COUNT(*) FROM documents
             WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())"
        );
        $documentsThisMonth = (int)$stmt->fetchColumn();

        // Appointments today
        $stmt = $db->query(
            "SELECT COUNT(*) FROM calendar_events WHERE event_date = CURRENT_DATE"
        );
        $appointmentsToday = (int)$stmt->fetchColumn();

        $this->success([
            'activeClients'      => $activeClients,
            'activeServices'     => $activeServices,
            'pendingTasks'       => $pendingTasks,
            'totalOutstanding'   => $totalOutstanding,
            'documentsThisMonth' => $documentsThisMonth,
            'appointmentsToday'  => $appointmentsToday,
        ], 'Dashboard stats retrieved');
    }
}
