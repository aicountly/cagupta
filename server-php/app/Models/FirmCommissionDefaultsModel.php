<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class FirmCommissionDefaultsModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return array<string, mixed>
     */
    public function get(): array
    {
        $stmt = $this->db->query('SELECT * FROM firm_commission_defaults WHERE id = 1 LIMIT 1');
        $row  = $stmt->fetch();

        return $row ?: [];
    }

    /**
     * @param array<string, mixed> $data
     */
    public function update(array $data): bool
    {
        $allowed = [
            'referral_year1_pct', 'referral_year2_pct', 'referral_year3_plus_pct',
            'direct_affiliate_pct', 'direct_firm_pct',
            'upline_sub_threshold_amount', 'upline_sub_bonus_amount',
        ];
        $sets    = [];
        $params  = [];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $data)) {
                $sets[]          = "{$f} = :{$f}";
                $params[":{$f}"] = $data[$f];
            }
        }
        if ($sets === []) {
            return false;
        }
        $sets[] = 'updated_at = NOW()';
        $sql    = 'UPDATE firm_commission_defaults SET ' . implode(', ', $sets) . ' WHERE id = 1';

        return $this->db->prepare($sql)->execute($params);
    }
}
