<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\UserModel;

/**
 * In-app + email notification to Super Admin users when a Team Approvals request is submitted.
 */
final class ApprovalSubmitNotifier
{
    /**
     * @param list<int> $userIds
     */
    public static function notifySuperAdmins(
        array $userIds,
        string $notificationKind,
        string $title,
        string $body,
        string $entityType,
        int $entityId,
        string $approvalTypeLabel,
        int $approvalId,
        string $summary,
        ?string $detailHtml = null
    ): void {
        $uids = array_values(array_filter(array_map('intval', $userIds), static fn (int $n): bool => $n > 0));
        if ($uids === []) {
            return;
        }

        try {
            (new \App\Models\UserNotificationModel())->createForUsers(
                $uids,
                $notificationKind,
                $title,
                $body,
                $entityType,
                $entityId
            );
        } catch (\Throwable $e) {
            error_log('[ApprovalSubmitNotifier] in-app: ' . $e->getMessage());
        }

        self::emailSuperAdmins($approvalTypeLabel, $approvalId, $summary, $detailHtml);
    }

    private static function emailSuperAdmins(
        string $approvalTypeLabel,
        int $approvalId,
        string $summary,
        ?string $detailHtml
    ): void {
        $userModel = new UserModel();
        $uids      = $userModel->idsHavingRoleNames(['super_admin']);
        if ($uids === []) {
            return;
        }

        $timestamp = date('d M Y, h:i A T');
        $subject   = 'Approval required — ' . $approvalTypeLabel . ' #' . $approvalId . ' — CA Rahul Gupta';

        foreach ($uids as $uid) {
            $user = $userModel->find($uid);
            if ($user === null) {
                continue;
            }
            $email = trim((string)($user['email'] ?? ''));
            if ($email === '') {
                continue;
            }

            $htmlBody = BrevoMailer::renderTemplate('approval-pending-notify', [
                'approvalType' => htmlspecialchars($approvalTypeLabel, ENT_QUOTES, 'UTF-8'),
                'approvalId'   => (string)$approvalId,
                'summary'      => htmlspecialchars($summary, ENT_QUOTES, 'UTF-8'),
                'details'      => $detailHtml ?? '',
                'timestamp'    => htmlspecialchars($timestamp, ENT_QUOTES, 'UTF-8'),
            ]);
            if ($htmlBody === '') {
                continue;
            }

            $name = trim((string)($user['name'] ?? 'Super Admin'));
            try {
                BrevoMailer::send($email, $name, $subject, $htmlBody);
            } catch (\Throwable $e) {
                error_log('[ApprovalSubmitNotifier] email to ' . $email . ': ' . $e->getMessage());
            }
        }
    }
}
