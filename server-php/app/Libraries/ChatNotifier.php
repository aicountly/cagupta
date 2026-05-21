<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\ChatMemberModel;
use App\Models\UserNotificationModel;

final class ChatNotifier
{
    public function notifyNewMessage(
        int $conversationId,
        int $senderUserId,
        string $senderName,
        string $preview,
        string $conversationTitle
    ): void {
        $memberModel = new ChatMemberModel();
        $recipientIds = $memberModel->activeMemberUserIds($conversationId, $senderUserId);
        if ($recipientIds === []) {
            return;
        }

        $title = $conversationTitle !== '' ? $conversationTitle : 'New message';
        $body = $senderName . ': ' . mb_substr($preview, 0, 200);

        (new UserNotificationModel())->createForUsers(
            $recipientIds,
            'chat_message',
            $title,
            $body,
            'chat_conversation',
            $conversationId
        );
    }
}
