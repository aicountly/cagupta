<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Config\Auth as AuthConfig;
use App\Config\Database;
use App\Models\UserModel;
use App\Models\UserNotificationModel;
use PDO;

/**
 * Notify service assignees (and super admin) when Finance returns
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
        $serviceId = (int)($service['id'] ?? 0);
        if ($serviceId <= 0) {
            return;
        }

        $actorName     = (string)(($actingUser ?? [])['name'] ?? 'Finance team');
        $serviceType   = trim((string)($service['service_type'] ?? ''));
        $label         = $serviceType !== '' ? $serviceType : 'Service';
        $recipients    = self::loadAssigneeRecipients($serviceId, $service);
        $assigneeIds   = $recipients['ids'];
        $assigneeNames = $recipients['names'];

        $title = 'Service returned by Finance — action required';
        $body  = "{$label} (#{$serviceId}) reopened by {$actorName}. Returned to: {$assigneeNames}. Reason: {$reason}";

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

        self::notifySuperAdminsInApp($serviceId, $title, $body);
        self::sendAssigneeEmails(
            $service,
            $reason,
            $actingUser,
            $fromStatus,
            $toStatus,
            $recipients
        );
        self::sendSuperAdminEmail(
            $service,
            $reason,
            $actingUser,
            $fromStatus,
            $toStatus,
            $assigneeNames
        );
    }

    /**
     * Resolve assignee user IDs and a display label from the service row and DB.
     *
     * @param array<string, mixed> $service
     *
     * @return array{ids: array<int>, names: string, users: array<int, array{name: string, email: string}>}
     */
    private static function loadAssigneeRecipients(int $serviceId, array $service): array
    {
        $ids = [];

        foreach (self::idsFromServiceRow($service) as $id) {
            $ids[] = $id;
        }

        try {
            $db   = Database::getConnection();
            $stmt = $db->prepare(
                'SELECT sa.user_id
                 FROM service_assignees sa
                 INNER JOIN users u ON u.id = sa.user_id AND u.is_active = TRUE
                 WHERE sa.service_id = :sid'
            );
            $stmt->execute([':sid' => $serviceId]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) ?: [] as $uid) {
                $n = (int)$uid;
                if ($n > 0) {
                    $ids[] = $n;
                }
            }

            $assignedTo = (int)($service['assigned_to'] ?? 0);
            if ($assignedTo <= 0) {
                $leadStmt = $db->prepare(
                    'SELECT assigned_to FROM services WHERE id = :sid LIMIT 1'
                );
                $leadStmt->execute([':sid' => $serviceId]);
                $assignedTo = (int)($leadStmt->fetchColumn() ?: 0);
            }
            if ($assignedTo > 0) {
                $ids[] = $assignedTo;
            }

            $today = (new \DateTimeImmutable('today'))->format('Y-m-d');
            $temp  = $db->prepare(
                "SELECT a.temp_user_id
                 FROM service_temporary_assignments a
                 INNER JOIN user_leaves l ON l.id = a.leave_id
                 INNER JOIN users u ON u.id = a.temp_user_id AND u.is_active = TRUE
                 WHERE a.service_id = :sid
                   AND a.start_date <= :today
                   AND a.end_date >= :today
                   AND a.revoked_at IS NULL
                   AND l.status = 'active'"
            );
            $temp->execute([':sid' => $serviceId, ':today' => $today]);
            foreach ($temp->fetchAll(PDO::FETCH_COLUMN) ?: [] as $uid) {
                $n = (int)$uid;
                if ($n > 0) {
                    $ids[] = $n;
                }
            }
        } catch (\Throwable $e) {
            error_log('[ServiceBillingReturnNotifier] Assignee lookup failed: ' . $e->getMessage());
        }

        $ids = array_values(array_unique(array_filter($ids, static fn(int $id): bool => $id > 0)));

        $users     = new UserModel();
        $names     = [];
        $userRows  = [];
        foreach ($ids as $uid) {
            $user = $users->find($uid);
            if ($user === null || !(bool)($user['is_active'] ?? false)) {
                continue;
            }
            $name  = trim((string)($user['name'] ?? ''));
            $email = trim((string)($user['email'] ?? ''));
            if ($name === '') {
                $name = "User #{$uid}";
            }
            $names[]              = $name;
            $userRows[$uid]       = ['name' => $name, 'email' => $email];
        }

        if ($names === []) {
            $fallback = trim((string)($service['assignee_names'] ?? ''));
            if ($fallback === '') {
                $fallback = trim((string)($service['assigned_to_name'] ?? ''));
            }
            $displayNames = $fallback !== '' ? $fallback : 'Unassigned';
        } else {
            $displayNames = implode(', ', $names);
            $ids          = array_keys($userRows);
        }

        return [
            'ids'   => $ids,
            'names' => $displayNames,
            'users' => $userRows,
        ];
    }

    /** @param array<string, mixed> $service @return array<int> */
    private static function idsFromServiceRow(array $service): array
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

    private static function notifySuperAdminsInApp(int $serviceId, string $title, string $body): void
    {
        try {
            $superIds = (new UserModel())->idsHavingRoleNames(['super_admin']);
            if ($superIds === []) {
                return;
            }
            (new UserNotificationModel())->createForUsers(
                $superIds,
                'service_billing_return',
                $title,
                $body,
                'service',
                $serviceId
            );
        } catch (\Throwable $e) {
            error_log('[ServiceBillingReturnNotifier] Super admin in-app notify failed: ' . $e->getMessage());
        }
    }

    /**
     * @param array<string, mixed> $service
     * @param array<string, mixed>|null $actingUser
     * @param array{ids: array<int>, names: string, users: array<int, array{name: string, email: string}>} $recipients
     */
    private static function sendAssigneeEmails(
        array $service,
        string $reason,
        ?array $actingUser,
        string $fromStatus,
        string $toStatus,
        array $recipients
    ): void {
        $userRows = $recipients['users'];
        if ($userRows === []) {
            error_log('[ServiceBillingReturnNotifier] No active assignee emails for service #' . (int)($service['id'] ?? 0));
            return;
        }

        $htmlBody = self::renderEmailBody(
            $service,
            $reason,
            $actingUser,
            $fromStatus,
            $toStatus,
            $recipients['names'],
            'Finance has returned a completed service engagement to your team. Please review the remarks and take the necessary action.'
        );
        if ($htmlBody === '') {
            return;
        }

        $subject = 'Service returned for action — CA Rahul Gupta';
        $sentTo  = [];
        foreach ($userRows as $uid => $row) {
            $email = trim((string)($row['email'] ?? ''));
            if ($email === '' || isset($sentTo[strtolower($email)])) {
                continue;
            }
            $sentTo[strtolower($email)] = true;
            $name = trim((string)($row['name'] ?? 'Team member'));
            try {
                BrevoMailer::send($email, $name, $subject, $htmlBody);
            } catch (\Throwable $e) {
                error_log('[ServiceBillingReturnNotifier] Assignee email failed for user #' . $uid . ': ' . $e->getMessage());
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
        string $toStatus,
        string $assigneeNames
    ): void {
        try {
            $htmlBody = self::renderEmailBody(
                $service,
                $reason,
                $actingUser,
                $fromStatus,
                $toStatus,
                $assigneeNames,
                'Finance has returned a completed service engagement from billing back to the ops team.'
            );
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
        string $toStatus,
        string $assigneeNames,
        string $introText
    ): string {
        $actorName   = (string)(($actingUser ?? [])['name'] ?? 'Finance team');
        $actorEmail  = trim((string)(($actingUser ?? [])['email'] ?? ''));
        $actorLine   = $actorEmail !== '' ? "{$actorName} &lt;{$actorEmail}&gt;" : $actorName;
        $timestamp   = date('d M Y, h:i A T');
        $serviceId   = (string)($service['id'] ?? '');
        $clientName  = (string)($service['client_name'] ?? 'Unknown');
        $serviceType = (string)($service['service_type'] ?? '—');
        $fromLabel   = self::formatStatusLabel($fromStatus);
        $toLabel     = self::formatStatusLabel($toStatus);

        return BrevoMailer::renderTemplate('service-billing-return-notify', [
            'introText'     => $introText,
            'serviceId'     => $serviceId,
            'clientName'    => $clientName,
            'serviceType'   => $serviceType,
            'assigneeNames' => $assigneeNames !== '' ? $assigneeNames : 'Unassigned',
            'fromStatus'    => $fromLabel,
            'toStatus'      => $toLabel,
            'returnReason'  => $reason,
            'actorName'     => $actorLine,
            'timestamp'     => $timestamp,
        ]);
    }

    private static function formatStatusLabel(string $status): string
    {
        $s = str_replace('_', ' ', strtolower(trim($status)));
        return ucwords($s);
    }
}
