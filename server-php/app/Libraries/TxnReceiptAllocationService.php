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

    /**
     * Load the receipt row for linking payment_expense settlement (same entity as payment).
     *
     * @return array<string, mixed>
     */
    public static function resolveReceiptForPaymentExpenseLink(
        TxnModel $txn,
        int $receiptId,
        string $publicRef,
        int $paymentClientId,
        int $paymentOrgId
    ): array {
        $row = null;
        if ($receiptId > 0) {
            $row = $txn->find($receiptId);
        } elseif ($publicRef !== '') {
            $row = $txn->findActiveTxnByPublicRef($publicRef, 'receipt', $paymentClientId, $paymentOrgId);
        }
        if ($row === null) {
            throw new InvalidArgumentException('Receipt not found for settlement link (check RCP- ref or id for this client).');
        }
        if (($row['txn_type'] ?? '') !== 'receipt') {
            throw new InvalidArgumentException('The referenced transaction is not a receipt.');
        }
        if (in_array((string)($row['status'] ?? ''), ['cancelled', 'reversed'], true)) {
            throw new InvalidArgumentException('Cannot link to a cancelled or reversed receipt.');
        }
        $rc = (int)($row['client_id'] ?? 0);
        $ro = (int)($row['organization_id'] ?? 0);
        if ($paymentClientId > 0) {
            if ($rc !== $paymentClientId || $ro !== 0) {
                throw new InvalidArgumentException('Receipt does not belong to this contact ledger.');
            }
        } elseif ($paymentOrgId > 0) {
            if ($ro !== $paymentOrgId || $rc !== 0) {
                throw new InvalidArgumentException('Receipt does not belong to this organization ledger.');
            }
        }

        return $row;
    }

    /**
     * Move amount from receipt unallocated_advance onto this payment_expense (bill-by-bill settlement).
     *
     * @param array<string, mixed> $receiptRow
     * @param array<string, mixed> $paymentExpenseRow
     */
    public static function linkPaymentExpenseToReceipt(
        array $receiptRow,
        array $paymentExpenseRow,
        ?float $explicitLinkAmount
    ): void {
        if (($paymentExpenseRow['txn_type'] ?? '') !== 'payment_expense') {
            throw new InvalidArgumentException('Settlement target must be a payment expense.');
        }
        if (in_array((string)($paymentExpenseRow['status'] ?? ''), ['cancelled', 'reversed'], true)) {
            throw new InvalidArgumentException('Cannot link to a cancelled or reversed payment expense.');
        }
        $payAmt = round((float)($paymentExpenseRow['amount'] ?? 0), 2);
        if ($payAmt <= 0) {
            throw new InvalidArgumentException('Invalid payment expense amount.');
        }
        $linkAmt = $explicitLinkAmount === null ? $payAmt : round($explicitLinkAmount, 2);
        if ($linkAmt <= 0) {
            throw new InvalidArgumentException('settle_from_receipt_amount must be greater than zero when provided.');
        }
        if ($linkAmt > $payAmt + 0.01) {
            throw new InvalidArgumentException('Amount applied from receipt cannot exceed the payment expense amount.');
        }

        $recvLc = LedgerDimensions::normalizeLedgerClass($receiptRow['ledger_class'] ?? null);
        $payLc  = LedgerDimensions::normalizeLedgerClass($paymentExpenseRow['ledger_class'] ?? null);
        if ($recvLc !== $payLc) {
            throw new InvalidArgumentException('Receipt ledger_class must match the payment expense (regular, memorandum, or optional).');
        }
        $rKind = (string)($receiptRow['ledger_movement_kind'] ?? '');
        $pKind = (string)($paymentExpenseRow['ledger_movement_kind'] ?? '');
        if ($rKind !== $pKind) {
            throw new InvalidArgumentException(
                'Receipt ledger view (fees vs reimbursement) must match the payment expense.'
            );
        }

        $receiptId  = (int)$receiptRow['id'];
        $paymentId  = (int)$paymentExpenseRow['id'];
        $receiptAmt = round((float)($receiptRow['amount'] ?? 0), 2);

        $allocModel = new TxnSettlementAllocationModel();
        $existing   = $allocModel->listForReceipt($receiptId);
        $sumExist   = 0.0;
        foreach ($existing as $e) {
            $sumExist += round((float)($e['amount'] ?? 0), 2);
        }
        if ($receiptAmt > 0 && abs($sumExist - $receiptAmt) > 0.02) {
            throw new InvalidArgumentException(
                'Receipt allocation total does not match receipt amount; fix receipt allocations before linking.'
            );
        }

        $unallocAvail = 0.0;
        foreach ($existing as $e) {
            if (($e['target_type'] ?? '') === 'unallocated_advance') {
                $unallocAvail += round((float)($e['amount'] ?? 0), 2);
            }
        }
        if ($linkAmt > $unallocAvail + 0.01) {
            throw new InvalidArgumentException(
                'This receipt has only ₹' . number_format($unallocAvail, 2, '.', '')
                . ' unallocated; reduce the amount or edit the receipt to free unallocated funds before linking.'
            );
        }

        $newRows   = [];
        $remaining = $linkAmt;
        foreach ($existing as $e) {
            $tt  = (string)($e['target_type'] ?? '');
            $amt = round((float)($e['amount'] ?? 0), 2);
            if ($tt === 'unallocated_advance' && $remaining > 0.00001) {
                $take = min($amt, $remaining);
                $left = round($amt - $take, 2);
                if ($left > 0.00001) {
                    $newRows[] = [
                        'target_type'   => 'unallocated_advance',
                        'target_txn_id' => null,
                        'amount'        => $left,
                    ];
                }
                $remaining -= $take;
            } elseif ($tt === 'unallocated_advance') {
                if ($amt > 0.00001) {
                    $newRows[] = [
                        'target_type'   => 'unallocated_advance',
                        'target_txn_id' => null,
                        'amount'        => $amt,
                    ];
                }
            } else {
                $tid = isset($e['target_txn_id']) ? (int)$e['target_txn_id'] : 0;
                if ($tid <= 0 && $tt !== 'unallocated_advance') {
                    continue;
                }
                $newRows[] = [
                    'target_type'   => $tt,
                    'target_txn_id' => $tid,
                    'amount'        => $amt,
                ];
            }
        }
        if ($remaining > 0.01) {
            throw new InvalidArgumentException('Could not consume unallocated receipt balance for this link.');
        }
        $newRows[] = [
            'target_type'   => 'payment_expense',
            'target_txn_id' => $paymentId,
            'amount'        => $linkAmt,
        ];

        $sumNew = 0.0;
        foreach ($newRows as $r) {
            $sumNew += round((float)($r['amount'] ?? 0), 2);
        }
        if ($receiptAmt > 0 && abs($sumNew - $receiptAmt) > 0.02) {
            throw new InvalidArgumentException('Internal error: receipt allocations would not balance after link.');
        }

        $allocModel->replaceForReceipt($receiptId, $newRows);
    }

    /**
     * Remove payment_expense allocation rows pointing at this payment from every linked receipt (funds return to unallocated).
     */
    public static function unlinkPaymentExpenseFromReceipts(int $paymentExpenseId): void
    {
        $allocModel = new TxnSettlementAllocationModel();
        $ids        = $allocModel->receiptSourceIdsLinkedToPaymentExpense($paymentExpenseId);
        $txn        = new TxnModel();
        foreach ($ids as $rid) {
            $rec = $txn->find($rid);
            if ($rec === null || ($rec['txn_type'] ?? '') !== 'receipt') {
                continue;
            }
            self::unlinkPaymentExpenseFromSingleReceipt($rec, $paymentExpenseId, $allocModel);
        }
    }

    /**
     * @param array<string, mixed> $receiptRow
     */
    private static function unlinkPaymentExpenseFromSingleReceipt(
        array $receiptRow,
        int $paymentExpenseId,
        TxnSettlementAllocationModel $allocModel
    ): void {
        $receiptId  = (int)$receiptRow['id'];
        $receiptAmt = round((float)($receiptRow['amount'] ?? 0), 2);
        $existing   = $allocModel->listForReceipt($receiptId);

        $kept       = [];
        $freed      = 0.0;
        $unallocSum = 0.0;
        foreach ($existing as $e) {
            $tt  = (string)($e['target_type'] ?? '');
            $tid = (int)($e['target_txn_id'] ?? 0);
            $amt = round((float)($e['amount'] ?? 0), 2);
            if ($tt === 'payment_expense' && $tid === $paymentExpenseId) {
                $freed += $amt;

                continue;
            }
            if ($tt === 'unallocated_advance') {
                $unallocSum += $amt;

                continue;
            }
            $kept[] = [
                'target_type'   => $tt,
                'target_txn_id' => $tid > 0 ? $tid : null,
                'amount'        => $amt,
            ];
        }
        $totalUnalloc = round($unallocSum + $freed, 2);
        $newRows      = $kept;
        if ($totalUnalloc > 0.00001) {
            $newRows[] = [
                'target_type'   => 'unallocated_advance',
                'target_txn_id' => null,
                'amount'        => $totalUnalloc,
            ];
        }
        $sumNew = 0.0;
        foreach ($newRows as $r) {
            $sumNew += round((float)($r['amount'] ?? 0), 2);
        }
        if ($receiptAmt > 0 && abs($sumNew - $receiptAmt) > 0.02) {
            throw new InvalidArgumentException(
                'Receipt allocations would not balance after unlinking payment expense (receipt #' . $receiptId . ').'
            );
        }
        $allocModel->replaceForReceipt($receiptId, $newRows);
    }

    /**
     * Replace receipt allocations and refresh invoice paid status for affected invoices.
     *
     * @param list<array{target_type:string, target_txn_id?:int|null, amount:float}> $allocRows
     */
    public static function replaceReceiptAllocationsWithInvoiceRefresh(int $receiptId, array $allocRows): void
    {
        $allocModel = new TxnSettlementAllocationModel();
        $beforeInv  = $allocModel->distinctTargetsForReceipt($receiptId)['invoices'];
        $allocModel->replaceForReceipt($receiptId, $allocRows);
        $afterKeys = [];
        foreach ($allocRows as $r) {
            if (($r['target_type'] ?? '') === 'invoice' && !empty($r['target_txn_id'])) {
                $afterKeys[(int)$r['target_txn_id']] = true;
            }
        }
        $txn = new TxnModel();
        foreach (array_unique(array_merge($beforeInv, array_keys($afterKeys))) as $iid) {
            $txn->recomputeInvoiceReceiptStatus((int)$iid);
        }
    }

    /**
     * Validate payment_expense settlement lines (receipt + unallocated_advance) and return per-receipt link totals.
     *
     * @return array{receipt_totals: array<int, float>}
     */
    public static function normalizePaymentExpenseSettlementLines(
        float $paymentAmount,
        mixed $linesRaw,
        int $clientId,
        int $orgId,
        string $ledgerClass,
        string $ledgerMovementKind,
        TxnModel $txn
    ): array {
        $paymentAmount = round($paymentAmount, 2);
        if ($paymentAmount <= 0) {
            throw new InvalidArgumentException('Invalid payment amount.');
        }
        if ($clientId <= 0 && $orgId <= 0) {
            throw new InvalidArgumentException('client_id or organization_id is required.');
        }
        if ($clientId > 0 && $orgId > 0) {
            throw new InvalidArgumentException('Provide only one of client_id or organization_id.');
        }
        if (!is_array($linesRaw) || $linesRaw === []) {
            throw new InvalidArgumentException('settlement_lines is required and must not be empty.');
        }
        $payLc  = LedgerDimensions::assertLedgerClass($ledgerClass);
        $payMk  = LedgerDimensions::assertLedgerMovementKindRequired($ledgerMovementKind);
        $receiptTotals = [];
        $unallocSum    = 0.0;
        foreach ($linesRaw as $line) {
            if (!is_array($line)) {
                throw new InvalidArgumentException('Each settlement line must be an object.');
            }
            $tt = strtolower(trim((string)($line['target_type'] ?? '')));
            $tt = match ($tt) {
                'receipt', 'unallocated_advance' => $tt,
                default => throw new InvalidArgumentException(
                    'Invalid settlement target_type; use receipt or unallocated_advance.'
                ),
            };
            $amt = round((float)($line['amount'] ?? 0), 2);
            if ($amt <= 0) {
                throw new InvalidArgumentException('Each settlement line amount must be greater than zero.');
            }
            if ($tt === 'unallocated_advance') {
                $unallocSum += $amt;
                continue;
            }
            $tid = (int)($line['target_txn_id'] ?? 0);
            if ($tid <= 0) {
                throw new InvalidArgumentException('target_txn_id is required for receipt settlement lines.');
            }
            $receiptTotals[$tid] = round(($receiptTotals[$tid] ?? 0) + $amt, 2);
        }
        $receiptSum = 0.0;
        foreach ($receiptTotals as $a) {
            $receiptSum += $a;
        }
        $lineTotal = round($receiptSum + $unallocSum, 2);
        if (abs($lineTotal - $paymentAmount) > 0.02) {
            throw new InvalidArgumentException(
                'Settlement lines must sum to the payment amount (₹'
                . number_format($paymentAmount, 2, '.', '') . ').'
            );
        }
        $allocModel = new TxnSettlementAllocationModel();
        foreach ($receiptTotals as $rid => $need) {
            $rec = $txn->find((int)$rid);
            if ($rec === null || ($rec['txn_type'] ?? '') !== 'receipt') {
                throw new InvalidArgumentException('Settlement receipt not found.');
            }
            if (in_array((string)($rec['status'] ?? ''), ['cancelled', 'reversed'], true)) {
                throw new InvalidArgumentException('Cannot settle against a cancelled or reversed receipt.');
            }
            $rc = (int)($rec['client_id'] ?? 0);
            $ro = (int)($rec['organization_id'] ?? 0);
            if ($clientId > 0) {
                if ($rc !== $clientId || $ro !== 0) {
                    throw new InvalidArgumentException('Receipt does not belong to this contact ledger.');
                }
            } elseif ($orgId > 0) {
                if ($ro !== $orgId || $rc !== 0) {
                    throw new InvalidArgumentException('Receipt does not belong to this organization ledger.');
                }
            }
            $rlc = LedgerDimensions::normalizeLedgerClass($rec['ledger_class'] ?? null);
            if ($rlc !== $payLc) {
                throw new InvalidArgumentException('Receipt ledger_class must match the payment expense (regular, memorandum, or optional).');
            }
            $rMk = (string)($rec['ledger_movement_kind'] ?? '');
            if ($rMk !== $payMk) {
                throw new InvalidArgumentException('Receipt ledger view must match the payment expense.');
            }
            $avail = round($allocModel->sumUnallocatedAdvanceForSourceReceipt((int)$rid), 2);
            if ($need > $avail + 0.01) {
                $label = trim((string)($rec['public_ref'] ?? ''));
                $lid   = $label !== '' ? $label : ('#' . (string)$rid);
                throw new InvalidArgumentException(
                    'Receipt ' . $lid . ' has only ₹' . number_format($avail, 2, '.', '') . ' unallocated.'
                );
            }
        }

        return ['receipt_totals' => $receiptTotals];
    }
}
