<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;

/**
 * ActivityTriggerController — Manage communication triggers on service activity.
 *
 * Routes:
 *   GET /api/admin/settings/triggers        → index
 *   PUT /api/admin/settings/triggers/:id    → update
 */
class ActivityTriggerController extends BaseController
{
    private \PDO $db;

    public function __construct()
    {
        $this->db = \App\Config\Database::connect();
    }

    /**
     * GET /api/admin/settings/triggers
     * Returns all trigger configurations.
     */
    public function index(): never
    {
        $rows = $this->db->query('SELECT * FROM activity_trigger_config ORDER BY id')->fetchAll(\PDO::FETCH_ASSOC);
        $this->success($rows);
    }

    /**
     * PUT /api/admin/settings/triggers/:id
     * Update a trigger configuration.
     *
     * Body: { enabled, testing_mode, test_email, test_mobile, channel }
     */
    public function update(int $id): never
    {
        $body  = $this->getJsonBody();
        $actor = $this->authUser();

        $row = $this->db->prepare('SELECT * FROM activity_trigger_config WHERE id = :id LIMIT 1');
        $row->execute([':id' => $id]);
        if (!$row->fetch()) $this->error('Trigger not found.', 404);

        $allowed = ['enabled', 'testing_mode', 'test_email', 'test_mobile', 'channel', 'template_name'];
        $updates = [];
        $params  = [':id' => $id, ':uid' => $actor['id']];

        foreach ($allowed as $field) {
            if (!array_key_exists($field, $body)) continue;
            $updates[] = "{$field} = :{$field}";
            $val = $body[$field];
            if (in_array($field, ['enabled', 'testing_mode'], true)) {
                $val = (bool)$val;
            }
            $params[":{$field}"] = $val;
        }

        if (empty($updates)) $this->error('No fields to update.', 422);

        $sql = 'UPDATE activity_trigger_config SET ' . implode(', ', $updates) . ', updated_by = :uid, updated_at = NOW() WHERE id = :id';
        $this->db->prepare($sql)->execute($params);

        $updated = $this->db->prepare('SELECT * FROM activity_trigger_config WHERE id = :id LIMIT 1');
        $updated->execute([':id' => $id]);
        $this->success($updated->fetch(\PDO::FETCH_ASSOC), 'Trigger updated');
    }
}
