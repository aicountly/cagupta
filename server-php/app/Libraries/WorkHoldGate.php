<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\ClientModel;
use App\Models\OrganizationModel;
use App\Models\WorkHoldExceptionModel;

/**
 * Enforces Accounts work-hold on new engagements and time entry.
 */
final class WorkHoldGate
{
    public const USER_MESSAGE = 'Work is Put on Hold by Accounts Team, Pls Request Removal of Hold.';

    /**
     * Block creating a new service for this billing entity when hold is on and no blanket window applies.
     * For new services there is no service_id yet — only a time-window exception can lift the block.
     */
    public static function reasonBlockedNewEngagement(string $clientType, ?int $clientId, ?int $organizationId): ?string
    {
        $ct = strtolower(trim($clientType));
        if ($ct === 'organization') {
            if ($organizationId === null || $organizationId <= 0) {
                return null;
            }
            $row = (new OrganizationModel())->find($organizationId);
            if ($row === null || empty($row['work_hold_active'])) {
                return null;
            }
            $ex = (new WorkHoldExceptionModel())->listCurrentlyEffective(null, $organizationId, 0);
            foreach ($ex as $e) {
                if (($e['exception_kind'] ?? '') === 'window') {
                    return null;
                }
            }

            return self::USER_MESSAGE;
        }

        if ($clientId === null || $clientId <= 0) {
            return null;
        }
        $row = (new ClientModel())->find($clientId);
        if ($row === null || empty($row['work_hold_active'])) {
            return null;
        }
        $ex = (new WorkHoldExceptionModel())->listCurrentlyEffective($clientId, null, 0);
        foreach ($ex as $e) {
            if (($e['exception_kind'] ?? '') === 'window') {
                return null;
            }
        }

        return self::USER_MESSAGE;
    }

    /**
     * Block time entry on this service when hold is on unless service-specific or window exception applies.
     *
     * @param array<string, mixed> $service Row from ServiceModel::find
     */
    public static function reasonBlockedTimeEntry(array $service): ?string
    {
        $sid = (int)($service['id'] ?? 0);
        if ($sid <= 0) {
            return null;
        }
        $ct = strtolower(trim((string)($service['client_type'] ?? 'contact')));
        if ($ct === 'organization') {
            $oid = (int)($service['organization_id'] ?? 0);
            if ($oid <= 0) {
                return null;
            }
            $row = (new OrganizationModel())->find($oid);
            if ($row === null || empty($row['work_hold_active'])) {
                return null;
            }
            $effective = (new WorkHoldExceptionModel())->listCurrentlyEffective(null, $oid, $sid);
            if ($effective !== []) {
                return null;
            }

            return self::USER_MESSAGE;
        }

        $cid = (int)($service['client_id'] ?? 0);
        if ($cid <= 0) {
            return null;
        }
        $row = (new ClientModel())->find($cid);
        if ($row === null || empty($row['work_hold_active'])) {
            return null;
        }
        $effective = (new WorkHoldExceptionModel())->listCurrentlyEffective($cid, null, $sid);
        if ($effective !== []) {
            return null;
        }

        return self::USER_MESSAGE;
    }
}
