<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Firm-wide working-day rules for shift-target math (weekly off + holidays).
 */
final class OfficeWorkingDays
{
    /** Sun=1, Mon=2, Tue=4, Wed=8, Thu=16, Fri=32, Sat=64 */
    public const DAY_SUN = 1;
    public const DAY_MON = 2;
    public const DAY_TUE = 4;
    public const DAY_WED = 8;
    public const DAY_THU = 16;
    public const DAY_FRI = 32;
    public const DAY_SAT = 64;

    /** Default when table missing: Sunday only. */
    private const FALLBACK_WEEKLY_OFF = self::DAY_SUN;

    /** @var list<array{value: int, label: string, dow: int}> dow = PHP date('w') 0=Sun */
    public const WEEKDAY_OPTIONS = [
        ['value' => self::DAY_SUN, 'label' => 'Sunday',    'dow' => 0],
        ['value' => self::DAY_MON, 'label' => 'Monday',    'dow' => 1],
        ['value' => self::DAY_TUE, 'label' => 'Tuesday',   'dow' => 2],
        ['value' => self::DAY_WED, 'label' => 'Wednesday', 'dow' => 3],
        ['value' => self::DAY_THU, 'label' => 'Thursday',  'dow' => 4],
        ['value' => self::DAY_FRI, 'label' => 'Friday',    'dow' => 5],
        ['value' => self::DAY_SAT, 'label' => 'Saturday',  'dow' => 6],
    ];

    /**
     * @return array{weekly_off_days: int}
     */
    public static function getSettings(\PDO $pdo): array
    {
        try {
            $row = $pdo->query(
                'SELECT weekly_off_days FROM office_calendar_settings ORDER BY id ASC LIMIT 1'
            )->fetch(\PDO::FETCH_ASSOC);
            if (is_array($row)) {
                return [
                    'weekly_off_days' => self::normalizeWeeklyOffMask((int)($row['weekly_off_days'] ?? 0)),
                ];
            }
        } catch (\Throwable) {
            // Table may not exist before migration.
        }

        return ['weekly_off_days' => self::FALLBACK_WEEKLY_OFF];
    }

    /**
     * @return list<array{id: int, holiday_date: string, name: string, created_at: string|null}>
     */
    public static function listHolidays(\PDO $pdo, ?string $from = null, ?string $to = null): array
    {
        $where = ['1=1'];
        $params = [];
        if ($from !== null && self::isValidYmd($from)) {
            $where[] = 'holiday_date >= :from';
            $params[':from'] = $from;
        }
        if ($to !== null && self::isValidYmd($to)) {
            $where[] = 'holiday_date <= :to';
            $params[':to'] = $to;
        }
        $sql = 'SELECT id, holiday_date, name, created_at FROM office_holidays WHERE '
            . implode(' AND ', $where)
            . ' ORDER BY holiday_date ASC, id ASC';

        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        } catch (\Throwable) {
            return [];
        }

