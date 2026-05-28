<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Database;
use App\Controllers\BaseController;
use App\Libraries\OfficeWorkingDays;

/**
 * Office calendar settings — weekly off days and holidays for shift-target math.
 *
 * GET    /api/admin/settings/office-calendar
 * PUT    /api/admin/settings/office-calendar
 * POST   /api/admin/settings/office-calendar/holidays
 * DELETE /api/admin/settings/office-calendar/holidays/:id
 */
class OfficeCalendarController extends BaseController
{
    private ?\PDO $db = null;

    private function db(): \PDO
    {
        if ($this->db === null) {
            $this->db = Database::getConnection();
        }

        return $this->db;
    }

    // ── GET /api/admin/settings/office-calendar ───────────────────────────────

    public function show(): never
    {
        $pdo = $this->db();
        $from = trim((string)$this->query('from', ''));
        $to = trim((string)$this->query('to', ''));
        $fromParam = $from !== '' && OfficeWorkingDays::isValidYmd($from) ? $from : null;
        $toParam = $to !== '' && OfficeWorkingDays::isValidYmd($to) ? $to : null;

        $settings = OfficeWorkingDays::getSettings($pdo);
        $mask = (int)$settings['weekly_off_days'];

        $this->success([
            'weekly_off_days'       => $mask,
            'weekly_off_labels'     => OfficeWorkingDays::weeklyOffLabels($mask),
            'weekday_options'       => OfficeWorkingDays::WEEKDAY_OPTIONS,
            'holidays'              => OfficeWorkingDays::listHolidays($pdo, $fromParam, $toParam),
        ], 'Office calendar retrieved');
    }

    // ── PUT /api/admin/settings/office-calendar ─────────────────────────────

    public function update(): never
    {
        $body = $this->getJsonBody();
        $raw = $body['weekly_off_days'] ?? $body['weeklyOffDays'] ?? null;
        if ($raw === null) {
            $this->error('weekly_off_days is required.', 422);
        }

        try {
            $mask = OfficeWorkingDays::normalizeWeeklyOffInput($raw);
            OfficeWorkingDays::assertAtLeastOneWorkingDay($mask);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        $actor = $this->authUser();
        $userId = $actor ? (int)$actor['id'] : null;

        try {
            $settings = OfficeWorkingDays::updateSettings($this->db(), $mask, $userId);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        $updatedMask = (int)$settings['weekly_off_days'];
        $this->success([
            'weekly_off_days'   => $updatedMask,
            'weekly_off_labels' => OfficeWorkingDays::weeklyOffLabels($updatedMask),
        ], 'Office calendar updated');
    }

    // ── POST /api/admin/settings/office-calendar/holidays ───────────────────

    public function storeHoliday(): never
    {
        $body = $this->getJsonBody();
        $date = trim((string)($body['holiday_date'] ?? $body['date'] ?? ''));
        $name = trim((string)($body['name'] ?? ''));

        $actor = $this->authUser();
        $userId = $actor ? (int)$actor['id'] : null;

        try {
            $holiday = OfficeWorkingDays::addHoliday($this->db(), $date, $name, $userId);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }

        $this->success($holiday, 'Holiday added', 201);
    }

    // ── DELETE /api/admin/settings/office-calendar/holidays/:id ───────────────

    public function destroyHoliday(int $id): never
    {
        if ($id <= 0) {
            $this->error('Invalid holiday id.', 422);
        }
        if (!OfficeWorkingDays::deleteHoliday($this->db(), $id)) {
            $this->error('Holiday not found.', 404);
        }
        $this->success(null, 'Holiday removed');
    }
}
