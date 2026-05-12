<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\TxnModel;
use App\Models\TxnSettlementAllocationModel;
use InvalidArgumentException;

/**
 * Validates receipt settlement lines and persists txn_settlement_allocation rows.
 */
final class TxnReceiptAllocationService
{
    /**
     * @param array<string, mixed> $receiptBody client_id|organization_id, amount, ledger_class, ledger_movement_kind, ...
     * @param mixed                $allocationsRaw JSON-like list from request
     * @return list<array{target_type:string, target_txn_id?:int|null, amount:float}>
     */
    public static function normalizeAndValidateAllocations(array $receiptBody, mixed $allocationsRaw): array
    {
        $amount = round((float)($receiptBody['amount'] ?? 0), 2);
        if ($amount <= 0) {
            throw new InvalidArgumentException('amount must be greater than zero.');
        }

        $rcid = (int)($receiptBody['client_id'] ?? 0);
        $roid = (int)($receiptBody['organization_id'] ?? 0);
        $ledgerClass = LedgerDimensions::assertLedgerClass($receiptBody['ledger_class'] ?? '');
        $recvKind    = LedgerDimensions::assertLedgerMovementKindRequired($receiptBody['ledger_movement_kind'] ?? '');

        $rows = [];
        if (is_array($allocationsRaw) && $allocationsRaw !== []) {
            foreach ($allocationsRaw as $line) {
                if (!is_array($line)) {
                    throw new InvalidArgumentException('Each allocation must be an object.');
                }
                $tt = strtolower(trim((string)($line['target_type'] ?? '')));
                if ($tt === '') {
                    throw new InvalidArgumentException('allocation.target_type is required.');
                }
                $tt = match ($tt) {
                    'invoice', 'payment_expense', 'unallocated_advance' => $tt,
                    default => throw new InvalidArgumentException('Invalid allocation target_type.'),
                };
                $amt = round((float)($line['amount'] ?? 0), 2);
                if ($amt <= 0) {
                    throw new InvalidArgumentException('Each allocation amount must be greater than zero.');
                }
                $tid = isset($line['target_txn_id']) ? (int)$line['target_txn_id'] : 0;
                if ($tt !== 'unallocated_advance' && $tid <= 0) {
                    throw new InvalidArgumentException('target_txn_id is required for invoice and payment allocations.');
                }
                if ($tt === 'unallocated_advance' && $tid > 0) {
                    throw new InvalidArgumentException('unallocated_advance must not set target_txn_id.');
                }
                $rows[] = [
                    'target_type'     => $tt,
                    'target_txn_id'   => $tt === 'unallocated_advance' ? null : $tid,
                    'amount'          => $amt,
                ];
            }
        } elseif (!empty($receiptBody['linked_txn_id'])) {
            $rows[] = [
                'target_type'   => 'invoice',
                'target_txn_id' => (int)$receiptBody['linked_txn_id'],
                'amount'        => $amount,
            ];
        } else {
            throw new InvalidArgumentException('allocations[] is required (or legacy linked_txn_id for a single invoice).');
        }

        $sum = 0.0;
        foreach ($rows as $r) {
            $sum += $r['amount'];
        }
        if (abs($sum - $amount) > 0.01) {
            throw new InvalidArgumentException(
                'Sum of allocation amounts (₹' . number_format($sum, 2, '.', '')
                . ') must equal receipt amount (₹' . number_format($amount, 2, '.', '') . ').'
            );
        }

        $txn = new TxnModel();
        foreach ($rows as $r) {
            if ($r['target_type'] === 'unallocated_advance') {
                continue;
            }
            $target = $txn->find((int)$r['target_txn_id']);
            if ($target === null) {
                throw new InvalidArgumentException('Allocation target transaction not found.');
            }
            if ($r['target_type'] === 'invoice' && ($target['txn_type'] ?? '') !== 'invoice') {
                throw new InvalidArgumentException('Allocation target must be an invoice.');
            }
            if ($r['target_type'] === 'payment_expense' && ($target['txn_type'] ?? '') !== 'payment_expense') {
                throw new InvalidArgumentException('Allocation target must be a payment_expense.');
            }
            $tc = (int)($target['client_id'] ?? 0);
            $to = (int)($target['organization_id'] ?? 0);
            if ($rcid > 0) {
                if ($tc !== $rcid || $to !== 0) {
                    throw new InvalidArgumentException('Allocation target must belong to the same client.');
                }
            } elseif ($roid > 0) {
                if ($to !== $roid || $tc !== 0) {
                    throw new InvalidArgumentException('Allocation target must belong to the same organization.');
                }
            }
            $tLc = LedgerDimensions::normalizeLedgerClass($target['ledger_class'] ?? null);
            if ($tLc !== $ledgerClass) {
                throw new InvalidArgumentException('Allocation target ledger_class must match the receipt.');
            }
            $tKind = (string)($target['ledger_movement_kind'] ?? '');
            if ($tKind !== $recvKind) {
                throw new InvalidArgumentException(
                    'Allocation target ledger_movement_kind must match the receipt (fees vs reimbursement).'
                );
            }
            if ($r['target_type'] === 'invoice') {
                $invLc = LedgerDimensions::normalizeLedgerClass($target['ledger_class'] ?? null);
                if ($invLc !== $ledgerClass) {
                    throw new InvalidArgumentException('Receipt ledger_class must match the invoice.');
                }
                LedgerDimensions::assertReceiptMovementMatchesInvoice($target, $recvKind);
            }
        }

        return $rows;
    }

    public static function assignPublicRef(array &$receiptBody): void
    {
        if (!empty($receiptBody['public_ref'])) {
            return;
        }
        $db = \App\Config\Database::getConnection();
        $receiptBody['public_ref'] = TxnPublicRefGenerator::next(
            $db,
            'RCP',
            isset($receiptBody['txn_date']) ? (string)$receiptBody['txn_date'] : null
        );
    }

    /**
     * After persistence: insert allocations and refresh invoice_status for touched invoices.
     *
     * @param list<array{target_type:string, target_txn_id?:int|null, amount:float}> $rows
     */
    public static function persistForNewReceipt(int $receiptId, array $rows): void
    {
        $alloc = new TxnSettlementAllocationModel();
        $alloc->insertForReceipt($receiptId, $rows);

        $txn  = new TxnModel();
        $seen = [];
        foreach ($rows as $r) {
            if ($r['target_type'] !== 'invoice' || empty($r['target_txn_id'])) {
                continue;
            }
            $iid = (int)$r['target_txn_id'];
            if (isset($seen[$iid])) {
                continue;
            }
            $seen[$iid] = true;
            $txn->recomputeInvoiceReceiptStatus($iid);
        }
    }

    /**
     * When a receipt is removed, delete is CASCADE on allocations; recompute affected invoices.
     *
     * @param list<int> $invoiceIds
     */
    public static function afterReceiptDeleted(array $invoiceIds): void
    {
        $txn = new TxnModel();
        foreach (array_unique($invoiceIds) as $iid) {
            $txn->recomputeInvoiceReceiptStatus((int)$iid);
        }
    }
}
