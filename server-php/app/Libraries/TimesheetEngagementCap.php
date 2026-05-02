<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Config\Database;
use App\Models\EngagementTypeModel;
use PDO;

/**
 * Max logged minutes per service = 3 × effective standard_allowable_hours
 * (service override, else engagement_types.standard_allowable_hours).
 * Null hours ⇒ no cap (backward compatible).
 */
final class TimesheetEngagementCap
{
    public const MULTIPLIER = 3;

    /** @param array<string, mixed> $service Row from ServiceModel::find */
    public static function effectiveAllowableHours(array $service): ?float
    {
        $ov = $service['standard_allowable_hours_override'] ?? null;
        if ($ov !== null && $ov !== '') {
            $v = (float)$ov;

            return $v > 0 ? $v : null;
        }
        $eid = (int)($service['engagement_type_id'] ?? 0);
        if ($eid <= 0) {
            return null;
        }
        $et = (new EngagementTypeModel())->find($eid);
        if ($et === null) {
            return null;
        }
        $h = $et['standard_allowable_hours'] ?? null;
        if ($h === null || $h === '') {
            return null;
        }
        $v = (float)$h;

        return $v > 0 ? $v : null;
    }

    /** @param array<string, mixed> $service */
    public static function capMinutesForService(array $service): ?int
    {
        $h = self::effectiveAllowableHours($service);
        if ($h === null) {
            return null;
        }

        return (int)max(1, round(self::MULTIPLIER * $h * 60));
    }

    public static function usedMinutesTowardCap(int $serviceId, ?int $excludeEntryId): int
    {
        $db = Database::getConnection();
        $sql = "SELECT COALESCE(SUM(te.duration_minutes), 0)::bigint AS m
                FROM time_entries te
                LEFT JOIN timesheet_overflow_requests tor ON tor.id = te.cap_overflow_request_id
                WHERE te.service_id = :sid
                  AND te.timer_status <> 'running'
                  AND (:ex IS NULL OR te.id <> :ex)
                  AND (
                      te.cap_overflow_request_id IS NULL
                      OR tor.status IN ('pending', 'approved', 'approved_modified')
                  )";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':sid' => $serviceId,
            ':ex'  => $excludeEntryId !== null && $excludeEntryId > 0 ? $excludeEntryId : null,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return (int)($row['m'] ?? 0);
    }

    /**
     * Pending overflow minutes not yet backed by a time row (manual_create),
     * plus pending entry_edit for other entries (not reserveExcludeLinkedEntryId).
     */
    public static function pendingReservedMinutes(int $serviceId, ?int $reserveExcludeLinkedEntryId): int
    {
        $db = Database::getConnection();
        $sql = "SELECT COALESCE(SUM(duration_minutes_requested), 0)::bigint AS m
                FROM timesheet_overflow_requests
                WHERE service_id = :sid AND status = 'pending'
                  AND (
                      source_kind = 'manual_create'
                      OR (
                          source_kind = 'entry_edit'
                          AND (:rex IS NULL OR time_entry_id IS DISTINCT FROM :rex)
                      )
                  )";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':sid' => $serviceId,
            ':rex' => $reserveExcludeLinkedEntryId !== null && $reserveExcludeLinkedEntryId > 0
                ? $reserveExcludeLinkedEntryId
                : null,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return (int)($row['m'] ?? 0);
    }

    /**
     * @param array<string, mixed> $service
     * @return array{
     *   has_cap: bool,
     *   cap_minutes: int|null,
     *   used_minutes: int,
     *   reserved_minutes: int,
     *   effective_allowable_hours: float|null,
     *   would_exceed: bool,
     *   total_after: int
     * }
     */
    public static function evaluateAppend(
        int $serviceId,
        array $service,
        int $additionalMinutes,
        ?int $excludeTimeEntryId,
        ?int $reserveExcludeLinkedEntryId
    ): array {
        $cap = self::capMinutesForService($service);
        $hours = self::effectiveAllowableHours($service);
        if ($cap === null) {
            return [
                'has_cap'                   => false,
                'cap_minutes'               => null,
                'used_minutes'              => 0,
                'reserved_minutes'          => 0,
                'effective_allowable_hours' => $hours,
                'would_exceed'              => false,
                'total_after'               => $additionalMinutes,
            ];
        }
        $used     = self::usedMinutesTowardCap($serviceId, $excludeTimeEntryId);
        $reserved = self::pendingReservedMinutes($serviceId, $reserveExcludeLinkedEntryId);
        $total    = $used + $reserved + $additionalMinutes;

        return [
            'has_cap'                   => true,
            'cap_minutes'               => $cap,
            'used_minutes'              => $used,
            'reserved_minutes'          => $reserved,
            'effective_allowable_hours' => $hours,
            'would_exceed'              => $total > $cap,
            'total_after'               => $total,
        ];
    }
}
