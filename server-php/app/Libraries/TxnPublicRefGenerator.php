<?php
declare(strict_types=1);

namespace App\Libraries;

use PDO;

/**
 * Sequential public references (RCP-YYYY-######, PAY-YYYY-######) per calendar year.
 */
final class TxnPublicRefGenerator
{
    public static function next(PDO $db, string $prefix, ?string $txnDateYmd): string
    {
        $p = strtoupper(trim($prefix));
        if ($p !== 'RCP' && $p !== 'PAY') {
            throw new \InvalidArgumentException('prefix must be RCP or PAY.');
        }
        $year = $txnDateYmd !== null && strlen($txnDateYmd) >= 4
            ? (int)substr($txnDateYmd, 0, 4)
            : (int)date('Y');
        if ($year < 2000 || $year > 2100) {
            $year = (int)date('Y');
        }
        $key = $p . '_' . $year;

        // When callers already hold a transaction (e.g. payment_expense create + receipt link),
        // nesting beginTransaction() on PostgreSQL PDO throws and surfaces as HTTP 500.
        $ownTransaction = !$db->inTransaction();
        if ($ownTransaction) {
            $db->beginTransaction();
        }
        try {
            $ins = $db->prepare(
                'INSERT INTO app_numeric_sequence (seq_key, last_value) VALUES (:k, 0)
                 ON CONFLICT (seq_key) DO NOTHING'
            );
            $ins->execute([':k' => $key]);

            $upd = $db->prepare(
                'UPDATE app_numeric_sequence SET last_value = last_value + 1
                 WHERE seq_key = :k RETURNING last_value'
            );
            $upd->execute([':k' => $key]);
            $n = (int)$upd->fetchColumn();
            if ($ownTransaction) {
                $db->commit();
            }

            return sprintf('%s-%d-%06d', $p, $year, $n);
        } catch (\Throwable $e) {
            if ($ownTransaction && $db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }
}
