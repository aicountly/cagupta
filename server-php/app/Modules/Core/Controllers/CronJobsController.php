<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Config\CronJobs;

/**
 * CronJobsController — Read-only registry of all scheduled CLI scripts.
 *
 * Routes:
 *   GET /api/admin/settings/cron-jobs   → index
 */
class CronJobsController extends BaseController
{
    /**
     * GET /api/admin/settings/cron-jobs
     * Returns the static list of all configured cron jobs with metadata.
     */
    public function index(): never
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }

        $jobs = CronJobs::getAll();

        $this->success($jobs, 'OK', 200, ['total' => count($jobs)]);
    }
}
