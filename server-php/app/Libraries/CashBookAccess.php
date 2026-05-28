<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Config\Auth as AuthConfig;
use App\Models\FirmBankAccountModel;

/**
 * Cash-book scoped access for staff who hold cash_book.* but not invoices.*.
 */
final class CashBookAccess
{
    /** @var list<string> */
    private const FIRM_TXN_TYPES = ['firm_expense', 'firm_inflow', 'firm_bank_transfer'];

    /**
     * @param array<string, mixed>|null $user
     */
    public static function hasFullBankFirmAccess(?array $user): bool
    {
        return self::userHasPermission($user, 'invoices.view');
    }

    /**
     * @param array<string, mixed>|null $user
     */
    public static function isCashBookOnlyUser(?array $user): bool
    {
        if ($user === null || self::hasFullBankFirmAccess($user)) {
            return false;
        }

        return self::userHasPermission($user, 'cash_book.view')
            || self::userHasPermission($user, 'cash_book.create')
            || self::userHasPermission($user, 'cash_book.edit');
    }

    /**
     * @param array<string, mixed>|null $user
     */
    public static function canView(?array $user): bool
    {
        return self::hasFullBankFirmAccess($user) || self::userHasPermission($user, 'cash_book.view');
    }

    /**
     * @param array<string, mixed>|null $user
     */
    public static function canCreate(?array $user): bool
    {
        return self::userHasPermission($user, 'invoices.create')
            || self::userHasPermission($user, 'cash_book.create');
    }

    /**
     * @param array<string, mixed>|null $user
     */
    public static function canEdit(?array $user): bool
    {
        return self::userHasPermission($user, 'invoices.edit')
            || self::userHasPermission($user, 'cash_book.edit');
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    public static function filterCashAccounts(array $rows): array
    {
        return array_values(array_filter(
            $rows,
            static fn (array $row): bool => strtolower((string)($row['account_type'] ?? '')) === 'cash'
        ));
    }

    /**
     * @param array<string, mixed>|null $user
     * @return string|null Error message when denied; null when allowed.
     */
    public static function assertAllowedFirmTxnType(?array $user, string $txnType): ?string
    {
        if (!self::isCashBookOnlyUser($user)) {
            return null;
        }
        if (!in_array($txnType, self::FIRM_TXN_TYPES, true)) {
            return 'Access denied. Cash book users may only work with firm cash transactions.';
        }

        return null;
    }

    /**
     * @return string|null Error message when denied; null when allowed.
     */
    public static function assertCashAccountId(int $accountId): ?string
    {
        if ($accountId <= 0) {
            return 'firm_bank_account_id is required.';
        }
        $acc = (new FirmBankAccountModel())->find($accountId);
        if ($acc === null) {
            return 'Bank / cash account not found.';
        }
        if (strtolower((string)($acc['account_type'] ?? '')) !== 'cash') {
            return 'Access denied. Cash book users may only use cash accounts.';
        }

        return null;
    }

    /**
     * @return string|null Error message when denied; null when allowed.
     */
    public static function assertCashTransferPair(int $fromId, int $toId): ?string
    {
        $fromErr = self::assertCashAccountId($fromId);
        if ($fromErr !== null) {
            return $fromErr;
        }
        $toErr = self::assertCashAccountId($toId);
        if ($toErr !== null) {
            return $toErr;
        }

        return null;
    }

    /**
     * @param array<string, mixed> $body
     * @return string|null Error message when denied; null when allowed.
     */
    public static function assertFirmCreateBodyCashAccounts(string $txnType, array $body): ?string
    {
        if ($txnType === 'firm_bank_transfer') {
            $from = (int)($body['from_firm_bank_account_id'] ?? 0);
            $to   = (int)($body['to_firm_bank_account_id'] ?? 0);

            return self::assertCashTransferPair($from, $to);
        }

        $bankId = (int)($body['firm_bank_account_id'] ?? 0);

        return self::assertCashAccountId($bankId);
    }

    /**
     * @param array<string, mixed> $row
     * @return string|null Error message when denied; null when allowed.
     */
    public static function assertFirmTxnRowCashAccounts(array $row): ?string
    {
        $type = (string)($row['txn_type'] ?? '');
        if ($type === 'firm_bank_transfer') {
            $from = (int)($row['firm_bank_account_id'] ?? 0);
            $to   = (int)($row['counterparty_firm_bank_account_id'] ?? 0);

            return self::assertCashTransferPair($from, $to);
        }

        $bankId = (int)($row['firm_bank_account_id'] ?? 0);

        return self::assertCashAccountId($bankId);
    }

    /**
     * @param array<string, mixed>|null $user
     * @param array<string, mixed>      $row
     * @return string|null Error message when denied; null when allowed.
     */
    public static function enforceCashBookScopeForTxn(?array $user, array $row, string $action): ?string
    {
        if (!self::isCashBookOnlyUser($user)) {
            return null;
        }

        $type = (string)($row['txn_type'] ?? '');
        $typeErr = self::assertAllowedFirmTxnType($user, $type);
        if ($typeErr !== null) {
            return $typeErr;
        }

        return self::assertFirmTxnRowCashAccounts($row);
    }

    /**
     * @param array<string, mixed>|null $user
     */
    private static function userHasPermission(?array $user, string $permission): bool
    {
        if ($user === null) {
            return false;
        }
        if (strtolower((string)($user['email'] ?? '')) === strtolower(AuthConfig::SUPER_ADMIN_EMAIL)) {
            return true;
        }
        $role = (string)($user['role_name'] ?? '');
        if (in_array($role, ['super_admin', 'admin'], true)) {
            return true;
        }
        $permissions = $user['role_permissions_array'] ?? [];
        if (in_array('*', $permissions, true)) {
            return true;
        }

        return in_array($permission, $permissions, true);
    }
}
