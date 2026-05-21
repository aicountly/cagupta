<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Auth as AuthConfig;
use App\Controllers\BaseController;
use App\Libraries\ChatNotifier;
use App\Models\AdminAuditLogModel;
use App\Models\ChatConversationModel;
use App\Models\ChatMemberModel;
use App\Models\ChatMessageModel;

final class ChatController extends BaseController
{
    /** GET /api/chat/conversations */
    public function conversationsIndex(): never
    {
        $user = $this->requireAuth();
        $rows = (new ChatConversationModel())->listForUser((int)$user['id']);
        $this->success($rows);
    }

    /** POST /api/chat/conversations */
    public function conversationsCreate(): never
    {
        $user = $this->requireAuth();
        $body = $this->getJsonBody();
        $type = trim((string)($body['type'] ?? ''));
        $convModel = new ChatConversationModel();
        $actorId = (int)$user['id'];

        if ($type === 'dm') {
            $peerId = (int)($body['peer_user_id'] ?? 0);
            if ($peerId <= 0 || $peerId === $actorId) {
                $this->error('Valid peer_user_id is required for a DM.', 422);
            }
            if (!$convModel->userHasChatUse($peerId)) {
                $this->error('Selected user cannot use chat.', 422);
            }
            $convId = $convModel->createDm($actorId, $peerId, $actorId);
            $this->success($this->formatConversation($convId, $actorId));
        }

        if ($type === 'channel') {
            if (!$this->isAdminRole($user)) {
                $this->error('Only admin users can create channels.', 403);
            }
            $title = trim((string)($body['title'] ?? ''));
            if ($title === '') {
                $this->error('Channel title is required.', 422);
            }
            $memberIds = array_map('intval', (array)($body['member_user_ids'] ?? []));
            $memberIds = array_values(array_filter($memberIds, static fn (int $id): bool => $id > 0));
            foreach ($memberIds as $mid) {
                if (!$convModel->userHasChatUse($mid)) {
                    $this->error("User {$mid} cannot use chat.", 422);
                }
            }
            $convId = $convModel->createChannel($title, $actorId, $memberIds);
            (new AdminAuditLogModel())->insert(
                $actorId,
                'chat_channel_created',
                'chat_conversation',
                $convId,
                ['title' => $title, 'member_user_ids' => $memberIds]
            );
            $this->success($this->formatConversation($convId, $actorId), 'Channel created.', 201);
        }

        $this->error('type must be dm or channel.', 422);
    }

    /** GET /api/chat/conversations/:id */
    public function conversationsShow(int $id): never
    {
        $user = $this->requireAuth();
        $this->requireMember($id, (int)$user['id']);
        $this->success($this->formatConversation($id, (int)$user['id']));
    }

    /** GET /api/chat/conversations/:id/messages */
    public function messagesIndex(int $id): never
    {
        $user = $this->requireAuth();
        $this->requireMember($id, (int)$user['id']);

        $afterId = max(0, (int)$this->query('after_id', 0));
        $beforeId = max(0, (int)$this->query('before_id', 0));
        $limit = min(100, max(1, (int)$this->query('limit', 50)));

        $res = (new ChatMessageModel())->listForConversation($id, $afterId, $beforeId, $limit);
        $this->success($res['rows'], 'OK', 200, ['has_more' => $res['has_more']]);
    }

    /** POST /api/chat/conversations/:id/messages */
    public function messagesCreate(int $id): never
    {
        $user = $this->requireAuth();
        $this->requireMember($id, (int)$user['id']);

        $body = $this->getJsonBody();
        $text = trim((string)($body['body_text'] ?? $body['text'] ?? ''));
        if ($text === '') {
            $this->error('Message body is required.', 422);
        }
        if (mb_strlen($text) > 10000) {
            $this->error('Message is too long (max 10000 characters).', 422);
        }

        $convModel = new ChatConversationModel();
        $conv = $convModel->find($id);
        if ($conv === null) {
            $this->error('Conversation not found.', 404);
        }

        $senderName = (string)($user['name'] ?? 'User');
        $messageId = (new ChatMessageModel())->insert($id, (int)$user['id'], $text, $senderName);
        $convModel->touchLastMessage($id);
        (new ChatMemberModel())->markRead($id, (int)$user['id'], $messageId);

        $displayTitle = $this->conversationDisplayTitle($conv, (int)$user['id']);
        (new ChatNotifier())->notifyNewMessage($id, (int)$user['id'], $senderName, $text, $displayTitle);

        $this->success([
            'id'              => $messageId,
            'conversation_id' => $id,
            'sender_user_id'  => (int)$user['id'],
            'sender_name'     => $senderName,
            'body_text'       => $text,
            'created_at'      => date('c'),
        ], 'Message sent.', 201);
    }

