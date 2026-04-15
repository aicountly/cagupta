<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\AffiliateCommissionRateModel;
use App\Models\AffiliateProfileModel;
use App\Models\AffiliateUplineTrackerModel;
use App\Models\CommissionAccrualModel;
use App\Models\FirmCommissionDefaultsModel;
use App\Models\ServiceModel;
use App\Models\TxnModel;
use App\Config\Database;
use PDO;

/**
 * Syncs commission_accruals when invoices are created/updated/deleted or credit notes applied.
 * Commissions accrue when invoice_status is sent, partially_paid, or paid (not draft/cancelled).
 */
final class CommissionSyncService
{
    private TxnModel $txn;
    private ServiceModel $services;
    private CommissionAccrualModel $accruals;
    private FirmCommissionDefaultsModel $defaults;
    private AffiliateCommissionRateModel $rates;
    private AffiliateProfileModel $profiles;
    private AffiliateUplineTrackerModel $uplineTracker;

    public function __construct()
    {
        $this->txn          = new TxnModel();
        $this->services     = new ServiceModel();
        $this->accruals     = new CommissionAccrualModel();
        $this->defaults     = new FirmCommissionDefaultsModel();
        $this->rates        = new AffiliateCommissionRateModel();
        $this->profiles     = new AffiliateProfileModel();
        $this->uplineTracker = new AffiliateUplineTrackerModel();
    }

