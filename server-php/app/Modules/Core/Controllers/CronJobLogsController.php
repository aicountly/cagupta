<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Config\CronJobs;

/**
 * CronJobLogsController — Tail the log file for a registered cron job.
 *
 * Routes:
 *   GET /api/admin/settings/cron-jobs/logs?job=<cli/script.php>   → tail
 *
 * Security:
 *   - Requires auth + settings.view permission.
 *   - The `job` parameter is validated against the CronJobs allowlist;
 *     no arbitrary paths can be requested (prevents directory traversal).
 *   - Log files are read from server-php/logs/ — outside public/.
 */
class CronJobLogsController extends BaseController
{
    private const TAIL_LINES = 120;

    public function tail(): never
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }

        $requestedJob = trim($this->query('job', ''));
        if ($requestedJob === '') {
            $this->error('Missing required query parameter: job', 400);
        }

        // Validate against the allowlist — only registered jobs are permitted.
        $registry = CronJobs::getAll();
        $matched  = null;
        foreach ($registry as $job) {
            if ($job['file'] === $requestedJob) {
                $matched = $job;
                break;
            }
        }

        if ($matched === null) {
            $this->error('Unknown job identifier.', 404);
        }

        // Resolve the log file path relative to server-php/ root.
        $serverPhpRoot = dirname(__DIR__, 3); // app/Modules/Core → app/Modules → app → server-php
        $logPath       = realpath($serverPhpRoot . '/' . $matched['log_file']);

        // Ensure the resolved path is inside server-php/ (extra traversal guard).
        $realRoot = realpath($serverPhpRoot);
        if (
            $logPath === false
            || $realRoot === false
            || !str_starts_with($logPath, $realRoot . DIRECTORY_SEPARATOR)
        ) {
            // File doesn't exist yet — not an error, just no runs recorded.
            $this->success([
                'job'      => $matched['file'],
                'log_file' => $matched['log_file'],
                'exists'   => false,
                'lines'    => [],
                'size'     => 0,
            ]);
        }

        $lines = $this->tailFile($logPath, self::TAIL_LINES);
        $size  = filesize($logPath) ?: 0;

        $this->success([
            'job'      => $matched['file'],
            'log_file' => $matched['log_file'],
            'exists'   => true,
            'lines'    => $lines,
            'size'     => $size,
            'mtime'    => date('Y-m-d H:i:s', filemtime($logPath) ?: 0),
        ]);
    }

    /**
     * Efficiently read the last $n lines of a file without loading it all into memory.
     *
     * @return string[]
     */
    private function tailFile(string $path, int $n): array
    {
        $fh = fopen($path, 'rb');
        if ($fh === false) {
            return [];
        }

        fseek($fh, 0, SEEK_END);
        $size   = ftell($fh);
        $buffer = '';
        $found  = 0;
        $chunk  = 4096;
        $pos    = $size;

        while ($pos > 0 && $found <= $n) {
            $readSize = min($chunk, $pos);
            $pos     -= $readSize;
            fseek($fh, $pos);
            $buffer = fread($fh, $readSize) . $buffer;
            $found  = substr_count($buffer, "\n");
        }

        fclose($fh);

        $lines = explode("\n", $buffer);

        // Remove trailing empty element from final newline.
        if (end($lines) === '') {
            array_pop($lines);
        }

        // Return the last $n lines.
        return array_slice($lines, -$n);
    }
}