        $out = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $out[] = [
                'id'            => (int)($row['id'] ?? 0),
                'holiday_date'  => (string)($row['holiday_date'] ?? ''),
                'name'          => (string)($row['name'] ?? ''),
                'created_at'    => isset($row['created_at']) ? (string)$row['created_at'] : null,
            ];
        }

        return $out;
    }

    /**
     * @return list<string> YYYY-MM-DD
     */
    public static function listHolidayDates(\PDO $pdo, ?string $from = null, ?string $to = null): array
    {
        $dates = [];
        foreach (self::listHolidays($pdo, $from, $to) as $h) {
            $d = (string)($h['holiday_date'] ?? '');
            if ($d !== '') {
                $dates[] = $d;
            }
        }

        return $dates;
    }

    public static function isWorkingDay(\PDO $pdo, string $ymd): bool
    {
        if (!self::isValidYmd($ymd)) {
            return false;
        }
        $settings = self::getSettings($pdo);
        $mask = (int)$settings['weekly_off_days'];
        $dowBit = self::dowToBitmask((int)(new \DateTimeImmutable($ymd))->format('w'));
        if (($mask & $dowBit) !== 0) {
            return false;
        }

        return !self::isHoliday($pdo, $ymd);
    }

    public static function countWorkingDays(\PDO $pdo, string $from, string $to): int
    {
        if (!self::isValidYmd($from) || !self::isValidYmd($to)) {
            return 0;
        }
        try {
            $start = new \DateTimeImmutable($from);
            $end = new \DateTimeImmutable($to);
        } catch (\Exception) {
            return 0;
        }
        if ($end < $start) {
            return 0;
        }

        $holidaySet = array_fill_keys(self::listHolidayDates($pdo, $from, $to), true);
        $mask = (int)self::getSettings($pdo)['weekly_off_days'];
        $count = 0;
        for ($d = $start; $d <= $end; $d = $d->modify('+1 day')) {
            $ymd = $d->format('Y-m-d');
            $dowBit = self::dowToBitmask((int)$d->format('w'));
            if (($mask & $dowBit) !== 0) {
                continue;
            }
            if (isset($holidaySet[$ymd])) {
                continue;
            }
            $count++;
        }

        return $count;
    }

    public static function countCalendarDays(string $from, string $to): int
    {
        if (!self::isValidYmd($from) || !self::isValidYmd($to)) {
            return 0;
        }
        try {
            $start = new \DateTimeImmutable($from);
            $end = new \DateTimeImmutable($to);
        } catch (\Exception) {
            return 0;
        }
        if ($end < $start) {
            return 0;
        }

        return (int)$start->diff($end)->days + 1;
    }

    /**
     * @param list<int>|list<string>|int $weeklyOffDays Bitmask int, or list of day names / bitmask values
     */
    public static function normalizeWeeklyOffInput(mixed $weeklyOffDays): int
    {
        if (is_int($weeklyOffDays)) {
            return self::normalizeWeeklyOffMask($weeklyOffDays);
        }
        if (!is_array($weeklyOffDays)) {
            return self::FALLBACK_WEEKLY_OFF;
        }
        $mask = 0;
        foreach ($weeklyOffDays as $item) {
            if (is_int($item) || (is_string($item) && ctype_digit($item))) {
                $mask |= self::normalizeWeeklyOffMask((int)$item);
                continue;
            }
            if (!is_string($item)) {
                continue;
            }
            $key = strtolower(trim($item));
            foreach (self::WEEKDAY_OPTIONS as $opt) {
                if ($key === strtolower($opt['label']) || $key === strtolower(substr($opt['label'], 0, 3))) {
                    $mask |= (int)$opt['value'];
                }
            }
        }

        return self::normalizeWeeklyOffMask($mask);
    }

    public static function normalizeWeeklyOffMask(int $mask): int
    {
        $mask &= 127;
        if ($mask === 127) {
            return 126;
        }

        return $mask;
    }

    /** At least one weekday must remain working. */
    public static function assertAtLeastOneWorkingDay(int $mask): void
    {
        if (($mask & 127) === 127) {
            throw new \InvalidArgumentException('At least one working day must remain.');
        }
    }

    /**
     * @return list<string>
     */
    public static function weeklyOffLabels(int $mask): array
    {
        $labels = [];
        foreach (self::WEEKDAY_OPTIONS as $opt) {
            if (($mask & (int)$opt['value']) !== 0) {
                $labels[] = (string)$opt['label'];
            }
        }

        return $labels;
    }

    public static function updateSettings(\PDO $pdo, int $weeklyOffDays, ?int $userId = null): array
    {
        $mask = self::normalizeWeeklyOffMask($weeklyOffDays);
        self::assertAtLeastOneWorkingDay($mask);

        $existing = $pdo->query('SELECT id FROM office_calendar_settings ORDER BY id ASC LIMIT 1')->fetch(\PDO::FETCH_ASSOC);
        if (is_array($existing) && isset($existing['id'])) {
            $stmt = $pdo->prepare(
                'UPDATE office_calendar_settings SET weekly_off_days = :mask, updated_by = :uid, updated_at = NOW() WHERE id = :id'
            );
            $stmt->execute([':mask' => $mask, ':uid' => $userId, ':id' => (int)$existing['id']]);
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO office_calendar_settings (weekly_off_days, updated_by, updated_at) VALUES (:mask, :uid, NOW())'
            );
            $stmt->execute([':mask' => $mask, ':uid' => $userId]);
        }

        return self::getSettings($pdo);
    }

    /**
     * @return array{id: int, holiday_date: string, name: string, created_at: string|null}
     */
    public static function addHoliday(\PDO $pdo, string $date, string $name, ?int $userId = null): array
    {
        if (!self::isValidYmd($date)) {
            throw new \InvalidArgumentException('holiday_date must be YYYY-MM-DD.');
        }
        $name = trim($name);
        if ($name === '') {
            throw new \InvalidArgumentException('Holiday name is required.');
        }
        if (mb_strlen($name) > 120) {
            throw new \InvalidArgumentException('Holiday name must be 120 characters or fewer.');
        }

        $stmt = $pdo->prepare(
            'INSERT INTO office_holidays (holiday_date, name, created_by) VALUES (:d, :n, :uid) RETURNING id, holiday_date, name, created_at'
        );
        try {
            $stmt->execute([':d' => $date, ':n' => $name, ':uid' => $userId]);
        } catch (\PDOException $e) {
            if (str_contains($e->getMessage(), 'unique') || str_contains($e->getMessage(), 'duplicate')) {
                throw new \InvalidArgumentException('A holiday already exists on this date.');
            }
            throw $e;
        }
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            throw new \RuntimeException('Failed to create holiday.');
        }

        return [
            'id'           => (int)$row['id'],
            'holiday_date' => (string)$row['holiday_date'],
            'name'         => (string)$row['name'],
            'created_at'   => isset($row['created_at']) ? (string)$row['created_at'] : null,
        ];
    }

    public static function deleteHoliday(\PDO $pdo, int $id): bool
    {
        if ($id <= 0) {
            return false;
        }
        $stmt = $pdo->prepare('DELETE FROM office_holidays WHERE id = :id');
        $stmt->execute([':id' => $id]);

        return $stmt->rowCount() > 0;
    }

    public static function isValidYmd(string $ymd): bool
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $ymd)) {
            return false;
        }
        $d = \DateTimeImmutable::createFromFormat('Y-m-d', $ymd);

        return $d !== false && $d->format('Y-m-d') === $ymd;
    }

    private static function isHoliday(\PDO $pdo, string $ymd): bool
    {
        try {
            $stmt = $pdo->prepare('SELECT 1 FROM office_holidays WHERE holiday_date = :d LIMIT 1');
            $stmt->execute([':d' => $ymd]);

            return (bool)$stmt->fetchColumn();
        } catch (\Throwable) {
            return false;
        }
    }

    private static function dowToBitmask(int $dow): int
    {
        return match ($dow) {
            0 => self::DAY_SUN,
            1 => self::DAY_MON,
            2 => self::DAY_TUE,
            3 => self::DAY_WED,
            4 => self::DAY_THU,
            5 => self::DAY_FRI,
            6 => self::DAY_SAT,
            default => 0,
        };
    }
}
