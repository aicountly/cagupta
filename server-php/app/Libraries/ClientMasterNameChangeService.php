<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\ClientMasterNameChangeRequestModel;
use App\Models\UserModel;
use App\Models\UserNotificationModel;

/**
 * Intercept name changes on existing client masters and queue Super Admin approval.
 */
final class ClientMasterNameChangeService
{
    /**
     * If a non–Super Admin user changes name fields, queue approval instead of applying.
     *
     * @param array<string, mixed> $current  Existing row
     * @param array<string, mixed> $data     Mutable update payload (name keys may be stripped)
     * @param array<string, mixed>|null $actor
     *
     * @return array{type: string, summary: array<string, mixed>}|null
     *         type = queued | blocked; null when no intercept needed
     */
    public static function interceptNameChange(
        string $entityType,
        int $entityId,
        array $current,
        array &$data,
        ?array $actor,
        bool $isSuperAdmin
    ): ?array {
        if ($isSuperAdmin || !ClientMasterAudit::nameFieldsChanged($entityType, $current, $data)) {
            return null;
        }

        $model    = new ClientMasterNameChangeRequestModel();
        $existing = $model->findPendingForEntity($entityType, $entityId);
        if ($existing !== null) {
            return [
                'type'    => 'blocked',
                'summary' => ClientMasterNameChangeRequestModel::toPendingSummary($existing),
            ];
        }

        $actorId = $actor ? (int)($actor['id'] ?? 0) : 0;
        if ($actorId <= 0) {
            return null;
        }

        $currentName    = ClientMasterAudit::displayNameForEntity($entityType, $current);
        $proposedValues = ClientMasterAudit::extractProposedNameValues($entityType, $current, $data);
        $data           = ClientMasterAudit::stripNameFields($entityType, $data);

        $approvalId = $model->insertPending(
            $entityType,
            $entityId,
            $currentName,
            $proposedValues,
            $actorId,
            null
        );

        self::notifySuperAdmins($entityType, $entityId, $currentName, $approvalId);

        $fresh = $model->find($approvalId);

        return [
            'type'    => 'queued',
            'summary' => ClientMasterNameChangeRequestModel::toPendingSummary($fresh ?? [
                'id'              => $approvalId,
                'entity_type'     => $entityType,
                'entity_id'       => $entityId,
                'current_name'    => $currentName,
                'proposed_values' => $proposedValues,
            ]),
        ];
    }

    public static function attachPendingToRow(string $entityType, int $entityId, array &$row): void
    {
        $pending = (new ClientMasterNameChangeRequestModel())->findPendingForEntity($entityType, $entityId);
        $row['pending_name_change'] = $pending !== null
            ? ClientMasterNameChangeRequestModel::toPendingSummary($pending)
            : null;
    }

    private static function notifySuperAdmins(string $entityType, int $entityId, string $currentName, int $approvalId): void
    {
        $label = match ($entityType) {
            'contact'      => 'Contact',
            'organization' => 'Organization',
            'client_group' => 'Client group',
            default        => 'Client master',
        };
        $uids = (new UserModel())->idsHavingRoleNames(['super_admin']);
        if ($uids === []) {
            return;
        }
        try {
            (new UserNotificationModel())->createForUsers(
                $uids,
                'client_master_name_change',
                $label . ' name change pending approval',
                $label . ' #' . $entityId . ' (“' . $currentName . '”) name change requires Super Admin approval (Approval #'
                    . $approvalId . ').',
                'client_master_name_change',
                $approvalId
            );
        } catch (\Throwable $e) {
            error_log('[ClientMasterNameChange] notify superadmins: ' . $e->getMessage());
        }
    }

    /**
     * @param array<string, mixed>|null $actor  Super Admin who decided
     */
    public static function notifyRequester(
        int $userId,
        string $title,
        string $body,
        int $approvalId,
        string $decision,
        string $summary,
        ?array $actor = null,
        ?string $detailHtml = null
    ): void {
        ApprovalDecisionNotifier::notifyRequester(
            $userId,
            'client_master_name_change_decided',
            $title,
            $body,
            'client_master_name_change',
            $approvalId,
            'Client master name change',
            $decision,
            $summary,
            $actor,
            $detailHtml
        );
    }
}
