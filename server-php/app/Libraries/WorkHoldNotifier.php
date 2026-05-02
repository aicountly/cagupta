<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Config\Auth as AuthConfig;
use App\Models\UserModel;
use App\Models\UserNotificationModel;

/**
 * In-app + email signals for work-hold changes (Accounts workflow).
 */
final class WorkHoldNotifier
{
    /**
     * @param array<string, mixed> $extra
     */
    public static function notify(string $title, string $body, array $extra = []): void
    {
        $uids = (new UserModel())->idsHavingRoleNames(['super_admin', 'accounts']);
        if ($uids !== []) {
            try {
                (new UserNotificationModel())->createForUsers(
                    $uids,
                    'work_hold',
                    $title,
                    $body,
                    null,
                    null
                );
            } catch (\Throwable $e) {
                error_log('[WorkHoldNotifier] notification insert: ' . $e->getMessage());
            }
        }

        $superEmail = AuthConfig::SUPER_ADMIN_EMAIL;
        try {
            $super = (new UserModel())->findByEmail($superEmail);
            $name  = $super ? (string)($super['name'] ?? $superEmail) : 'Super Admin';
            $html  = '<p>' . htmlspecialchars($body) . '</p>';
            if ($extra !== []) {
                $html .= '<pre style="font-size:12px">' . htmlspecialchars(json_encode($extra, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) . '</pre>';
            }
            BrevoMailer::send($superEmail, $name, '[CA Office] ' . $title, $html);
        } catch (\Throwable $e) {
            error_log('[WorkHoldNotifier] email: ' . $e->getMessage());
        }
    }
}
