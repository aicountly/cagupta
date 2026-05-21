<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\UserModel;
use App\Models\UserNotificationModel;

/**
 * In-app + email notification to the user who submitted a Team Approvals request
 * when a Super Admin approves or rejects it.
 */
final class ApprovalDecisionNotifier
{
    /**
     * @param array<string, mixed>|null $actor  Deciding user (Super Admin)
     */
    public static function notifyRequester(
        int $userId,
        string $notificationKind,
        string $title,
        string $body,
        ?string $entityType,
        ?int $entityId,
        string $approvalTypeLabel,
        string $decision,
        string $summary,
        ?array $actor = null,
        ?string $detailHtml = null
    ): void {
        if ($userId <= 0) {
            return;
        }

        try {
            (new UserNotificationModel())->createForUsers(
                [$userId],
                $notificationKind,
                $title,
                $body,
                $entityType,
                $entityId
            );
        } catch (\Throwable $e) {
            error_log('[ApprovalDecisionNotifier] in-app: ' . $e->getMessage());
        }

        self::sendEmail(
            $userId,
            $approvalTypeLabel,
            $entityId ?? 0,
            $decision,
            $summary,
            $actor,
            $detailHtml
        );
    }

    /**
     * @param array<string, mixed>|null $actor
     */
    private static function sendEmail(
        int $userId,
        string $approvalTypeLabel,
        int $approvalId,
        string $decision,
        string $summary,
        ?array $actor,
        ?string $detailHtml
    ): void {
        $user = (new UserModel())->find($userId);
        if ($user === null) {
            return;
        }

        $email = trim((string)($user['email'] ?? ''));
        if ($email === '') {
            return;
        }

        $decisionLabel = self::decisionLabel($decision);
        $actorName     = trim((string)(($actor ?? [])['name'] ?? 'Super Admin'));
        $actorEmail    = trim((string)(($actor ?? [])['email'] ?? ''));
        $timestamp     = date('d M Y, h:i A T');

        $htmlBody = BrevoMailer::renderTemplate('approval-decision-notify', [
            'approvalType'   => htmlspecialchars($approvalTypeLabel, ENT_QUOTES, 'UTF-8'),
            'approvalId'     => $approvalId > 0 ? (string)$approvalId : '—',
            'decisionLabel'  => htmlspecialchars($decisionLabel, ENT_QUOTES, 'UTF-8'),
            'summary'        => htmlspecialchars($summary, ENT_QUOTES, 'UTF-8'),
            'details'        => $detailHtml ?? '',
            'decidedBy'      => htmlspecialchars($actorName, ENT_QUOTES, 'UTF-8'),
            'decidedByEmail' => htmlspecialchars($actorEmail, ENT_QUOTES, 'UTF-8'),
            'timestamp'      => htmlspecialchars($timestamp, ENT_QUOTES, 'UTF-8'),
        ]);

        if ($htmlBody === '') {
            return;
        }

        $subject = self::emailSubject($decision);
        $name    = trim((string)($user['name'] ?? 'Team member'));

        try {
            BrevoMailer::send($email, $name, $subject, $htmlBody);
        } catch (\Throwable $e) {
            error_log('[ApprovalDecisionNotifier] email: ' . $e->getMessage());
        }
    }

    public static function decisionLabel(string $decision): string
    {
        return match ($decision) {
            'approved_modified' => 'Approved with changes',
            'approved'          => 'Approved',
            'rejected'          => 'Rejected',
            default             => ucfirst(str_replace('_', ' ', $decision)),
        };
    }

    private static function emailSubject(string $decision): string
    {
        return match ($decision) {
            'rejected'          => 'Your approval request was rejected — CA Rahul Gupta',
            'approved_modified' => 'Your approval request was approved with changes — CA Rahul Gupta',
            default             => 'Your approval request was approved — CA Rahul Gupta',
        };
    }

    /** Escape plain text for safe inclusion in email detail HTML. */
    public static function escapeDetail(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    }

    /** Wrap escaped lines in a styled detail block. */
    public static function detailBlock(string $escapedHtml): string
    {
        if ($escapedHtml === '') {
            return '';
        }

        return '<div class="reason">' . $escapedHtml . '</div>';
    }
}
