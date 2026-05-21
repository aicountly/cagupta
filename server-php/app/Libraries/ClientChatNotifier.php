<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\ClientChatConversationModel;
use App\Models\UserNotificationModel;

final class ClientChatNotifier
{
    public function notifyEscalation(int $conversationId, string $clientName, string $reason, string $preview): void
    {
        $userIds = (new ClientChatConversationModel())->listStaffUserIdsWithManagePermission();
        if ($userIds === []) {
            return;
        }

        $title = 'Client chat needs attention';
        $body = $clientName . ': ' . mb_substr($preview, 0, 160);
        if ($reason !== '') {
            $body = $clientName . ' — ' . mb_substr($reason, 0, 80) . '. ' . mb_substr($preview, 0, 100);
        }

        (new UserNotificationModel())->createForUsers(
            $userIds,
            'client_chat_escalation',
            $title,
            $body,
            'chat_conversation',
            $conversationId
        );
    }
}
