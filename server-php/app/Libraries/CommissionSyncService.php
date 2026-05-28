<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\AssociateActiveFeeMapModel;
use App\Models\AssociateCommissionRateModel;
use App\Models\AssociateProfileModel;
use App\Models\AssociateRewardLedgerModel;
use App\Models\AssociateUplineTrackerModel;
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
    private AssociateCommissionRateModel $rates;
    private AssociateProfileModel $profiles;
    private AssociateUplineTrackerModel $uplineTracker;
    private AssociateActiveFeeMapModel $activeFees;
    private AssociateRewardLedgerModel $rewardLedger;

    public function __construct()
    {
        $this->txn          = new TxnModel();
        $this->services     = new ServiceModel();
        $this->accruals     = new CommissionAccrualModel();
        $this->defaults     = new FirmCommissionDefaultsModel();
        $this->rates        = new AssociateCommissionRateModel();
        $this->profiles     = new AssociateProfileModel();
        $this->uplineTracker = new AssociateUplineTrackerModel();
        $this->activeFees    = new AssociateActiveFeeMapModel();
        $this->rewardLedger  = new AssociateRewardLedgerModel();
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

        // Commission accrual is not gated on ledger_class: memorandum invoices use the same rules as regular unless product opts out later.

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
        $oldChildAssociateId = null;
        foreach ($existing as $ex) {
            if (($ex['accrual_type'] ?? '') === 'invoice_commission' && ($ex['status'] ?? '') === 'accrued') {
                $oldChildAssociateId = (int)$ex['associate_user_id'];
                break;
            }
        }

        $this->accruals->deleteAccruedForInvoice($invoiceTxnId);

        $this->rewardLedger->deleteDownlineEarningsForInvoice($invoiceTxnId);

        if ($oldChildAssociateId > 0) {
            $this->reconcileUplineForChild($oldChildAssociateId, $invoiceTxnId);
        }

        if (!$shouldAccrue || $netBase <= 0) {
            return;
        }

        if (!InvoiceLineCommission::hasProfessionalFeeLine($lines)) {
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

        $associateId = isset($service['referring_associate_user_id']) ? (int)$service['referring_associate_user_id'] : 0;
        if ($associateId <= 0) {
            return;
        }

        $profile = $this->profiles->findByUserId($associateId);
        if ($profile === null || ($profile['status'] ?? '') !== 'approved') {
            return;
        }

        $payoutModel = strtolower((string)($profile['payout_model'] ?? 'passive'));
        if ($payoutModel !== 'active' && $payoutModel !== 'passive') {
            $payoutModel = 'passive';
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
        $metaExtra = [];

        if ($payoutModel === 'active') {
            $invClientId = (int)($inv['client_id'] ?? 0);
            $fixed       = $this->activeFees->resolveFixedAmount($associateId, $invClientId, (int)($service['organization_id'] ?? 0), $serviceId, $txnDate);
            if ($fixed === null || $fixed <= 0) {
                return;
            }
            $feeSub  = (float)($breakdown['fee_subtotal'] ?? $netBase);
            $capHalf = round($feeSub * 0.5, 2);
            $amount  = round(min($fixed, $capHalf), 2);
            if ($amount <= 0) {
                return;
            }
            if ($amount + 0.001 < $fixed) {
                $metaExtra = [
                    'payout_clamped'     => true,
                    'configured_fixed'   => $fixed,
                    'cap_half_prof_fee'  => $capHalf,
                ];
            }
            $ratePct = null;
            $tier    = null;
        } else {
            if ($mode === 'direct_interaction') {
                $ratePct = (float)($def['direct_associate_pct'] ?? 50);
                $amount  = round($netBase * $ratePct / 100, 2);
            } else {
                $ratePct = $this->rates->effectivePercent($associateId, $tier, $txnDate);
                if ($ratePct === null) {
                    $ratePct = match ($tier) {
                        1 => (float)($def['referral_year1_pct'] ?? 10),
                        2 => (float)($def['referral_year2_pct'] ?? 7),
                        default => (float)($def['referral_year3_plus_pct'] ?? 5),
                    };
                }
                $amount = round($netBase * $ratePct / 100, 2);
            }
        }

        if ($amount <= 0) {
            return;
        }

        $this->accruals->insert([
            'associate_user_id' => $associateId,
            'invoice_txn_id'    => $invoiceTxnId,
            'service_id'        => $serviceId,
            'accrual_type'      => 'invoice_commission',
            'accrual_date'      => $txnDate,
            'commission_mode'   => $mode,
            'tier_used'         => ($payoutModel === 'passive' && $mode === 'referral_only') ? $tier : null,
            'net_fee_base'      => $netBase,
            'rate_percent'      => $ratePct,
            'amount'            => $amount,
            'status'            => 'accrued',
            'metadata'          => array_merge($breakdown, [
                'invoice_number' => $inv['invoice_number'] ?? null,
                'payout_model'   => $payoutModel,
            ], $metaExtra),
        ]);

        $this->creditParentRewardPoints($associateId, $amount, $invoiceTxnId);
        $this->reconcileUplineForChild($associateId, $invoiceTxnId);
    }

    private function creditParentRewardPoints(int $childAssociateId, float $commissionAmount, int $invoiceTxnId): void
    {
        $prof = $this->profiles->findByUserId($childAssociateId);
        if ($prof === null) {
            return;
        }
        $parentId = isset($prof['parent_associate_user_id']) ? (int)$prof['parent_associate_user_id'] : 0;
        if ($parentId <= 0) {
            return;
        }
        $parentProf = $this->profiles->findByUserId($parentId);
        if ($parentProf === null || ($parentProf['status'] ?? '') !== 'approved') {
            return;
        }
        $pts = (int)round($commissionAmount * 0.10);
        if ($pts <= 0) {
            return;
        }
        $this->rewardLedger->insertRow([
            'associate_user_id' => $parentId,
            'delta_points'      => $pts,
            'kind'              => 'earn',
            'ref_type'          => 'downline_commission',
            'ref_id'            => $invoiceTxnId,
            'label'             => 'Team performance credit',
        ]);
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
                    $childId = (int)$ex['associate_user_id'];
                    break;
                }
            }
            $this->accruals->deleteAccruedForInvoice($invoiceTxnId);
            $this->rewardLedger->deleteDownlineEarningsForInvoice($invoiceTxnId);
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
    private function reconcileUplineForChild(int $childAssociateId, ?int $contextInvoiceId): void
    {
        $prof = $this->profiles->findByUserId($childAssociateId);
        if ($prof === null) {
            return;
        }
        $parentId = isset($prof['parent_associate_user_id']) ? (int)$prof['parent_associate_user_id'] : 0;
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

        $S = $this->accruals->sumChildInvoiceCommissions($childAssociateId);
        $expectedBlocks = (int)floor($S / $threshold);

        $netUpline = $this->accruals->sumUplineBonusesForPair($parentId, $childAssociateId);
        $blocksPaid = $bonus > 0.0001 ? (int)round($netUpline / $bonus) : 0;

        $metaBase = [
            'child_associate_user_id' => $childAssociateId,
            'threshold'               => $threshold,
            'child_total_commission'  => $S,
        ];
        if ($contextInvoiceId !== null) {
            $metaBase['invoice_txn_id'] = $contextInvoiceId;
        }

        while ($blocksPaid < $expectedBlocks) {
            $this->accruals->insert([
                'associate_user_id'        => $parentId,
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
                'child_associate_user_id'  => $childAssociateId,
                'metadata'                 => array_merge($metaBase, ['block_index' => $blocksPaid + 1]),
            ]);
            $blocksPaid++;
        }

        while ($blocksPaid > $expectedBlocks) {
            $this->accruals->insert([
                'associate_user_id'        => $parentId,
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
                'child_associate_user_id'  => $childAssociateId,
                'metadata'                 => array_merge($metaBase, ['reversal' => true]),
            ]);
            $blocksPaid--;
        }

        $this->uplineTracker->upsertBlocks($parentId, $childAssociateId, $S, $expectedBlocks);
    }
}
