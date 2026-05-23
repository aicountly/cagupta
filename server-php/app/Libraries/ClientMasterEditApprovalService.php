<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\ClientMasterEditRequestModel;
use App\Models\ClientMasterNameChangeRequestModel;
use App\Models\ClientModel;
use App\Models\OrganizationModel;
use App\Models\UserModel;

/**
 * Intercept Accounts team client master edits and queue Super Admin approval.
 */
final class ClientMasterEditApprovalService
{
    /** @param array<string, mixed>|null $actor */
    public static function actorRequiresApproval(?array $actor, bool $isSuperAdmin): bool
    {
        if ($isSuperAdmin || $actor === null) {
            return false;
        }

        return ($actor['role_name'] ?? '') === 'accounts';
    }

    /**
     * Queue a full client master edit for Super Admin approval (Accounts role only).
     *
     * @param array<string, mixed>      $current   Existing entity row
     * @param array<string, mixed>      $data      Update field payload
     * @param list<int>|null            $linkedOrgIds  Contact linked org ids when provided
     * @param array<string, mixed>|null $actor
     *
     * @return array{type: string, summary: array<string, mixed>}|null
     */
    public static function interceptEdit(
        string $entityType,
        int $entityId,
        array $current,
        array $data,
        ?array $linkedOrgIds,
        ?array $actor,
        bool $isSuperAdmin,
        ?string $requestReason = null
    ): ?array {
        if (!self::actorRequiresApproval($actor, $isSuperAdmin)) {
            return null;
        }

        $currentSnap = self::snapshotForEntity($entityType, $current);
        $proposed    = self::buildProposedPayload($entityType, $data, $linkedOrgIds);

        if (!self::hasChanges($entityType, $currentSnap, $proposed)) {
            return null;
        }

        if (ApprovalReason::normalize($requestReason) === null) {
            return ['type' => 'reason_required'];
        }

        $editModel = new ClientMasterEditRequestModel();
        $existing  = $editModel->findPendingForEntity($entityType, $entityId);
        if ($existing !== null) {
            return [
                'type'    => 'blocked',
                'summary' => ClientMasterEditRequestModel::toPendingSummary($existing),
            ];
        }

        $nameModel = new ClientMasterNameChangeRequestModel();
        $namePending = $nameModel->findPendingForEntity($entityType, $entityId);
        if ($namePending !== null) {
            return [
                'type'    => 'blocked',
                'summary' => [
                    'approval_id' => (int)$namePending['id'],
                    'entity_type' => $entityType,
                    'entity_id'   => $entityId,
                ],
            ];
        }

        $actorId = (int)($actor['id'] ?? 0);
        if ($actorId <= 0) {
            return null;
        }

        $approvalId = $editModel->insertPending(
            $entityType,
            $entityId,
            $currentSnap,
            $proposed,
            $actorId,
            ApprovalReason::normalize($requestReason)
        );

        self::notifySuperAdmins($entityType, $entityId, $currentSnap, $proposed, $approvalId, $actor);

        $fresh = $editModel->find($approvalId);

        return [
            'type'    => 'queued',
            'summary' => ClientMasterEditRequestModel::toPendingSummary($fresh ?? [
                'id'               => $approvalId,
                'entity_type'      => $entityType,
                'entity_id'        => $entityId,
                'current_snapshot' => $currentSnap,
                'proposed_payload' => $proposed,
                'request_reason'   => $requestReason,
            ]),
        ];
    }

    public static function attachPendingToRow(string $entityType, int $entityId, array &$row): void
    {
        $pending = (new ClientMasterEditRequestModel())->findPendingForEntity($entityType, $entityId);
        $row['pending_client_master_edit'] = $pending !== null
            ? ClientMasterEditRequestModel::toPendingSummary($pending)
            : null;
    }

    /**
     * Apply an approved edit request.
     *
     * @param array<string, mixed> $row  Pending request row
     *
     * @return array{before: array<string, mixed>, after: array<string, mixed>}|null
     */
    public static function applyApproved(array $row): ?array
    {
        $entityType = (string)($row['entity_type'] ?? '');
        $entityId   = (int)($row['entity_id'] ?? 0);
        $prop       = self::decodeJson($row['proposed_payload'] ?? []);
        $fields     = is_array($prop['fields'] ?? null) ? $prop['fields'] : [];

        $beforeRow = self::loadEntityRow($entityType, $entityId);
        if ($beforeRow === null) {
            return null;
        }
        $beforeSnap = self::snapshotForEntity($entityType, $beforeRow);

        if ($entityType === 'contact') {
            if ($fields !== []) {
                (new ClientModel())->update($entityId, $fields);
            }
            if (array_key_exists('linked_org_ids', $prop) && is_array($prop['linked_org_ids'])) {
                (new ClientModel())->syncLinkedOrgs($entityId, $prop['linked_org_ids']);
            }
        } elseif ($entityType === 'organization') {
            if ($fields !== []) {
                (new OrganizationModel())->update($entityId, $fields);
            }
        } else {
            return null;
        }

        $afterRow = self::loadEntityRow($entityType, $entityId);

        return [
            'before' => $beforeSnap,
            'after'  => $afterRow !== null ? self::snapshotForEntity($entityType, $afterRow) : $beforeSnap,
        ];
    }

