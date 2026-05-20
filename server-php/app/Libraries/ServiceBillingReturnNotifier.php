<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Config\Auth as AuthConfig;
use App\Models\UserModel;
use App\Models\UserNotificationModel;

/**
 * Notify service assignees (and optionally super admin) when Finance returns
 * a completed engagement to the team from the billing queue.
 */
final class ServiceBillingReturnNotifier
{
    /**
     * @param array<string, mixed> $service   Hydrated service row (before or after status update)
     * @param array<string, mixed>|null $actingUser
     */
    public static function notify(
        array $service,
        string $reason,
        ?array $actingUser,
        string $fromStatus,
        string $toStatus
    ): void {
        $serviceId   = (int)($service['id'] ?? 0);
        if ($serviceId <= 0) {
            return;
        }

        $actorName   = (string)(($actingUser ?? [])['name'] ?? 'Finance team');
        $serviceType = trim((string)($service['service_type'] ?? ''));
        $label       = $serviceType !== '' ? $serviceType : 'Service';
        $title       = 'Service returned by Finance — action required';
        $body        = "{$label} (#{$serviceId}) reopened by {$actorName}. Reason: {$reason}";

        $assigneeIds = self::resolveAssigneeUserIds($service);
        if ($assigneeIds !== []) {
            (new UserNotificationModel())->createForUsers(
                $assigneeIds,
                'service_billing_return',
                $title,
                $body,
                'service',
                $serviceId
            );
        }

        self::sendAssigneeEmails($service, $reason, $actingUser, $fromStatus, $toStatus, $assigneeIds);
        self::sendSuperAdminEmail($service, $reason, $actingUser, $fromStatus, $toStatus);
    }

    /** @param array<string, mixed> $service @return array<int> */
    private static function resolveAssigneeUserIds(array $service): array
    {
        $raw = $service['assignee_user_ids'] ?? null;
        if (is_array($raw) && $raw !== []) {
            $ids = [];
            foreach ($raw as $v) {
                $n = (int)$v;
                if ($n > 0) {
                    $ids[] = $n;
                }
            }
            if ($ids !== []) {
                return array_values(array_unique($ids));
            }
        }

        $legacy = (int)($service['assigned_to'] ?? 0);
        return $legacy > 0 ? [$legacy] : [];
    }

    /**
     * @param array<string, mixed> $service
     * @param array<string, mixed>|null $actingUser
     * @param array<int> $assigneeIds
     */
    private static function sendAssigneeEmails(
        array $service,
        string $reason,
        ?array $actingUser,
        string $fromStatus,
        string $toStatus,
        array $assigneeIds
    ): void {
        if ($assigneeIds === []) {
            return;
        }

        $users     = new UserModel();
        $sentTo    = [];
        $htmlBody  = self::renderEmailBody($service, $reason, $actingUser, $fromStatus, $toStatus);
        if ($htmlBody === '') {
            return;
        }

        $subject = 'Service returned for action — CA Rahul Gupta';
        foreach ($assigneeIds as $uid) {
            $user = $users->find($uid);
            if ($user === null) {
                continue;
            }
            $email = trim((string)($user['email'] ?? ''));
            if ($email === '' || isset($sentTo[$email])) {
                continue;
            }
            $sentTo[$email] = true;
            $name = trim((string)($user['name'] ?? 'Team member'));
            try {
                BrevoMailer::send($email, $name, $subject, $htmlBody);
            } catch (\Throwable $e) {
                error_log('[ServiceBillingReturnNotifier] Assignee email failed: ' . $e->getMessage());
            }
        }
    }

    /**
     * @param array<string, mixed> $service
     * @param array<string, mixed>|null $actingUser
     */
    private static function sendSuperAdminEmail(
        array $service,
        string $reason,
        ?array $actingUser,
        string $fromStatus,
        string $toStatus
    ): void {
        try {
            $htmlBody = self::renderEmailBody($service, $reason, $actingUser, $fromStatus, $toStatus);
            if ($htmlBody === '') {
                return;
            }
            $subject = 'Service returned from billing — CA Rahul Gupta';

            $superEmail = (string)(getenv('SUPERADMIN_NOTIFY_EMAIL') ?: '');
            if ($superEmail === '') {
                $super = (new UserModel())->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
                $superEmail = $super ? trim((string)($super['email'] ?? '')) : '';
            }
            if ($superEmail !== '') {
                BrevoMailer::send($superEmail, 'CA Rahul Gupta', $subject, $htmlBody);
            }
        } catch (\Throwable $e) {
            error_log('[ServiceBillingReturnNotifier] Super admin email failed: ' . $e->getMessage());
        }
    }

    /**
     * @param array<string, mixed> $service
     * @param array<string, mixed>|null $actingUser
     */
    private static function renderEmailBody(
        array $service,
        string $reason,
        ?array $actingUser,
        string $fromStatus,
        string $toStatus
    ): string {
        $actorName   = (string)(($actingUser ?? [])['name'] ?? 'Finance team');
        $actorEmail  = (string)(($actingUser ?? [])['email'] ?? '');
        $timestamp   = date('d M Y, h:i A T');
        $serviceId   = (string)($service['id'] ?? '');
        $clientName  = (string)($service['client_name'] ?? 'Unknown');
        $serviceType = (string)($service['service_type'] ?? '—');
        $fromLabel   = self::formatStatusLabel($fromStatus);
        $toLabel     = self::formatStatusLabel($toStatus);

        return BrevoMailer::renderTemplate('service-billing-return-notify', [
            'serviceId'    => $serviceId,
            'clientName'   => $clientName,
            'serviceType'  => $serviceType,
            'fromStatus'   => $fromLabel,
            'toStatus'     => $toLabel,
            'returnReason' => $reason,
            'actorName'    => $actorName,
            'actorEmail'   => $actorEmail,
            'timestamp'    => $timestamp,
        ]);
    }

    private static function formatStatusLabel(string $status): string
    {
        $s = str_replace('_', ' ', strtolower(trim($status)));
        return ucwords($s);
    }
}
