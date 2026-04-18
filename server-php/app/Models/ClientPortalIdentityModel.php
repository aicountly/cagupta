<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class ClientPortalIdentityModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    public function normalizeIdentifier(string $identifier): string
    {
        $value = strtolower(trim($identifier));
        if (str_contains($value, '@')) {
            return $value;
        }
        return preg_replace('/\D+/', '', $value) ?? '';
    }

    public function resolveByIdentifier(string $identifier): ?array
    {
        $id = $this->normalizeIdentifier($identifier);
        if ($id === '') {
            return null;
        }

        $contact = $this->findContactByIdentifier($id);
        if ($contact !== null) {
            return $contact;
        }

        return $this->findOrganizationByIdentifier($id);
    }

    public function availableOrganizationsForContact(int $contactId): array
    {
        $stmt = $this->db->prepare(
            "SELECT o.id, o.name
             FROM contact_organization co
             JOIN organizations o ON o.id = co.organization_id
             WHERE co.contact_id = :contact_id
               AND o.is_active = TRUE
             ORDER BY o.name ASC"
        );
        $stmt->execute([':contact_id' => $contactId]);
        return $stmt->fetchAll();
    }

    private function findContactByIdentifier(string $identifier): ?array
    {
        $query = str_contains($identifier, '@')
            ? "LOWER(c.email) = :identifier OR LOWER(c.secondary_email) = :identifier"
            : "regexp_replace(COALESCE(c.phone, ''), '\D+', '', 'g') = :identifier
               OR regexp_replace(COALESCE(c.secondary_phone, ''), '\D+', '', 'g') = :identifier";

        $stmt = $this->db->prepare(
            "SELECT c.id, c.first_name, c.last_name, c.organization_name, c.email, c.secondary_email, c.phone, c.secondary_phone
             FROM clients c
             WHERE c.is_active = TRUE
               AND ({$query})
             LIMIT 1"
        );
        $stmt->execute([':identifier' => $identifier]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }

        $display = trim((string)($row['organization_name'] ?? ''));
        if ($display === '') {
            $display = trim((string)($row['first_name'] ?? '') . ' ' . (string)($row['last_name'] ?? ''));
        }

        return [
            'entity_type'      => 'contact',
            'entity_id'        => (int)$row['id'],
            'display_name'     => $display !== '' ? $display : 'Client',
            'contact_id'       => (int)$row['id'],
            'organization_id'  => null,
            'available_orgs'   => $this->availableOrganizationsForContact((int)$row['id']),
        ];
    }

    private function findOrganizationByIdentifier(string $identifier): ?array
    {
        $query = str_contains($identifier, '@')
            ? "LOWER(o.email) = :identifier OR LOWER(o.secondary_email) = :identifier"
            : "regexp_replace(COALESCE(o.phone, ''), '\D+', '', 'g') = :identifier
               OR regexp_replace(COALESCE(o.secondary_phone, ''), '\D+', '', 'g') = :identifier";

        $stmt = $this->db->prepare(
            "SELECT o.id, o.name
             FROM organizations o
             WHERE o.is_active = TRUE
               AND ({$query})
             LIMIT 1"
        );
        $stmt->execute([':identifier' => $identifier]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }

        return [
            'entity_type'      => 'organization',
            'entity_id'        => (int)$row['id'],
            'display_name'     => (string)$row['name'],
            'contact_id'       => null,
            'organization_id'  => (int)$row['id'],
            'available_orgs'   => [['id' => (int)$row['id'], 'name' => (string)$row['name']]],
        ];
    }
}