    /**
     * @param array<string, mixed>|null $actor
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
            'client_master_edit_decided',
            $title,
            $body,
            'client_master_edit',
            $approvalId,
            'Client master edit',
            $decision,
            $summary,
            $actor,
            $detailHtml
        );
    }

    /**
     * @param array<string, mixed> $currentSnap
     * @param array<string, mixed> $proposedPayload
     *
     * @return list<array{field: string, before: string, after: string}>
     */
    public static function buildChangeRows(string $entityType, array $currentSnap, array $proposedPayload): array
    {
        $fields = is_array($proposedPayload['fields'] ?? null) ? $proposedPayload['fields'] : [];
        $labels = self::fieldLabels($entityType);
        $rows   = [];

        foreach ($fields as $key => $afterVal) {
            $beforeVal = $currentSnap[$key] ?? null;
            if (self::valuesEqual($beforeVal, $afterVal)) {
                continue;
            }
            $rows[] = [
                'field'  => $labels[$key] ?? (string)$key,
                'before' => self::formatValue($beforeVal),
                'after'  => self::formatValue($afterVal),
            ];
        }

        if ($entityType === 'contact' && array_key_exists('linked_org_ids', $proposedPayload)) {
            $beforeIds = self::normalizeIdList($currentSnap['linked_org_ids'] ?? []);
            $afterIds  = self::normalizeIdList($proposedPayload['linked_org_ids'] ?? []);
            if ($beforeIds !== $afterIds) {
                $rows[] = [
                    'field'  => 'Linked organizations',
                    'before' => self::formatValue($beforeIds),
                    'after'  => self::formatValue($afterIds),
                ];
            }
        }

        return $rows;
    }

    /** @param array<string, mixed> $snap */
    public static function displayNameFromSnapshot(string $entityType, array $snap): string
    {
        if ($entityType === 'contact') {
            return ClientModel::displayName([
                'organization_name' => $snap['organization_name'] ?? null,
                'first_name'        => $snap['first_name'] ?? null,
                'last_name'         => $snap['last_name'] ?? null,
            ]);
        }

        return trim((string)($snap['name'] ?? ''));
    }

    /**
     * @param array<string, mixed> $data
     * @param list<int>|null       $linkedOrgIds
     *
     * @return array<string, mixed>
     */
    private static function buildProposedPayload(string $entityType, array $data, ?array $linkedOrgIds): array
    {
        $payload = ['fields' => $data];
        if ($entityType === 'contact' && $linkedOrgIds !== null) {
            $payload['linked_org_ids'] = self::normalizeIdList($linkedOrgIds);
        }

        return $payload;
    }

    /**
     * @param array<string, mixed> $currentSnap
     * @param array<string, mixed> $proposedPayload
     */
    private static function hasChanges(string $entityType, array $currentSnap, array $proposedPayload): bool
    {
        return self::buildChangeRows($entityType, $currentSnap, $proposedPayload) !== [];
    }

    /** @param array<string, mixed> $row */
    private static function snapshotForEntity(string $entityType, array $row): array
    {
        return match ($entityType) {
            'contact'      => ClientMasterAudit::contactSnapshot($row),
            'organization' => ClientMasterAudit::organizationSnapshot($row),
            default        => [],
        };
    }

    /** @return array<string, mixed>|null */
    private static function loadEntityRow(string $entityType, int $entityId): ?array
    {
        if ($entityType === 'contact') {
            return (new ClientModel())->find($entityId);
        }
        if ($entityType === 'organization') {
            return (new OrganizationModel())->find($entityId);
        }

        return null;
    }

