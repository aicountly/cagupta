<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Fixed associate payout cycle boundaries: 1–8, 9–15, 16–23, 24–month-end.
 */
final class AssociatePayoutCycleSchedule
{
    /**
     * @return array{period_start: string, period_end: string, cycle_anchor: string, disbursal_due_on: string}
     */
    public static function segmentContainingDate(string $ymd): array
    {
        $dt = new \DateTimeImmutable($ymd . ' 12:00:00 UTC');
        $y  = (int)$dt->format('Y');
        $m  = (int)$dt->format('n');
        $d  = (int)$dt->format('j');

        $monthStart = sprintf('%04d-%02d-01', $y, $m);
        $lastDay    = (int)$dt->modify('last day of this month')->format('j');

        if ($d <= 8) {
            return self::pack($monthStart, sprintf('%04d-%02d-08', $y, $m), 'd08');
        }
        if ($d <= 15) {
            return self::pack(sprintf('%04d-%02d-09', $y, $m), sprintf('%04d-%02d-15', $y, $m), 'd15');
        }
        if ($d <= 23) {
            return self::pack(sprintf('%04d-%02d-16', $y, $m), sprintf('%04d-%02d-23', $y, $m), 'd23');
        }

        return self::pack(
            sprintf('%04d-%02d-24', $y, $m),
            sprintf('%04d-%02d-%02d', $y, $m, $lastDay),
            'eom'
        );
    }

    /**
     * @return array{period_start: string, period_end: string, cycle_anchor: string, disbursal_due_on: string}
     */
    public static function segmentForPeriodEnd(string $periodEndYmd): array
    {
        $dt = new \DateTimeImmutable($periodEndYmd . ' 12:00:00 UTC');
        $y  = (int)$dt->format('Y');
        $m  = (int)$dt->format('n');
        $d  = (int)$dt->format('j');
        $lastDay = (int)$dt->modify('last day of this month')->format('j');

        if ($d === 8) {
            return self::pack(sprintf('%04d-%02d-01', $y, $m), sprintf('%04d-%02d-08', $y, $m), 'd08');
        }
        if ($d === 15) {
            return self::pack(sprintf('%04d-%02d-09', $y, $m), sprintf('%04d-%02d-15', $y, $m), 'd15');
        }
        if ($d === 23) {
            return self::pack(sprintf('%04d-%02d-16', $y, $m), sprintf('%04d-%02d-23', $y, $m), 'd23');
        }
        if ($d === $lastDay && $d >= 24) {
            return self::pack(
                sprintf('%04d-%02d-24', $y, $m),
                sprintf('%04d-%02d-%02d', $y, $m, $lastDay),
                'eom'
            );
        }

        throw new \InvalidArgumentException('period_end must be an 8th, 15th, 23rd, or calendar month-end.');
    }

    /**
     * @return array<int, array{period_start: string, period_end: string, cycle_anchor: string, disbursal_due_on: string}>
     */
    public static function segmentsForYear(int $year): array
    {
        $out = [];
        for ($m = 1; $m <= 12; $m++) {
            $dt        = new \DateTimeImmutable(sprintf('%04d-%02d-01', $year, $m));
            $lastDay   = (int)$dt->modify('last day of this month')->format('j');
            $out[]     = self::pack(sprintf('%04d-%02d-01', $year, $m), sprintf('%04d-%02d-08', $year, $m), 'd08');
            $out[]     = self::pack(sprintf('%04d-%02d-09', $year, $m), sprintf('%04d-%02d-15', $year, $m), 'd15');
            $out[]     = self::pack(sprintf('%04d-%02d-16', $year, $m), sprintf('%04d-%02d-23', $year, $m), 'd23');
            $out[]     = self::pack(
                sprintf('%04d-%02d-24', $year, $m),
                sprintf('%04d-%02d-%02d', $year, $m, $lastDay),
                'eom'
            );
        }

        return $out;
    }

    /**
     * @return array{period_start: string, period_end: string, cycle_anchor: string, disbursal_due_on: string}
     */
    private static function pack(string $start, string $end, string $anchor): array
    {
        $due = (new \DateTimeImmutable($end . ' 12:00:00 UTC'))->modify('+3 days')->format('Y-m-d');

        return [
            'period_start'     => $start,
            'period_end'       => $end,
            'cycle_anchor'     => $anchor,
            'disbursal_due_on' => $due,
        ];
    }
}
