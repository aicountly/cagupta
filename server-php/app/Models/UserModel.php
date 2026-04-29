<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Libraries\PasswordHasher;
use PDO;

/**
 * UserModel — CRUD operations for the `users` table.
 *
 * All queries use PDO prepared statements; no raw string interpolation.
 */
class UserModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Find a user by email address.
     *
     * @return array<string, mixed>|null
     */
    public function findByEmail(string $email): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT u.*, r.name AS role_name, r.display_name AS role_display_name,
                    r.permissions AS role_permissions
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE u.email = :email
             LIMIT 1'
        );
        $stmt->execute([':email' => $email]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Find a user by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT u.*, r.name AS role_name, r.display_name AS role_display_name,
                    r.permissions AS role_permissions
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE u.id = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Find a user by SSO provider + provider ID.
     *
     * @return array<string, mixed>|null
     */
    public function findBySso(string $provider, string $providerId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT u.*, r.name AS role_name, r.display_name AS role_display_name,
                    r.permissions AS role_permissions
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE u.login_provider = :provider AND u.sso_provider_id = :pid
             LIMIT 1'
        );
        $stmt->execute([':provider' => $provider, ':pid' => $providerId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Return a paginated list of users with role information.
     *
     * @return array{total: int, users: array<int, array<string, mixed>>}
     */
    /**
     * @param int $delegatorId If > 0, only users created by this id (or the delegator themself) are listed.
     */
    public function paginate(
        int $page = 1,
        int $perPage = 20,
        string $search = '',
        string $role = '',
        string $status = '',
        int $delegatorId = 0
    ): array {
        $where  = ['1=1'];
        $params = [];

        if ($search !== '') {
            $where[]          = "(u.name ILIKE :search OR u.email ILIKE :search)";
            $params[':search'] = "%{$search}%";
        }
        if ($role !== '') {
            $where[]        = 'r.name = :role';
            $params[':role'] = $role;
        }
        if ($status !== '') {
            $where[]         = 'u.is_active = :is_active_filter';
            $params[':is_active_filter'] = ($status === 'active') ? 'true' : 'false';
        }
        if ($delegatorId > 0) {
            $where[]                    = '(u.created_by = :delegator_id OR u.id = :delegator_self)';
            $params[':delegator_id']    = $delegatorId;
            $params[':delegator_self']  = $delegatorId;
        }

        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE {$whereClause}"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT u.id, u.name, u.email, u.is_active, u.is_email_verified,
                    u.avatar_url, u.last_login_at, u.login_provider, u.created_at,
                    u.planned_billable_rate_per_hour, u.shift_target_minutes,
                    r.name AS role_name, r.display_name AS role_display_name
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE {$whereClause}
             ORDER BY u.created_at DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit',  $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset,  PDO::PARAM_INT);
        $stmt->execute();

        return ['total' => $total, 'users' => $stmt->fetchAll()];
    }

    /**
     * Create a new user.
     *
     * @param array<string, mixed> $data
     * @return int The new user's id.
     */
    public function create(array $data): int
    {
        if (!empty($data['password'])) {
            $data['password_hash'] = PasswordHasher::hash($data['password']);
        }

        $stmt = $this->db->prepare(
            'INSERT INTO users (name, email, password_hash, role_id, is_active, is_email_verified,
                                login_provider, sso_provider_id, avatar_url, created_by, shift_target_minutes)
             VALUES (:name, :email, :password_hash, :role_id, :is_active, :is_email_verified,
                     :login_provider, :sso_provider_id, :avatar_url, :created_by, :shift_target_minutes)
             RETURNING id'
        );
        $stmt->execute([
            ':name'            => $data['name'],
            ':email'           => $data['email'],
            ':password_hash'   => $data['password_hash'] ?? null,
            ':role_id'         => $data['role_id'] ?? null,
            ':is_active'         => (isset($data['is_active']) ? (bool)$data['is_active'] : true) ? 'true' : 'false',
            ':is_email_verified' => (isset($data['is_email_verified']) ? (bool)$data['is_email_verified'] : false) ? 'true' : 'false',
            ':login_provider'  => $data['login_provider'] ?? 'local',
            ':sso_provider_id' => $data['sso_provider_id'] ?? null,
            ':avatar_url'      => $data['avatar_url'] ?? null,
            ':created_by'      => $data['created_by'] ?? null,
            ':shift_target_minutes' => isset($data['shift_target_minutes']) ? (int)$data['shift_target_minutes'] : 510,
        ]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Update an existing user.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $setClauses = [];
        $params     = [':id' => $id];

        $allowed = ['name', 'email', 'role_id', 'is_active', 'avatar_url', 'last_login_at', 'sso_provider_id', 'planned_billable_rate_per_hour', 'shift_target_minutes'];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $setClauses[]       = "{$field} = :{$field}";
                if ($field === 'is_active') {
                    $params[":{$field}"] = ((bool)$data[$field]) ? 'true' : 'false';
                } else {
                    $params[":{$field}"] = $data[$field];
                }
            }
        }
        if (!empty($data['password'])) {
            $setClauses[]            = 'password_hash = :password_hash';
            $params[':password_hash'] = PasswordHasher::hash($data['password']);
        }

        if (empty($setClauses)) {
            return false;
        }

        $setClauses[] = 'updated_at = NOW()';
        $setClause    = implode(', ', $setClauses);

        $stmt = $this->db->prepare("UPDATE users SET {$setClause} WHERE id = :id");
        return $stmt->execute($params);
    }

    /**
     * Soft-delete a user by setting is_active = false.
     */
    public function deactivate(int $id): bool
    {
        $stmt = $this->db->prepare('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = :id');
        return $stmt->execute([':id' => $id]);
    }

    /**
     * Record the timestamp of the user's last successful login.
     */
    public function touchLastLogin(int $id): void
    {
        $stmt = $this->db->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id');
        $stmt->execute([':id' => $id]);
    }

    /**
     * Distinct active users to notify for invoice / admin alerts: admin + super_admin roles, plus super-admin email.
     *
     * @return array<int, array{email: string, name: string}>
     */
    public function listActiveAdminNotificationRecipients(): array
    {
        $superEmail = \App\Config\Auth::SUPER_ADMIN_EMAIL;
        $stmt       = $this->db->prepare(
            "SELECT TRIM(u.email) AS email,
                    COALESCE(NULLIF(TRIM(u.name), ''), TRIM(u.email)) AS name
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE u.is_active = TRUE
               AND TRIM(COALESCE(u.email, '')) <> ''
               AND (
                   r.name IN ('admin', 'super_admin')
                   OR LOWER(TRIM(u.email)) = LOWER(:super_email)
               )"
        );
        $stmt->execute([':super_email' => $superEmail]);
        $rows = $stmt->fetchAll();
        $seen = [];
        $out  = [];
        foreach ($rows as $row) {
            $email = trim((string)($row['email'] ?? ''));
            if ($email === '') {
                continue;
            }
            $key = strtolower($email);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $out[]      = [
                'email' => $email,
                'name'  => (string)($row['name'] ?? $email),
            ];
        }

        return $out;
    }
}
