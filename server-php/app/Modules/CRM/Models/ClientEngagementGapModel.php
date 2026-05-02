<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * Group-level meeting gap + annual professional-fee billing approximation.
 */
final class ClientEngagementGapModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function buildReport(
        string $dateFrom,
        string $dateTo,
        float $minAnnualBilling,
        int $minGapDays,
        int $groupIdFilter = 0
    ): array {
        $gStmt = $this->db->query(
            'SELECT id, name FROM client_groups ORDER BY name ASC'
        );
        $groups = $gStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $out    = [];
        $today  = new \DateTimeImmutable('today');

        foreach ($groups as $g) {
            $gid = (int)$g['id'];
            if ($groupIdFilter > 0 && $gid !== $groupIdFilter) {
                continue;
            }
            $name = (string)$g['name'];

            $lmStmt = $this->db->prepare(
                'SELECT MAX(ce.event_date) AS d
                 FROM calendar_events ce
                 WHERE ce.client_id IN (SELECT id FROM clients WHERE group_id = :g)
                    OR ce.billing_organization_id IN (SELECT id FROM organizations WHERE group_id = :g2)'
            );
            $lmStmt->execute([':g' => $gid, ':g2' => $gid]);
            $lastStr = $lmStmt->fetchColumn();
            $lastStr = is_string($lastStr) ? $lastStr : '';
            $lastDt  = $lastStr !== '' ? \DateTimeImmutable::createFromFormat('Y-m-d', $lastStr) : null;
            $gapDays = null;
            if ($lastDt instanceof \DateTimeImmutable) {
                $gapDays = (int)$lastDt->diff($today)->days;
            }

            $feeStmt = $this->db->prepare(
                'SELECT COALESCE(SUM(x.fee_part), 0) AS s FROM (
                   SELECT (
                     SELECT COALESCE(SUM((elem->>\'amount\')::numeric), 0)
                     FROM jsonb_array_elements(COALESCE(t.line_items, \'[]\'::jsonb)) elem
                     WHERE COALESCE(elem->>\'line_kind\', \'professional_fee\') = \'professional_fee\'
                   ) AS fee_part
                   FROM txn t
                   WHERE t.txn_type = \'invoice\' AND t.status = \'active\'
                     AND t.txn_date >= CAST(:d1 AS date) AND t.txn_date <= CAST(:d2 AS date)
                     AND (
                       t.client_id IN (SELECT id FROM clients WHERE group_id = :g)
                       OR t.organization_id IN (SELECT id FROM organizations WHERE group_id = :g2)
                     )
                 ) x'
            );
            $feeStmt->execute([':d1' => $dateFrom, ':d2' => $dateTo, ':g' => $gid, ':g2' => $gid]);
            $feeSum = (float)$feeStmt->fetchColumn();

            if ($feeSum < $minAnnualBilling) {
                continue;
            }
            if ($gapDays === null || $gapDays < $minGapDays) {
                continue;
            }

            $out[] = [
                'group_id'          => $gid,
                'group_name'        => $name,
                'last_meeting_date' => $lastStr !== '' ? $lastStr : null,
                'gap_days'          => $gapDays,
                'annual_fee_sum'    => round($feeSum, 2),
                'period_from'       => $dateFrom,
                'period_to'         => $dateTo,
            ];
        }

        return $out;
    }
}
