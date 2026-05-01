<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * RecurringServiceDefinitionModel
 *
 * Manages the `recurring_service_definitions` table and the logic for
 * generating expected register rows (due-date placeholders) up to a
 * target date.
 *
 * Frequency logic
 * ───────────────
 *   monthly      → one period per calendar month
 *   quarterly    → periods end in Mar, Jun, Sep, Dec (Indian FY quarters)
 *   half_yearly  → periods end in Sep, Mar
 *   annual       → one period per financial year (ends Mar 31)
 *
 * Due date formula
 * ─────────────────
 *   due_date = period_end + due_offset_months months, day = due_day
 *   (clamped to last day of month when due_day > days-in-month)
 */
class RecurringServiceDefinitionModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    // ── READ ─────────────────────────────────────────────────────────────────

    /**
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $sql = $this->baseSelect() . ' WHERE rsd.id = :id LIMIT 1';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Paginated list with optional filters.
     *
     * @param array<string, mixed> $filters
     * @return array{rows: array<int, array<string, mixed>>, total: int}
     */
    public function paginate(array $filters = [], int $page = 1, int $perPage = 50): array
    {
        $where  = [];
        $params = [];

        if (array_key_exists('is_active', $filters) && $filters['is_active'] !== null) {
            $where[]  = 'rsd.is_active = :is_active';
            $params[':is_active'] = (bool)$filters['is_active'];
        }

        if (!empty($filters['client_id'])) {
            $where[]  = 'rsd.client_id = :client_id';
            $params[':client_id'] = (int)$filters['client_id'];
        }

        if (!empty($filters['organization_id'])) {
            $where[]  = 'rsd.organization_id = :org_id';
            $params[':org_id'] = (int)$filters['organization_id'];
        }

        if (!empty($filters['engagement_type_id'])) {
            $where[]  = 'rsd.engagement_type_id = :et_id';
            $params[':et_id'] = (int)$filters['engagement_type_id'];
        }

        if (!empty($filters['frequency'])) {
            $where[]  = 'rsd.frequency = :freq';
            $params[':freq'] = $filters['frequency'];
        }

        if (!empty($filters['register_category'])) {
            $where[]  = 'et.register_category = :reg_cat';
            $params[':reg_cat'] = $filters['register_category'];
        }

        if (!empty($filters['search'])) {
            $where[]  = "(c.name ILIKE :search OR o.name ILIKE :search OR et.name ILIKE :search OR rsd.return_type ILIKE :search)";
            $params[':search'] = '%' . $filters['search'] . '%';
        }

        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        $offset      = ($page - 1) * $perPage;

        $countSql = "
            SELECT COUNT(*) FROM recurring_service_definitions rsd
            LEFT JOIN clients       c  ON c.id  = rsd.client_id
            LEFT JOIN organizations o  ON o.id  = rsd.organization_id
            LEFT JOIN engagement_types et ON et.id = rsd.engagement_type_id
            {$whereClause}
        ";
        $countStmt = $this->db->prepare($countSql);
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $sql = $this->baseSelect() . " {$whereClause}
            ORDER BY rsd.id DESC
            LIMIT :limit OFFSET :offset";

        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit',  $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset,  PDO::PARAM_INT);
        $stmt->execute();

        return [
            'rows'  => $stmt->fetchAll(),
            'total' => $total,
        ];
    }

    // ── WRITE ────────────────────────────────────────────────────────────────

    /**
     * Create a recurring service definition.
     *
     * @param array<string, mixed> $data
     */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare("
            INSERT INTO recurring_service_definitions (
                client_id, organization_id, engagement_type_id,
                frequency, due_day, due_offset_months, return_type,
                start_date, end_date, is_active, notes, created_by
            ) VALUES (
                :client_id, :organization_id, :engagement_type_id,
                :frequency, :due_day, :due_offset_months, :return_type,
                :start_date, :end_date, :is_active, :notes, :created_by
            ) RETURNING id
        ");
        $stmt->execute([
            ':client_id'          => $data['client_id']          ?? null,
            ':organization_id'    => $data['organization_id']    ?? null,
            ':engagement_type_id' => (int)($data['engagement_type_id'] ?? 0),
            ':frequency'          => $data['frequency']          ?? 'monthly',
            ':due_day'            => (int)($data['due_day']      ?? 20),
            ':due_offset_months'  => (int)($data['due_offset_months'] ?? 0),
            ':return_type'        => $data['return_type']        ?? '',
            ':start_date'         => $data['start_date'],
            ':end_date'           => $data['end_date']           ?? null,
            ':is_active'          => isset($data['is_active']) ? (bool)$data['is_active'] : true,
            ':notes'              => $data['notes']              ?? null,
            ':created_by'         => $data['created_by']        ?? null,
        ]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Update a recurring service definition.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $allowed = [
            'frequency', 'due_day', 'due_offset_months', 'return_type',
            'start_date', 'end_date', 'is_active', 'notes',
        ];
        $sets   = [];
        $params = [':id' => $id];

        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $sets[]          = "{$field} = :{$field}";
                $params[":{$field}"] = $data[$field];
            }
        }

        if ($sets === []) {
            return false;
        }

        $sets[] = 'updated_at = NOW()';
        $sql    = 'UPDATE recurring_service_definitions SET ' . implode(', ', $sets) . ' WHERE id = :id';
        $stmt   = $this->db->prepare($sql);
        return $stmt->execute($params);
    }

    /**
     * Delete a recurring service definition.
     */
    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM recurring_service_definitions WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }

    // ── PERIOD GENERATION ─────────────────────────────────────────────────────

    /**
     * Generate (insert) missing register rows for all periods from the
     * definition's start_date up to $upToDate (inclusive, using period_end).
     *
     * Existing rows for a (client/org, engagement_type_id, period_start) triple
     * are skipped so this is safe to call multiple times.
     *
     * @return int  Number of new rows inserted
     */
    public function generatePeriods(int $definitionId, string $upToDate): int
    {
        $def = $this->find($definitionId);
        if ($def === null) {
            return 0;
        }

        $periods   = $this->computePeriods($def, $upToDate);
        $inserted  = 0;
        $registerModel = new RegisterModel();

        foreach ($periods as $period) {
            $data = [
                'client_id'              => $def['client_id'],
                'organization_id'        => $def['organization_id'],
                'engagement_type_id'     => (int)$def['engagement_type_id'],
                'register_category'      => $def['register_category'],
                'register_type'          => $def['register_category'] ?? 'general',
                'return_type'            => $def['return_type'] ?: $def['engagement_type_name'],
                'period_label'           => $period['period_label'],
                'period_start'           => $period['period_start'],
                'period_end'             => $period['period_end'],
                'due_date'               => $period['due_date'],
                'status'                 => 'pending',
                'recurring_definition_id'=> $definitionId,
                'created_by'             => (int)($def['created_by'] ?? 0) ?: null,
            ];

            // findOrCreateForPeriod skips if row already exists
            $isNew = $this->isNewPeriodRow(
                $def['client_id'],
                $def['organization_id'],
                (int)$def['engagement_type_id'],
                $period['period_start']
            );

            if ($isNew) {
                $registerModel->create($data);
                $inserted++;
            }
        }

        return $inserted;
    }

    // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

    /**
     * Check if a register row already exists for a given triple.
     */
    private function isNewPeriodRow(
        ?int $clientId,
        ?int $orgId,
        int $etId,
        string $periodStart
    ): bool {
        if ($clientId !== null) {
            $stmt = $this->db->prepare("
                SELECT 1 FROM registers
                WHERE client_id = :cid AND engagement_type_id = :et AND period_start = :ps
                LIMIT 1
            ");
            $stmt->execute([':cid' => $clientId, ':et' => $etId, ':ps' => $periodStart]);
        } else {
            $stmt = $this->db->prepare("
                SELECT 1 FROM registers
                WHERE organization_id = :oid AND engagement_type_id = :et AND period_start = :ps
                LIMIT 1
            ");
            $stmt->execute([':oid' => $orgId, ':et' => $etId, ':ps' => $periodStart]);
        }
        return $stmt->fetchColumn() === false;
    }

    /**
     * Compute period array for the definition up to $upToDate.
     *
     * Each element: [period_label, period_start, period_end, due_date]
     *
     * @return array<int, array{period_label: string, period_start: string, period_end: string, due_date: string}>
     */
    private function computePeriods(array $def, string $upToDate): array
    {
        $frequency       = (string)($def['frequency'] ?? 'monthly');
        $dueDay          = max(1, min(31, (int)($def['due_day'] ?? 20)));
        $dueOffsetMonths = max(0, (int)($def['due_offset_months'] ?? 0));
        $startDate       = new \DateTimeImmutable((string)$def['start_date']);
        $endDate         = $def['end_date'] ? new \DateTimeImmutable((string)$def['end_date']) : null;
        $upTo            = new \DateTimeImmutable($upToDate);
        $periods         = [];

        // Determine all period-end dates up to $upToDate
        switch ($frequency) {
            case 'monthly':
                $periods = $this->monthlyPeriods($startDate, $upTo, $endDate, $dueDay, $dueOffsetMonths);
                break;
            case 'quarterly':
                $periods = $this->quarterlyPeriods($startDate, $upTo, $endDate, $dueDay, $dueOffsetMonths);
                break;
            case 'half_yearly':
                $periods = $this->halfYearlyPeriods($startDate, $upTo, $endDate, $dueDay, $dueOffsetMonths);
                break;
            case 'annual':
                $periods = $this->annualPeriods($startDate, $upTo, $endDate, $dueDay, $dueOffsetMonths);
                break;
        }

        return $periods;
    }

    /** @return array<int, array<string, string>> */
    private function monthlyPeriods(
        \DateTimeImmutable $start,
        \DateTimeImmutable $upTo,
        ?\DateTimeImmutable $defEnd,
        int $dueDay,
        int $offsetMonths
    ): array {
        $periods = [];
        // Start from the first day of the month that contains $start
        $cur = new \DateTimeImmutable($start->format('Y-m-01'));

        while (true) {
            $periodStart = $cur->format('Y-m-01');
            $periodEnd   = $cur->format('Y-m-' . $cur->format('t'));  // last day
            $dueDate     = $this->computeDueDate($periodEnd, $offsetMonths, $dueDay);

            $periodEndDt = new \DateTimeImmutable($periodEnd);
            if ($defEnd && $periodEndDt > $defEnd) break;
            if ($periodEndDt > $upTo) break;

            $periods[] = [
                'period_label' => $cur->format('M Y'),
                'period_start' => $periodStart,
                'period_end'   => $periodEnd,
                'due_date'     => $dueDate,
            ];
            $cur = $cur->modify('+1 month');
        }
        return $periods;
    }

    /** Quarterly: Indian FY quarters — Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar */
    /** @return array<int, array<string, string>> */
    private function quarterlyPeriods(
        \DateTimeImmutable $start,
        \DateTimeImmutable $upTo,
        ?\DateTimeImmutable $defEnd,
        int $dueDay,
        int $offsetMonths
    ): array {
        // Quarter-end months: 6 (Jun), 9 (Sep), 12 (Dec), 3 (Mar)
        $quarterEndMonths = [3, 6, 9, 12];
        $periods = [];

        // Start from the quarter that contains the start month
        $startMonth = (int)$start->format('n');
        $startYear  = (int)$start->format('Y');

        // Find first quarter-end >= start
        $firstQEnd = null;
        foreach ($quarterEndMonths as $m) {
            $y = $startYear;
            if ($m < $startMonth) $y++;
            $candidate = new \DateTimeImmutable("{$y}-{$m}-01");
            $lastDay   = $candidate->format('t');
            $candEnd   = new \DateTimeImmutable("{$y}-{$m}-{$lastDay}");
            if ($firstQEnd === null || $candEnd < $firstQEnd) {
                if ($candEnd >= $start) {
                    $firstQEnd = $candEnd;
                }
            }
        }
        if ($firstQEnd === null) return [];

        $cur = $firstQEnd;
        while (true) {
            $periodEndStr   = $cur->format('Y-m-d');
            $periodStartStr = $cur->modify('-2 months')->format('Y-m-01');
            $dueDate        = $this->computeDueDate($periodEndStr, $offsetMonths, $dueDay);

            if ($defEnd && $cur > $defEnd) break;
            if ($cur > $upTo) break;

            $qLabel = $this->quarterLabel($cur);
            $periods[] = [
                'period_label' => $qLabel,
                'period_start' => $periodStartStr,
                'period_end'   => $periodEndStr,
                'due_date'     => $dueDate,
            ];
            $cur = $cur->modify('+3 months');
        }
        return $periods;
    }

    /** Half-yearly: Sep 30 and Mar 31 */
    /** @return array<int, array<string, string>> */
    private function halfYearlyPeriods(
        \DateTimeImmutable $start,
        \DateTimeImmutable $upTo,
        ?\DateTimeImmutable $defEnd,
        int $dueDay,
        int $offsetMonths
    ): array {
        $periods = [];
        $year    = (int)$start->format('Y');
        $month   = (int)$start->format('n');

        $candidates = [
            new \DateTimeImmutable("{$year}-09-30"),
            new \DateTimeImmutable("{$year}-03-31"),
            new \DateTimeImmutable(($year + 1) . '-09-30'),
            new \DateTimeImmutable(($year + 1) . '-03-31'),
        ];
        usort($candidates, fn($a, $b) => $a <=> $b);
        $first = null;
        foreach ($candidates as $c) {
            if ($c >= $start) { $first = $c; break; }
        }
        if ($first === null) return [];

        $cur = $first;
        while (true) {
            if ($defEnd && $cur > $defEnd) break;
            if ($cur > $upTo) break;

            $periodEndStr   = $cur->format('Y-m-d');
            $periodStartStr = $cur->modify('-5 months')->format('Y-m-01');
            $dueDate        = $this->computeDueDate($periodEndStr, $offsetMonths, $dueDay);
            $periods[] = [
                'period_label' => 'H' . ($cur->format('n') == 9 ? '1' : '2') . ' FY ' . $this->fyLabel($cur),
                'period_start' => $periodStartStr,
                'period_end'   => $periodEndStr,
                'due_date'     => $dueDate,
            ];

            // Advance by 6 months but snap to correct end-of-period date
            $next = $cur->modify('+6 months');
            // Snap to proper half-year end
            $nextM = (int)$next->format('n');
            if ($nextM <= 9) {
                $cur = new \DateTimeImmutable($next->format('Y') . '-09-30');
            } else {
                $cur = new \DateTimeImmutable(($next->format('Y') + 0) . '-03-31');
                // cross year
                if ($nextM > 9) {
                    $cur = new \DateTimeImmutable(((int)$next->format('Y') + 1) . '-03-31');
                }
            }
        }
        return $periods;
    }

    /** Annual: financial year ending Mar 31 each year */
    /** @return array<int, array<string, string>> */
    private function annualPeriods(
        \DateTimeImmutable $start,
        \DateTimeImmutable $upTo,
        ?\DateTimeImmutable $defEnd,
        int $dueDay,
        int $offsetMonths
    ): array {
        $periods = [];
        $year    = (int)$start->format('Y');
        // FY ends Mar 31; if start is after Apr 1, the FY end is next year March
        if ((int)$start->format('n') > 3) {
            $fyEndYear = $year + 1;
        } else {
            $fyEndYear = $year;
        }

        while (true) {
            $periodEnd   = new \DateTimeImmutable("{$fyEndYear}-03-31");
            $periodStart = new \DateTimeImmutable(($fyEndYear - 1) . '-04-01');

            if ($defEnd && $periodEnd > $defEnd) break;
            if ($periodEnd > $upTo) break;
            if ($periodEnd < $start) { $fyEndYear++; continue; }

            $dueDate = $this->computeDueDate($periodEnd->format('Y-m-d'), $offsetMonths, $dueDay);
            $fy      = ($fyEndYear - 1) . '-' . substr((string)$fyEndYear, -2);
            $periods[] = [
                'period_label' => 'FY ' . $fy,
                'period_start' => $periodStart->format('Y-m-d'),
                'period_end'   => $periodEnd->format('Y-m-d'),
                'due_date'     => $dueDate,
            ];
            $fyEndYear++;
        }
        return $periods;
    }

    /**
     * Compute due date: period_end + offsetMonths months, day = dueDay.
     */
    private function computeDueDate(string $periodEnd, int $offsetMonths, int $dueDay): string
    {
        $dt = new \DateTimeImmutable($periodEnd);
        if ($offsetMonths > 0) {
            $dt = $dt->modify("+{$offsetMonths} months");
        }
        $maxDay = (int)$dt->format('t');
        $day    = min($dueDay, $maxDay);
        return $dt->format('Y-m-') . str_pad((string)$day, 2, '0', STR_PAD_LEFT);
    }

    /** Human label like "Q1 FY 2024-25" */
    private function quarterLabel(\DateTimeImmutable $periodEnd): string
    {
        $m = (int)$periodEnd->format('n');
        $q = match(true) {
            $m <= 3  => 'Q4',
            $m <= 6  => 'Q1',
            $m <= 9  => 'Q2',
            default  => 'Q3',
        };
        return $q . ' ' . $this->fyLabel($periodEnd);
    }

    /** "FY 2024-25" from any date */
    private function fyLabel(\DateTimeImmutable $dt): string
    {
        $y = (int)$dt->format('Y');
        $m = (int)$dt->format('n');
        $fyStart = $m > 3 ? $y : $y - 1;
        return 'FY ' . $fyStart . '-' . substr((string)($fyStart + 1), -2);
    }

    private function baseSelect(): string
    {
        return "
            SELECT
                rsd.*,
                et.name                          AS engagement_type_name,
                et.register_category             AS register_category,
                COALESCE(c.name, o.name)         AS client_name,
                c.pan                            AS client_pan,
                o.cin                            AS org_cin,
                u.name                           AS created_by_name
            FROM recurring_service_definitions rsd
            LEFT JOIN engagement_types et ON et.id = rsd.engagement_type_id
            LEFT JOIN clients          c  ON c.id  = rsd.client_id
            LEFT JOIN organizations    o  ON o.id  = rsd.organization_id
            LEFT JOIN users            u  ON u.id  = rsd.created_by
        ";
    }
}
