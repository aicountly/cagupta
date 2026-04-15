<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Config\Auth as AuthConfig;
use App\Models\AppointmentModel;
use App\Models\TxnModel;
use App\Models\UserModel;

/**
 * After Razorpay (or manual) receipt: update appointment workflow and Zoom.
 */
final class AppointmentPaymentHooks
{
    public static function afterReceiptOnInvoice(int $invoiceTxnId): void
    {
        $txn   = new TxnModel();
        $inv   = $txn->find($invoiceTxnId);
        if ($inv === null || ($inv['txn_type'] ?? '') !== 'invoice') {
            return;
        }
        $aptId = (int)($inv['appointment_id'] ?? 0);
        if ($aptId <= 0) {
            return;
        }
        $apt = (new AppointmentModel())->find($aptId);
        if ($apt === null) {
            return;
        }

        $paid   = $txn->sumLinkedReceipts($invoiceTxnId);
        $total  = (float)($inv['amount'] ?? 0);
        $terms  = (string)($apt['payment_terms'] ?? '');
        $status = (string)($apt['appointment_status'] ?? '');

        $shouldConfirm = false;
        if ($terms === 'pay_later') {
            $shouldConfirm = false;
        } elseif ($terms === 'full_advance') {
            $shouldConfirm = $paid + 0.005 >= $total;
        } elseif ($terms === 'partial_advance') {
            $adv = (float)($apt['advance_amount'] ?? 0);
            if ($adv <= 0 && !empty($apt['advance_percent'])) {
                $adv = round($total * (float)$apt['advance_percent'] / 100, 2);
            }
            $shouldConfirm = $paid + 0.005 >= min($adv, $total);
        }

        $updates = [
            'amount_collected' => round($paid, 2),
            'amount_due_now'   => max(0, round($total - $paid, 2)),
        ];
        if ($shouldConfirm && $status === 'pending_payment') {
            $updates['appointment_status'] = 'confirmed';
        }
        (new AppointmentModel())->update($aptId, $updates);

        if (($updates['appointment_status'] ?? $status) === 'confirmed') {
            self::tryZoomForSuperAdmin($aptId);
        }
    }

    private static function tryZoomForSuperAdmin(int $appointmentId): void
    {
        $apt = (new AppointmentModel())->find($appointmentId);
        if ($apt === null) {
            return;
        }
        $mode = strtolower((string)($apt['event_type'] ?? ''));
        if (!in_array($mode, ['video', 'online'], true)) {
            return;
        }
        $super = (new UserModel())->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
        if ($super === null) {
            return;
        }
        try {
            ZoomMeetingService::syncForAppointment((int)$super['id'], $apt);
        } catch (\Throwable $e) {
            error_log('[AppointmentPaymentHooks] Zoom sync: ' . $e->getMessage());
        }
    }
}
