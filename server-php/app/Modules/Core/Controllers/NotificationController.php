<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\UserNotificationModel;

final class NotificationController extends BaseController
{
    private UserNotificationModel $notifications;

    public function __construct()
    {
        $this->notifications = new UserNotificationModel();
    }

    /** GET /api/admin/notifications */
    public function index(): never
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        $uid   = (int)$user['id'];
        $limit = min(100, max(1, (int)$this->query('limit', 40)));
        $rows  = $this->notifications->listForUser($uid, $limit);
        $unread = $this->notifications->countUnread($uid);
        $this->success($rows, 'OK', 200, ['unread' => $unread]);
    }

    /** POST /api/admin/notifications/mark-read */
    public function markRead(): never
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        $uid  = (int)$user['id'];
        $body = $this->getJsonBody();
        if (!empty($body['all'])) {
            $this->notifications->markAllRead($uid);
        } else {
            $ids = $body['ids'] ?? [];
            if (!is_array($ids)) {
                $ids = [];
            }
            $this->notifications->markRead($uid, $ids);
        }
        $this->success(['unread' => $this->notifications->countUnread($uid)], 'Updated');
    }
}
