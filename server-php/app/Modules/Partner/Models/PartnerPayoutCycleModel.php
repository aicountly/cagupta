<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Libraries\AffiliatePayoutCycleSchedule;
use PDO;

final class PartnerPayoutCycleModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM partner_payout_cycles WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function findByPeriod(string $periodStart, string $periodEnd): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM partner_payout_cycles WHERE period_start = :ps AND period_end = :pe LIMIT 1'
        );
        $stmt->execute([':ps' => $periodStart, ':pe' => $periodEnd]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * @param array{period_start: string, period_end: string, cycle_anchor: string, disbursal_due_on: string} $seg
     */
    public function insertOpen(array $seg): int
    {
        $existing = $this->findByPeriod($seg['period_start'], $seg['period_end']);
        if ($existing !== null) {
            return (int)$existing['id'];
        }

        $stmt = $this->db->prepare(
            'INSERT INTO partner_payout_cycles (
                period_start, period_end, cycle_anchor, disbursal_due_on, status
            ) VALUES (:ps, :pe, :an, :due, \'open\')
            RETURNING id'
        );
        $stmt->execute([
            ':ps'  => $seg['period_start'],
            ':pe'  => $seg['period_end'],
            ':an'  => $seg['cycle_anchor'],
            ':due' => $seg['disbursal_due_on'],
        ]);

        return (int)$stmt->fetchColumn();
    }

    /**
     * @return array<string, mixed>
     */
    public function ensureOpenForPeriodEnd(string $periodEndYmd): array
    {
        $seg = AffiliatePayoutCycleSchedule::segmentForPeriodEnd($periodEndYmd);
        $id  = $this->insertOpen($seg);
        $row = $this->find($id);
        if ($row === null) {
            throw new \RuntimeException('Could not load payout cycle.');
        }

        return $row;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listForYearMerged(int $year): array
    {
        $segments = AffiliatePayoutCycleSchedule::segmentsForYear($year);
        $stmt     = $this->db->prepare(
            'SELECT * FROM partner_payout_cycles
             WHERE period_start >= :y1 AND period_end <= :y2
             ORDER BY period_start ASC'
        );
        $stmt->execute([
            ':y1' => sprintf('%04d-01-01', $year),
            ':y2' => sprintf('%04d-12-31', $year),
        ]);
        /** @var array<string, array<string, mixed>> $byPe */
        $byPe = [];
        foreach ($stmt->fetchAll() as $r) {
            $byPe[(string)$r['period_end']] = $r;
        }
        $out = [];
        foreach ($segments as $seg) {
            $pe  = $seg['period_end'];
            $row = $byPe[$pe] ?? null;
            $out[] = [
                'period_start'       => $seg['period_start'],
                'period_end'         => $seg['period_end'],
                'cycle_anchor'       => $seg['cycle_anchor'],
                'disbursal_due_on'   => $seg['disbursal_due_on'],
                'cycle'              => $row,
            ];
        }

        return $out;
    }

    /**
     * Partner portal: yearly grid with this partner's amounts per period.
     *
     * @return array<int, array<string, mixed>>
     */
    public function listYearForPartner(int $year, int $partnerUserId): array
    {
        $rows = $this->listForYearMerged($year);
        foreach ($rows as &$r) {
            $c = $r['cycle'];
            if ($c !== null && in_array($c['status'], ['finalised', 'disbursed'], true)) {
                $r['partner_summary'] = $this->partnerSumOnCycleLines((int)$c['id'], $partnerUserId);
            } else {
                $r['partner_summary'] = $this->partnerSumOpenPeriod($partnerUserId, $r['period_start'], $r['period_end']);
            }
        }
        unset($r);

        return $rows;
    }

    /**
     * @return array{total: float, line_count: int}
     */
    private function partnerSumOnCycleLines(int $cycleId, int $partnerUserId): array
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount_final), 0) AS total, COUNT(*)::int AS cnt
             FROM partner_payout_cycle_lines
             WHERE partner_payout_cycle_id = :cid AND partner_user_id = :uid"
        );
        $stmt->execute([':cid' => $cycleId, ':uid' => $partnerUserId]);
        $row = $stmt->fetch();

        return [
            'total'      => (float)($row['total'] ?? 0),
            'line_count' => (int)($row['cnt'] ?? 0),
        ];
    }

    /**
     * @return array{total: float, line_count: int}
     */
    private function partnerSumOpenPeriod(int $partnerUserId, string $ps, string $pe): array
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(ppa.amount), 0) AS total, COUNT(*)::int AS cnt
             FROM partner_payout_accruals ppa
             WHERE ppa.partner_user_id = :uid
               AND ppa.status = 'accrued'
               AND ppa.accrual_date >= :ps AND ppa.accrual_date <= :pe
               AND ppa.partner_payout_cycle_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM partner_payout_request_lines prl
                   JOIN partner_payout_requests pr ON pr.id = prl.payout_request_id
                   WHERE prl.accrual_id = ppa.id
                     AND pr.status IN ('pending', 'approved')
               )"
        );
        $stmt->execute([':uid' => $partnerUserId, ':ps' => $ps, ':pe' => $pe]);
        $row = $stmt->fetch();

        return [
            'total'      => (float)($row['total'] ?? 0),
            'line_count' => (int)($row['cnt'] ?? 0),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function linesForCycle(int $cycleId): array
    {
        $stmt = $this->db->prepare(
            'SELECT l.*, u.name AS partner_name, u.email AS partner_email
             FROM partner_payout_cycle_lines l
             JOIN users u ON u.id = l.partner_user_id
             WHERE l.partner_payout_cycle_id = :cid
             ORDER BY l.id ASC'
        );
        $stmt->execute([':cid' => $cycleId]);

        return $stmt->fetchAll();
    }

    /**
     * @return array{accruals: array<int, array<string, mixed>>, by_partner: array<int, array{user_id: int, name: string, total: float}>}
     */
    public function buildPreview(int $cycleId): array
    {
        $cycle = $this->find($cycleId);
        if ($cycle === null) {
            throw new \InvalidArgumentException('Cycle not found.');
        }
        $payoutModel = new PartnerPayoutModel();
        $accruals    = $payoutModel->listEligibleForPartnerPayoutCycle(
            (string)$cycle['period_start'],
            (string)$cycle['period_end']
        );
        $byP = [];
        foreach ($accruals as $r) {
            $uid = (int)$r['partner_user_id'];
            if (!isset($byP[$uid])) {
                $byP[$uid] = [
                    'user_id' => $uid,
                    'name'    => '',
                    'total'   => 0.0,
                ];
            }
            $byP[$uid]['total'] += (float)$r['amount'];
        }
        if ($byP !== []) {
            $ids  = array_keys($byP);
            $in   = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $this->db->prepare("SELECT id, name FROM users WHERE id IN ($in)");
            $stmt->execute($ids);
            foreach ($stmt->fetchAll() as $u) {
                $id               = (int)$u['id'];
                $byP[$id]['name'] = (string)($u['name'] ?? '');
            }
        }

        return ['accruals' => $accruals, 'by_partner' => array_values($byP)];
    }

    public function finaliseAtSystemAmounts(int $cycleId, int $actorId): void
    {
        $this->finaliseWithAmountMap($cycleId, $actorId, []);
    }

    /**
     * @param array<int, float> $amountFinalByAccrualId
     */
    public function finaliseWithAmountMap(int $cycleId, int $actorId, array $amountFinalByAccrualId): void
    {
        $payoutModel = new PartnerPayoutModel();
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare(
                'SELECT * FROM partner_payout_cycles WHERE id = :id FOR UPDATE'
            );
            $stmt->execute([':id' => $cycleId]);
            $cycle = $stmt->fetch();
            if ($cycle === false) {
                throw new \RuntimeException('Cycle not found.');
            }
            if (($cycle['status'] ?? '') !== 'open') {
                throw new \RuntimeException('Cycle is not open for finalisation.');
            }

            $eligible = $payoutModel->listEligibleForPartnerPayoutCycle(
                (string)$cycle['period_start'],
                (string)$cycle['period_end']
            );

            $totalSys = 0.0;
            $totalFin = 0.0;
            $lineStmt = $this->db->prepare(
                'INSERT INTO partner_payout_cycle_lines (
                    partner_payout_cycle_id, partner_payout_accrual_id, partner_user_id,
                    amount_system, amount_final
                ) VALUES (:cid, :acc, :uid, :sys, :fin)'
            );
            $updAcc = $this->db->prepare(
                "UPDATE partner_payout_accruals
                 SET amount = :amt,
                     status = 'in_payout',
                     partner_payout_cycle_id = :cid,
                     metadata = COALESCE(metadata, '{}'::jsonb) || CAST(:meta AS jsonb)
                 WHERE id = :id AND status = 'accrued' AND partner_payout_cycle_id IS NULL"
            );

            foreach ($eligible as $r) {
                $accId = (int)$r['id'];
                $sys   = round((float)$r['amount'], 2);
                $fin   = array_key_exists($accId, $amountFinalByAccrualId)
                    ? round((float)$amountFinalByAccrualId[$accId], 2)
                    : $sys;
                if ($fin < 0) {
                    throw new \RuntimeException('Adjusted amounts cannot be negative.');
                }

                $metaPatch = json_encode([
                    'partner_payout_cycle_finalise' => [
                        'cycle_id'       => $cycleId,
                        'amount_system'  => $sys,
                        'amount_final'   => $fin,
                        'finalised_at'   => date('c'),
                    ],
                ], JSON_THROW_ON_ERROR);

                $lineStmt->execute([
                    ':cid' => $cycleId,
                    ':acc' => $accId,
                    ':uid' => (int)$r['partner_user_id'],
                    ':sys' => $sys,
                    ':fin' => $fin,
                ]);
                $updAcc->execute([
                    ':amt' => $fin,
                    ':cid' => $cycleId,
                    ':meta'=> $metaPatch,
                    ':id'  => $accId,
                ]);
                if ($updAcc->rowCount() === 0) {
                    throw new \RuntimeException('Accrual ' . $accId . ' could not be reserved (race or invalid state).');
                }
                $totalSys += $sys;
                $totalFin += $fin;
            }

            $updCyc = $this->db->prepare(
                "UPDATE partner_payout_cycles
                 SET status = 'finalised',
                     total_system_amount = :ts,
                     total_final_amount = :tf,
                     finalised_at = NOW(),
                     finalised_by_user_id = :actor,
                     updated_at = NOW()
                 WHERE id = :id AND status = 'open'"
            );
            $updCyc->execute([
                ':ts'    => $totalSys,
                ':tf'    => $totalFin,
                ':actor' => $actorId,
                ':id'    => $cycleId,
            ]);
            if ($updCyc->rowCount() === 0) {
                throw new \RuntimeException('Cycle state changed during finalisation.');
            }

            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function disburse(int $cycleId, int $actorId): void
    {
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare(
                'SELECT * FROM partner_payout_cycles WHERE id = :id FOR UPDATE'
            );
            $stmt->execute([':id' => $cycleId]);
            $cycle = $stmt->fetch();
            if ($cycle === false) {
                throw new \RuntimeException('Cycle not found.');
            }
            if (($cycle['status'] ?? '') !== 'finalised') {
                throw new \RuntimeException('Only a finalised cycle can be marked disbursed.');
            }

            $pay = $this->db->prepare(
                "UPDATE partner_payout_accruals
                 SET status = 'paid'
                 WHERE partner_payout_cycle_id = :cid AND status = 'in_payout'"
            );
            $pay->execute([':cid' => $cycleId]);

            $upd = $this->db->prepare(
                "UPDATE partner_payout_cycles
                 SET status = 'disbursed',
                     disbursed_at = NOW(),
                     disbursed_by_user_id = :actor,
                     updated_at = NOW()
                 WHERE id = :id"
            );
            $upd->execute([':actor' => $actorId, ':id' => $cycleId]);

            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function runSlaNotifications(UserNotificationModel $notifications): int
    {
        $stmt = $this->db->query(
            "SELECT * FROM partner_payout_cycles
             WHERE status = 'finalised'
               AND disbursed_at IS NULL
             ORDER BY disbursal_due_on ASC"
        );
        $rows = $stmt ? $stmt->fetchAll() : [];
        if ($rows === []) {
            return 0;
        }

        $uids = (new UserModel())->idsHavingRoleNames(['super_admin', 'accounts']);
        if ($uids === []) {
            return 0;
        }

        $today = (new \DateTimeImmutable('today'))->format('Y-m-d');
        $sent  = 0;

        foreach ($rows as $c) {
            $due = (string)$c['disbursal_due_on'];
            $id  = (int)$c['id'];

            $dueDt = new \DateTimeImmutable($due . ' 12:00:00');
            $d48   = $dueDt->modify('-2 days')->format('Y-m-d');
            $d24   = $dueDt->modify('-1 day')->format('Y-m-d');

            $title = '';
            $body  = sprintf(
                'Partner payout cycle #%d (%s → %s). Disburse by %s.',
                $id,
                $c['period_start'],
                $c['period_end'],
                $due
            );

            if ($today > $due && empty($c['sla_overdue_notified_at'])) {
                $title = 'Overdue: partner payout disbursement';
                $body .= ' This cycle is past the 3-day disbursement window.';
                $this->db->prepare(
                    'UPDATE partner_payout_cycles SET sla_overdue_notified_at = NOW(), updated_at = NOW() WHERE id = :id'
                )->execute([':id' => $id]);
            } elseif ($today >= $d24 && $today <= $due && empty($c['sla_reminder_24h_at'])) {
                $title = 'Reminder: partner payout due soon';
                $this->db->prepare(
                    'UPDATE partner_payout_cycles SET sla_reminder_24h_at = NOW(), updated_at = NOW() WHERE id = :id'
                )->execute([':id' => $id]);
            } elseif ($today >= $d48 && $today < $d24 && empty($c['sla_reminder_48h_at'])) {
                $title = 'Reminder: partner payout disbursement window';
                $this->db->prepare(
                    'UPDATE partner_payout_cycles SET sla_reminder_48h_at = NOW(), updated_at = NOW() WHERE id = :id'
                )->execute([':id' => $id]);
            }

            if ($title !== '') {
                $notifications->createForUsers(
                    $uids,
                    'partner_payout_cycle_sla',
                    $title,
                    $body,
                    'partner_payout_cycle',
                    $id
                );
                ++$sent;
            }
        }

        return $sent;
    }
}
