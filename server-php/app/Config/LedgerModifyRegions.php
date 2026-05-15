<?php
declare(strict_types=1);

namespace App\Config;

/**
 * Regions allowed when requesting a ledger modify/delete OTP (Indian states / UTs, CRM-aligned).
 */
final class LedgerModifyRegions
{
    /** @var list<string> */
    public const ALLOWLIST = [
        'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
        'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
        'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
        'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
        'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
        'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
        'Andaman & Nicobar Islands', 'Chandigarh',
        'Dadra & Nagar Haveli and Daman & Diu', 'Delhi',
        'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
    ];

    public static function isValid(string $region): bool
    {
        $t = trim($region);

        return $t !== '' && in_array($t, self::ALLOWLIST, true);
    }
}
