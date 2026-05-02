<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\ServiceModel;
use App\Models\UserModel;
use App\Models\UserNotificationModel;

/**
 * Notify Accounts-role users when a service becomes billable (billing_closure opens).
 */
final class BillingOpenNotifier
{
    public static function notify(int $serviceId): void
    {
        $services = new ServiceModel();
        $row      = $services->find($serviceId);
        if ($row === null) {
            return;
        }
        $label = trim((string)($row['service_type'] ?? ''));
        $cid   = (int)($row['client_id'] ?? 0);
        $title = 'Service ready for billing';
        $body  = ($label !== '' ? $label : 'Service') . " (#{$serviceId}) is complete / tasks done and needs invoicing.";
        $users = (new UserModel())->listActiveUsersByRoleName('accounts');
        $ids   = array_column($users, 'id');
        (new UserNotificationModel())->createForUsers(
            $ids,
            'billing_due',
            $title,
            $body,
            'service',
            $serviceId
        );
    }
}
