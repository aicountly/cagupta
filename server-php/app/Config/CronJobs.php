<?php
declare(strict_types=1);

namespace App\Config;

/**
 * Static registry of all scheduled CLI scripts (cron jobs).
 *
 * Add a new entry here whenever a new CLI script is created, and configure
 * the matching cPanel cron to redirect output to the log_file path:
 *
 *   php /home/<user>/public_html/api/cli/<script>.php \
 *       >> /home/<user>/public_html/api/logs/<name>.log 2>&1
 *
 * Fields:
 *   file        — Script path relative to server-php/ (e.g. cli/send-digest.php)
 *   log_file    — Log file path relative to server-php/ (e.g. logs/digest.log)
 *   cron        — Standard 5-field cron expression configured in cPanel
 *   frequency   — Human-readable frequency (e.g. "Daily", "Hourly")
 *   timing      — Human-readable time description (e.g. "5:00 AM daily")
 *   category    — Grouping label: "notification", "maintenance", "report", "marketing"
 *   purpose     — One-sentence description of what the script does
 */
class CronJobs
{
    /**
     * @return array<int, array{file:string, log_file:string, cron:string, frequency:string, timing:string, category:string, purpose:string}>
     */
    public static function getAll(): array
    {
        return [
            [
                'file'      => 'cli/send-digest.php',
                'log_file'  => 'logs/digest.log',
                'cron'      => '30 17 * * *',
                'frequency' => 'Daily',
                'timing'    => '5:30 PM daily',
                'category'  => 'report',
                'purpose'   => 'Compiles previous-day activity from the superadmin_digest_queue into a single HTML email and sends it to the super admin via Brevo.',
            ],
            [
                'file'      => 'cli/send-superadmin-timesheet-report.php',
                'log_file'  => 'logs/superadmin-timesheet.log',
                'cron'      => '0 5 * * *',
                'frequency' => 'Daily',
                'timing'    => '5:00 AM daily',
                'category'  => 'report',
                'purpose'   => 'Emails the super admin a consolidated timesheet report for the previous day, flagging users below their daily shift target and showing overtime stats.',
            ],
            [
                'file'      => 'cli/send-timesheet-intimation.php',
                'log_file'  => 'logs/timesheet-intimation.log',
                'cron'      => '0 6 * * *',
                'frequency' => 'Daily',
                'timing'    => '6:00 AM daily',
                'category'  => 'notification',
                'purpose'   => 'Sends an individual email intimation to each active user whose previous-day punched time falls below the daily target (default: 510 minutes).',
            ],
            [
                'file'      => 'cli/notify-superadmin-unbilled-stale.php',
                'log_file'  => 'logs/unbilled-stale.log',
                'cron'      => '0 0,12 * * *',
                'frequency' => 'Twice daily',
                'timing'    => '12:00 AM and 12:00 PM',
                'category'  => 'notification',
                'purpose'   => 'Alerts the super admin by email if any service engagement has remained in billing_closure = open for 48 hours or more since billing_open_since.',
            ],
            [
                'file'      => 'cli/notify-unbilled-accounts.php',
                'log_file'  => 'logs/unbilled-accounts.log',
                'cron'      => '0 0,12 * * *',
                'frequency' => 'Twice daily',
                'timing'    => '12:00 AM and 12:00 PM',
                'category'  => 'notification',
                'purpose'   => 'Emails users in the Accounts role a list of service engagements that are still in billing_closure = open, prompting them to action billing closures.',
            ],
            [
                'file'      => 'cli/notify-associate-payout-cycle-sla.php',
                'log_file'  => 'logs/associate-payout-sla.log',
                'cron'      => '0 9 * * *',
                'frequency' => 'Daily',
                'timing'    => '9:00 AM daily',
                'category'  => 'notification',
                'purpose'   => 'Creates in-app SLA reminder notifications for associate payout cycles that have been finalised but not yet disbursed, based on the 3-day disbursal SLA from period_end.',
            ],
            [
                'file'      => 'cli/notify-partner-payout-cycle-sla.php',
                'log_file'  => 'logs/partner-payout-sla.log',
                'cron'      => '0 9 * * *',
                'frequency' => 'Daily',
                'timing'    => '9:00 AM daily',
                'category'  => 'notification',
                'purpose'   => 'Creates in-app SLA reminder notifications for partner payout cycles that have been finalised but not yet disbursed, mirroring the associate SLA logic.',
            ],
            [
                'file'      => 'cli/notify-invoice-cost-variance-yesterday.php',
                'log_file'  => 'logs/invoice-cost-variance.log',
                'cron'      => '5 0 * * *',
                'frequency' => 'Daily',
                'timing'    => '12:05 AM daily (after midnight)',
                'category'  => 'report',
                'purpose'   => "Emails the super admin a list of yesterday's invoice rows where billed hours were below the standard allowable hours or below the calculated cost value (cost-variance alerts).",
            ],
            [
                'file'      => 'cli/send-client-engagement-digest.php',
                'log_file'  => 'logs/client-engagement-digest.log',
                'cron'      => '0 8 * * 0',
                'frequency' => 'Weekly',
                'timing'    => '8:00 AM every Sunday',
                'category'  => 'report',
                'purpose'   => 'Sends a weekend digest email highlighting client groups with large meeting gaps and material trailing billing, to prompt engagement review at the start of the week.',
            ],
            [
                'file'      => 'cli/purge-work-hold-windows.php',
                'log_file'  => 'logs/purge-work-hold.log',
                'cron'      => '0 * * * *',
                'frequency' => 'Hourly',
                'timing'    => 'Every hour',
                'category'  => 'maintenance',
                'purpose'   => 'Deletes expired work-hold window exception rows (exception_kind = window, expires_at <= now) to keep the exceptions table clean.',
            ],
            [
                'file'      => 'cli/blog_ai_generate.php',
                'log_file'  => 'logs/blog-ai.log',
                'cron'      => '0 6 * * *',
                'frequency' => 'Daily',
                'timing'    => '6:00 AM daily',
                'category'  => 'marketing',
                'purpose'   => 'Calls OpenAI GPT and DALL-E to generate pending blog draft rows for the Laws & Provisions and Tax Saving categories in blog_ai_drafts, reviewed via Blog AI Approvals before publishing.',
            ],
            [
                'file'      => 'cli/blog_ai_generate_ai_promotions.php',
                'log_file'  => 'logs/blog-ai-ai-promotions.log',
                'cron'      => '10 6 * * *',
                'frequency' => 'Daily',
                'timing'    => '6:10 AM daily',
                'category'  => 'marketing',
                'purpose'   => 'Calls OpenAI GPT and DALL-E to generate pending blog draft rows for the AI Promotions category, covering AI tools, automation, and government AI initiatives for Indian businesses.',
            ],
            [
                'file'      => 'cli/blog_ai_generate_subsidies_promotions.php',
                'log_file'  => 'logs/blog-ai-subsidies-promotions.log',
                'cron'      => '20 6 * * *',
                'frequency' => 'Daily',
                'timing'    => '6:20 AM daily',
                'category'  => 'marketing',
                'purpose'   => 'Calls OpenAI GPT and DALL-E to generate pending blog draft rows for the Subsidies Promotions category, covering government subsidies, grants, and incentive schemes for Indian MSMEs and startups.',
            ],
            [
                'file'      => 'cli/blog_ai_generate_funding_promotions.php',
                'log_file'  => 'logs/blog-ai-funding-promotions.log',
                'cron'      => '30 6 * * *',
                'frequency' => 'Daily',
                'timing'    => '6:30 AM daily',
                'category'  => 'marketing',
                'purpose'   => 'Calls OpenAI GPT and DALL-E to generate pending blog draft rows for the Funding Promotions category, covering fundraising, investor funding rounds, and government-backed funding for Indian startups and SMEs.',
            ],
        ];
    }
}
