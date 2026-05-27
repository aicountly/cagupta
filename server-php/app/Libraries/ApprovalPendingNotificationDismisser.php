<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\UserNotificationModel;

/**
 * Clears unread "pending approval" in-app alerts when a Team Approvals request is decided.
 */
final class ApprovalPendingNotificationDismisser
{
    public static function dismiss(string $kind, string $entityType, int $entityId): void
    {
        if ($entityId <= 0) {
            return;
        }
        try {
            (new UserNotificationModel())->markReadByEntity($kind, $entityType, $entityId);
        } catch (\Throwable $e) {
            error_log('[ApprovalPendingNotificationDismisser] ' . $e->getMessage());
        }
    }
}