    /**
     * @param array<string, mixed> $currentSnap
     * @param array<string, mixed> $proposed
     */
    private static function notifySuperAdmins(
        string $entityType,
        int $entityId,
        array $currentSnap,
        array $proposed,
        int $approvalId,
        ?array $actor
    ): void {
        $label       = $entityType === 'organization' ? 'Organization' : 'Contact';
        $displayName = self::displayNameFromSnapshot($entityType, $currentSnap);
        $changeCount = count(self::buildChangeRows($entityType, $currentSnap, $proposed));
        $actorName   = trim((string)($actor['name'] ?? 'Accounts team'));
        $summary     = $label . ' #' . $entityId . ' (“' . $displayName . '”) — '
            . $changeCount . ' field change' . ($changeCount === 1 ? '' : 's') . ' submitted by ' . $actorName . '.';

        $uids = (new UserModel())->idsHavingRoleNames(['super_admin']);
        if ($uids === []) {
            return;
        }

        $detailHtml = self::buildDetailHtml($entityType, $currentSnap, $proposed);

        ApprovalSubmitNotifier::notifySuperAdmins(
            $uids,
            'client_master_edit',
            $label . ' edit pending approval',
            $label . ' #' . $entityId . ' edit requires Super Admin approval (Approval #' . $approvalId . ').',
            'client_master_edit',
            $approvalId,
            'Client master edit',
            $approvalId,
            $summary,
            $detailHtml
        );
    }

    /**
     * @param array<string, mixed> $currentSnap
     * @param array<string, mixed> $proposed
     */
    private static function buildDetailHtml(string $entityType, array $currentSnap, array $proposed): string
    {
        $rows = self::buildChangeRows($entityType, $currentSnap, $proposed);
        if ($rows === []) {
            return '';
        }

        $lines = [];
        foreach ($rows as $row) {
            $lines[] = ApprovalDecisionNotifier::escapeDetail(
                $row['field'] . ': ' . $row['before'] . ' → ' . $row['after']
            );
        }

        return ApprovalDecisionNotifier::detailBlock(implode('<br/>', $lines));
    }

    /** @return array<string, string> */
    private static function fieldLabels(string $entityType): array
    {
        $shared = [
            'email'                       => 'Email',
            'secondary_email'             => 'Secondary email',
            'phone'                       => 'Phone',
            'secondary_phone'             => 'Secondary phone',
            'pan'                         => 'PAN',
            'gstin'                       => 'GSTIN',
            'website'                     => 'Website',
            'notes'                       => 'Notes',
            'reference'                   => 'Reference',
            'group_id'                    => 'Client group',
            'is_active'                   => 'Active',
            'referring_affiliate_user_id' => 'Referring affiliate',
            'referral_start_date'         => 'Referral start date',
            'commission_mode'             => 'Commission mode',
            'client_facing_restricted'    => 'Client-facing restricted',
            'default_billing_profile_code'=> 'Default billing profile',
        ];

        if ($entityType === 'contact') {
            return array_merge($shared, [
                'type'              => 'Type',
                'first_name'        => 'First name',
                'last_name'         => 'Last name',
                'organization_name' => 'Organization name',
                'address_line1'     => 'Address line 1',
                'address_line2'     => 'Address line 2',
                'city'              => 'City',
                'state'             => 'State',
                'pincode'           => 'Pincode',
                'country'           => 'Country',
                'contact_status'    => 'Contact status',
            ]);
        }

        return array_merge($shared, [
            'name'                => 'Name',
            'type'                => 'Type',
            'cin'                 => 'CIN',
            'address'             => 'Address',
            'city'                => 'City',
            'state'               => 'State',
            'country'             => 'Country',
            'pincode'             => 'Pincode',
            'organization_status' => 'Organization status',
            'primary_contact_id'  => 'Primary contact',
        ]);
    }

    /** @return list<int> */
    private static function normalizeIdList(mixed $raw): array
    {
        if (!is_array($raw)) {
            return [];
        }

        $ids = array_values(array_unique(array_filter(array_map(
            static fn ($v) => (int)$v,
            $raw
        ), static fn (int $n): bool => $n > 0)));
        sort($ids);

        return $ids;
    }

    private static function valuesEqual(mixed $a, mixed $b): bool
    {
        if (is_bool($a) || is_bool($b)) {
            return (bool)$a === (bool)$b;
        }
        if (is_array($a) || is_array($b)) {
            return json_encode($a) === json_encode($b);
        }

        return (string)($a ?? '') === (string)($b ?? '');
    }

    private static function formatValue(mixed $val): string
    {
        if ($val === null || $val === '') {
            return '—';
        }
        if (is_bool($val)) {
            return $val ? 'Yes' : 'No';
        }
        if (is_array($val)) {
            return implode(', ', array_map('strval', $val));
        }

        return (string)$val;
    }

    /** @return array<string, mixed> */
    private static function decodeJson(mixed $raw): array
    {
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);

            return is_array($decoded) ? $decoded : [];
        }

        return is_array($raw) ? $raw : [];
    }
}