    public function syncInvoice(int $invoiceTxnId): void
    {
        $db = Database::getConnection();
        $db->beginTransaction();
        try {
            $this->syncInvoiceWithinTransaction($invoiceTxnId);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            error_log('[CommissionSyncService] syncInvoice failed: ' . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Best-effort sync (logs errors, no throw) for use after credit note / delete paths.
     */
    public function syncInvoiceSafe(int $invoiceTxnId): void
    {
        try {
            $this->syncInvoice($invoiceTxnId);
        } catch (\Throwable $e) {
            error_log('[CommissionSyncService] syncInvoiceSafe: ' . $e->getMessage());
        }
    }

    private function syncInvoiceWithinTransaction(int $invoiceTxnId): void
    {
        $inv = $this->txn->find($invoiceTxnId);
        if ($inv === null || ($inv['txn_type'] ?? '') !== 'invoice') {
            return;
        }

        $lines = $inv['line_items'] ?? [];
        if (!is_array($lines)) {
            $lines = [];
        }

        $breakdown = InvoiceLineCommission::computeNetProfessionalFeeBase($lines);
        $netBase   = $breakdown['net_base'];

        $invoiceStatus = (string)($inv['invoice_status'] ?? '');
        $rowStatus     = (string)($inv['status'] ?? '');
        $shouldAccrue  = $rowStatus === 'active'
            && in_array($invoiceStatus, ['sent', 'partially_paid', 'paid'], true);

        $existing = $this->accruals->findByInvoiceTxnId($invoiceTxnId);
        $oldChildAffiliateId = null;
        foreach ($existing as $ex) {
            if (($ex['accrual_type'] ?? '') === 'invoice_commission' && ($ex['status'] ?? '') === 'accrued') {
                $oldChildAffiliateId = (int)$ex['affiliate_user_id'];
                break;
            }
        }

        $this->accruals->deleteAccruedForInvoice($invoiceTxnId);

        if ($oldChildAffiliateId > 0) {
            $this->reconcileUplineForChild($oldChildAffiliateId, $invoiceTxnId);
        }

        if (!$shouldAccrue || $netBase <= 0) {
            return;
        }

        $serviceId = isset($inv['service_id']) ? (int)$inv['service_id'] : 0;
        if ($serviceId <= 0) {
            return;
        }

        $service = $this->services->find($serviceId);
        if ($service === null) {
            return;
        }

        $affiliateId = isset($service['referring_affiliate_user_id']) ? (int)$service['referring_affiliate_user_id'] : 0;
        if ($affiliateId <= 0) {
            return;
        }

        $profile = $this->profiles->findByUserId($affiliateId);
        if ($profile === null || ($profile['status'] ?? '') !== 'approved') {
            return;
        }

        $mode = (string)($service['commission_mode'] ?? 'referral_only');
        if (!in_array($mode, ['referral_only', 'direct_interaction'], true)) {
            $mode = 'referral_only';
        }

        $txnDate       = (string)($inv['txn_date'] ?? date('Y-m-d'));
        $referralStart = $this->services->resolveReferralStartDateForCommission($service, $txnDate);
        if ($referralStart === '') {
            $referralStart = $txnDate;
        }

        $def     = $this->defaults->get();
        $tier    = $this->resolveTier($referralStart, $txnDate);
        $ratePct = null;
        $amount  = 0.0;

        if ($mode === 'direct_interaction') {
            $ratePct = (float)($def['direct_affiliate_pct'] ?? 50);
            $amount  = round($netBase * $ratePct / 100, 2);
        } else {
            $ratePct = $this->rates->effectivePercent($affiliateId, $tier, $txnDate);
            if ($ratePct === null) {
                $ratePct = match ($tier) {
                    1 => (float)($def['referral_year1_pct'] ?? 10),
                    2 => (float)($def['referral_year2_pct'] ?? 7),
                    default => (float)($def['referral_year3_plus_pct'] ?? 5),
                };
            }
            $amount = round($netBase * $ratePct / 100, 2);
        }

        if ($amount <= 0) {
            return;
        }

        $this->accruals->insert([
            'affiliate_user_id' => $affiliateId,
            'invoice_txn_id'    => $invoiceTxnId,
            'service_id'        => $serviceId,
            'accrual_type'      => 'invoice_commission',
            'accrual_date'      => $txnDate,
            'commission_mode'   => $mode,
            'tier_used'         => $mode === 'referral_only' ? $tier : null,
            'net_fee_base'      => $netBase,
            'rate_percent'      => $ratePct,
            'amount'            => $amount,
            'status'            => 'accrued',
            'metadata'          => array_merge($breakdown, [
                'invoice_number' => $inv['invoice_number'] ?? null,
            ]),
        ]);

        $this->reconcileUplineForChild($affiliateId, $invoiceTxnId);
    }

    public function onInvoiceDeleted(int $invoiceTxnId): void
    {
        $db = Database::getConnection();
        $db->beginTransaction();
        try {
            $existing = $this->accruals->findByInvoiceTxnId($invoiceTxnId);
            $childId   = 0;
            foreach ($existing as $ex) {
                if (($ex['accrual_type'] ?? '') === 'invoice_commission') {
                    $childId = (int)$ex['affiliate_user_id'];
                    break;
                }
            }
            $this->accruals->deleteAccruedForInvoice($invoiceTxnId);
            if ($childId > 0) {
                $this->reconcileUplineForChild($childId, null);
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            error_log('[CommissionSyncService] onInvoiceDeleted: ' . $e->getMessage());
        }
    }

    /**
     * After credit note: linked invoice id may need sync.
     */
    public function afterCreditNote(int $linkedInvoiceTxnId): void
    {
        $this->syncInvoiceSafe($linkedInvoiceTxnId);
    }

    private function resolveTier(string $referralStartYmd, string $invoiceYmd): int
    {
        try {
            $d1 = new \DateTimeImmutable($referralStartYmd);
            $d2 = new \DateTimeImmutable($invoiceYmd);
        } catch (\Throwable) {
            return 3;
        }
        if ($d2 < $d1) {
            return 1;
        }
        $years = $d1->diff($d2)->y;
        if ($years < 1) {
            return 1;
        }
        if ($years < 2) {
            return 2;
        }

        return 3;
    }

    /**
     * Adjust stair-step upline bonuses using firm threshold/bonus and child's total accrued commissions.
     *
     * @param int|null $contextInvoiceId for metadata on new upline rows
     */
    private function reconcileUplineForChild(int $childAffiliateId, ?int $contextInvoiceId): void
    {
        $prof = $this->profiles->findByUserId($childAffiliateId);
        if ($prof === null) {
            return;
        }
        $parentId = isset($prof['parent_affiliate_user_id']) ? (int)$prof['parent_affiliate_user_id'] : 0;
        if ($parentId <= 0) {
            return;
        }

        $parentProf = $this->profiles->findByUserId($parentId);
        if ($parentProf === null || ($parentProf['status'] ?? '') !== 'approved') {
            return;
        }

        $def        = $this->defaults->get();
        $threshold  = (float)($def['upline_sub_threshold_amount'] ?? 5000);
        $bonus      = (float)($def['upline_sub_bonus_amount'] ?? 500);
        if ($threshold <= 0 || $bonus <= 0) {
            return;
        }

        $S = $this->accruals->sumChildInvoiceCommissions($childAffiliateId);
        $expectedBlocks = (int)floor($S / $threshold);

        $netUpline = $this->accruals->sumUplineBonusesForPair($parentId, $childAffiliateId);
        $blocksPaid = $bonus > 0.0001 ? (int)round($netUpline / $bonus) : 0;

        $metaBase = [
            'child_affiliate_user_id' => $childAffiliateId,
            'threshold'               => $threshold,
            'child_total_commission'  => $S,
        ];
        if ($contextInvoiceId !== null) {
            $metaBase['invoice_txn_id'] = $contextInvoiceId;
        }

        while ($blocksPaid < $expectedBlocks) {
            $this->accruals->insert([
                'affiliate_user_id'        => $parentId,
                'invoice_txn_id'           => $contextInvoiceId,
                'service_id'               => null,
                'accrual_type'             => 'upline_sub_bonus',
                'accrual_date'             => date('Y-m-d'),
                'commission_mode'          => null,
                'tier_used'                => null,
                'net_fee_base'             => 0,
                'rate_percent'             => null,
                'amount'                   => $bonus,
                'status'                   => 'accrued',
                'child_affiliate_user_id'  => $childAffiliateId,
                'metadata'                 => array_merge($metaBase, ['block_index' => $blocksPaid + 1]),
            ]);
            $blocksPaid++;
        }

        while ($blocksPaid > $expectedBlocks) {
            $this->accruals->insert([
                'affiliate_user_id'        => $parentId,
                'invoice_txn_id'           => $contextInvoiceId,
                'service_id'               => null,
                'accrual_type'             => 'upline_sub_bonus',
                'accrual_date'             => date('Y-m-d'),
                'commission_mode'          => null,
                'tier_used'                => null,
                'net_fee_base'             => 0,
                'rate_percent'             => null,
                'amount'                   => -$bonus,
                'status'                   => 'accrued',
                'child_affiliate_user_id'  => $childAffiliateId,
                'metadata'                 => array_merge($metaBase, ['reversal' => true]),
            ]);
            $blocksPaid--;
        }

        $this->uplineTracker->upsertBlocks($parentId, $childAffiliateId, $S, $expectedBlocks);
    }
}