    /** POST /api/chat/conversations/:id/read */
    public function markRead(int $id): never
    {
        $user = $this->requireAuth();
        $this->requireMember($id, (int)$user['id']);

        $body = $this->getJsonBody();
        $messageId = max(0, (int)($body['message_id'] ?? $body['last_read_message_id'] ?? 0));
        if ($messageId <= 0) {
            $this->error('message_id is required.', 422);
        }

        (new ChatMemberModel())->markRead($id, (int)$user['id'], $messageId);
        $this->success(['conversation_id' => $id, 'last_read_message_id' => $messageId]);
    }

    /** GET /api/chat/contacts */
    public function contacts(): never
    {
        $user = $this->requireAuth();
        $rows = (new ChatConversationModel())->listChatEnabledUsers((int)$user['id']);
        $this->success($rows);
    }

    /** GET /api/chat/unread-count */
    public function unreadCount(): never
    {
        $user = $this->requireAuth();
        $count = (new ChatMemberModel())->totalUnreadForUser((int)$user['id']);
        $this->success(['unread_count' => $count]);
    }

    /** POST /api/chat/conversations/:id/members */
    public function addMembers(int $id): never
    {
        $user = $this->requireAuth();
        if (!$this->isAdminRole($user)) {
            $this->error('Only admin users can add channel members.', 403);
        }

        $convModel = new ChatConversationModel();
        $conv = $convModel->find($id);
        if ($conv === null || ($conv['type'] ?? '') !== 'channel') {
            $this->error('Channel not found.', 404);
        }

        $body = $this->getJsonBody();
        $userIds = array_map('intval', (array)($body['user_ids'] ?? $body['member_user_ids'] ?? []));
        $userIds = array_values(array_unique(array_filter($userIds, static fn (int $uid): bool => $uid > 0)));
        if ($userIds === []) {
            $this->error('user_ids is required.', 422);
        }
        foreach ($userIds as $uid) {
            if (!$convModel->userHasChatUse($uid)) {
                $this->error("User {$uid} cannot use chat.", 422);
            }
        }

        (new ChatMemberModel())->addMembers($id, $userIds);
        (new AdminAuditLogModel())->insert(
            (int)$user['id'],
            'chat_channel_members_added',
            'chat_conversation',
            $id,
            ['user_ids' => $userIds]
        );

        $this->success($this->formatConversation($id, (int)$user['id']));
    }

    /** POST /api/chat/conversations/:id/leave */
    public function leave(int $id): never
    {
        $user = $this->requireAuth();
        $conv = (new ChatConversationModel())->find($id);
        if ($conv === null) {
            $this->error('Conversation not found.', 404);
        }
        if (($conv['type'] ?? '') !== 'channel') {
            $this->error('You can only leave channels.', 422);
        }
        if (!((new ChatMemberModel())->isActiveMember($id, (int)$user['id']))) {
            $this->error('Not a member of this channel.', 403);
        }

        (new ChatMemberModel())->leave($id, (int)$user['id']);
        (new AdminAuditLogModel())->insert(
            (int)$user['id'],
            'chat_channel_left',
            'chat_conversation',
            $id,
            ['user_id' => (int)$user['id']]
        );

        $this->success(['left' => true]);
    }

    /** @return array<string, mixed> */
    private function requireAuth(): array
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        return $user;
    }

    private function requireMember(int $conversationId, int $userId): void
    {
        if (!(new ChatMemberModel())->isActiveMember($conversationId, $userId)) {
            $this->error('Access denied.', 403);
        }
    }

    /** @param array<string, mixed> $user */
    private function isAdminRole(array $user): bool
    {
        if ($this->isSuperAdminEmail((string)($user['email'] ?? ''))) {
            return true;
        }
        $role = (string)($user['role_name'] ?? '');
        return in_array($role, ['super_admin', 'admin'], true);
    }

    /** @return array<string, mixed> */
    private function formatConversation(int $conversationId, int $viewerUserId): array
    {
        $convModel = new ChatConversationModel();
        $conv = $convModel->find($conversationId);
        if ($conv === null) {
            $this->error('Conversation not found.', 404);
        }

        $members = (new ChatMemberModel())->listActiveMembers($conversationId);
        $conv['display_title'] = $this->conversationDisplayTitle($conv, $viewerUserId);
        $conv['members'] = $members;

        return $conv;
    }

    /** @param array<string, mixed> $conv */
    private function conversationDisplayTitle(array $conv, int $viewerUserId): string
    {
        if (($conv['type'] ?? '') === 'channel') {
            return (string)($conv['title'] ?? 'Channel');
        }

        $a = (int)($conv['dm_user_a_id'] ?? 0);
        $b = (int)($conv['dm_user_b_id'] ?? 0);
        $peerId = ($a === $viewerUserId) ? $b : $a;
        foreach ((new ChatMemberModel())->listActiveMembers((int)$conv['id']) as $m) {
            if ((int)$m['user_id'] === $peerId) {
                return (string)($m['name'] ?? 'Direct message');
            }
        }

        return 'Direct message';
    }
}
