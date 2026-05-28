<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\ClientModel;

/**
 * Shared helpers for client master audit snapshots and name-change detection.
 */
final class ClientMasterAudit
{
    /** @return list<string> */
    public static function contactNameFields(): array
    {
        return ['first_name', 'last_name', 'organization_name'];
    }

    /** @return list<string> */
    public static function organizationNameFields(): array
    {
        return ['name'];
    }

    /** @return list<string> */
    public static function clientGroupNameFields(): array
    {
        return ['name'];
    }

    /** @return list<string> */
    public static function nameFieldsForEntityType(string $entityType): array
    {
        return match ($entityType) {
            'contact'      => self::contactNameFields(),
            'organization' => self::organizationNameFields(),
            'client_group' => self::clientGroupNameFields(),
            default        => [],
        };
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    public static function contactSnapshot(array $row): array
    {
        return [
            'type'                      => $row['type'] ?? null,
            'first_name'                => $row['first_name'] ?? null,
            'last_name'                 => $row['last_name'] ?? null,
            'organization_name'         => $row['organization_name'] ?? null,
            'email'                     => $row['email'] ?? null,
            'secondary_email'           => $row['secondary_email'] ?? null,
            'phone'                     => $row['phone'] ?? null,
            'secondary_phone'           => $row['secondary_phone'] ?? null,
            'pan'                       => $row['pan'] ?? null,
            'gstin'                     => $row['gstin'] ?? null,
            'website'                   => $row['website'] ?? null,
            'address_line1'             => $row['address_line1'] ?? null,
            'address_line2'             => $row['address_line2'] ?? null,
            'city'                      => $row['city'] ?? null,
            'state'                     => $row['state'] ?? null,
            'pincode'                   => $row['pincode'] ?? null,
            'country'                   => $row['country'] ?? null,
            'notes'                     => $row['notes'] ?? null,
            'reference'                 => $row['reference'] ?? null,
            'group_id'                  => $row['group_id'] ?? null,
            'contact_status'            => $row['contact_status'] ?? null,
            'is_active'                 => $row['is_active'] ?? null,
            'referring_associate_user_id' => $row['referring_associate_user_id'] ?? null,
            'referral_start_date'       => $row['referral_start_date'] ?? null,
            'commission_mode'           => $row['commission_mode'] ?? null,
            'client_facing_restricted'  => $row['client_facing_restricted'] ?? null,
            'default_billing_profile_code' => $row['default_billing_profile_code'] ?? null,
            'linked_org_ids'            => $row['linked_org_ids'] ?? null,
        ];
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    public static function organizationSnapshot(array $row): array
    {
        return [
            'name'                      => $row['name'] ?? null,
            'type'                      => $row['type'] ?? null,
            'gstin'                     => $row['gstin'] ?? null,
            'pan'                       => $row['pan'] ?? null,
            'cin'                       => $row['cin'] ?? null,
            'email'                     => $row['email'] ?? null,
            'secondary_email'           => $row['secondary_email'] ?? null,
            'phone'                     => $row['phone'] ?? null,
            'secondary_phone'           => $row['secondary_phone'] ?? null,
            'address'                   => $row['address'] ?? null,
            'city'                      => $row['city'] ?? null,
            'state'                     => $row['state'] ?? null,
            'country'                   => $row['country'] ?? null,
            'pincode'                   => $row['pincode'] ?? null,
            'website'                   => $row['website'] ?? null,
            'notes'                     => $row['notes'] ?? null,
            'reference'                 => $row['reference'] ?? null,
            'group_id'                  => $row['group_id'] ?? null,
            'primary_contact_id'        => $row['primary_contact_id'] ?? null,
            'organization_status'       => $row['organization_status'] ?? null,
            'is_active'                 => $row['is_active'] ?? null,
            'referring_associate_user_id' => $row['referring_associate_user_id'] ?? null,
            'referral_start_date'       => $row['referral_start_date'] ?? null,
            'commission_mode'           => $row['commission_mode'] ?? null,
            'client_facing_restricted'  => $row['client_facing_restricted'] ?? null,
            'default_billing_profile_code' => $row['default_billing_profile_code'] ?? null,
        ];
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    public static function clientGroupSnapshot(array $row): array
    {
        return [
            'name'        => $row['name'] ?? null,
            'description' => $row['description'] ?? null,
            'color'       => $row['color'] ?? null,
        ];
    }

    /**
     * @param array<string, mixed> $current
     * @param array<string, mixed> $data   Update payload (may include name fields)
     */
    public static function nameFieldsChanged(string $entityType, array $current, array $data): bool
    {
        foreach (self::nameFieldsForEntityType($entityType) as $field) {
            if (!array_key_exists($field, $data)) {
                continue;
            }
            $old = self::normalizeNameValue($data[$field], $field);
            $cur = self::normalizeNameValue($current[$field] ?? null, $field);
            if ($old !== $cur) {
                return true;
            }
        }

        return false;
    }

    /**
     * Extract proposed name values from update payload.
     *
     * @param array<string, mixed> $current
     * @param array<string, mixed> $data
     *
     * @return array<string, mixed>
     */
    public static function extractProposedNameValues(string $entityType, array $current, array $data): array
    {
        $proposed = [];
        foreach (self::nameFieldsForEntityType($entityType) as $field) {
            if (array_key_exists($field, $data)) {
                $proposed[$field] = self::normalizeNameValue($data[$field], $field);
            } else {
                $proposed[$field] = self::normalizeNameValue($current[$field] ?? null, $field);
            }
        }

        return $proposed;
    }

    /**
     * Remove name fields from update payload (mutates copy).
     *
     * @param array<string, mixed> $data
     *
     * @return array<string, mixed>
     */
    public static function stripNameFields(string $entityType, array $data): array
    {
        foreach (self::nameFieldsForEntityType($entityType) as $field) {
            unset($data[$field]);
        }

        return $data;
    }

    /**
     * @param array<string, mixed> $row
     */
    public static function displayNameForEntity(string $entityType, array $row): string
    {
        if ($entityType === 'contact') {
            return ClientModel::displayName($row);
        }

        return trim((string)($row['name'] ?? ''));
    }

    private static function normalizeNameValue(mixed $v, string $field): ?string
    {
        if ($v === null) {
            return null;
        }
        $s = trim((string)$v);

        return $s === '' ? null : $s;
    }
}
