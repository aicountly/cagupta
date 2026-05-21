<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\ChatMessageModel;
use App\Models\ClientChatConversationModel;

final class ClientChatStaffController extends BaseController
{
    /** GET /api/admin/client-chat/threads */
    public function threadsIndex(): never
    {
        $this->requireAuth();
        $filter = trim((string)$this->query('filter', ''));
        $page = max(1, (int)$this->query('page', 1));
        $perPage = min(100, max(1, (int)$this->query('per_page', 50)));

        $res = (new ClientChatConversationModel())->listThreads($filter, $page, $perPage);
        $this->success($res['rows'], 'OK', 200, [
            'pagination' => ['page' => $page, 'per_page' => $perPage, 'total' => $res['total']],
        ]);
    }

    /** GET /api/admin/client-chat/threads/:id */
    public function threadsShow(int $id): never
    {
        $this->requireAuth();
        $convModel = new ClientChatConversationModel();
        $conv = $convModel->find($id);
        if ($conv === null || ($conv['type'] ?? '') !== 'client_support') {
            $this->error('Thread not found.', 404);
        }

        $summary = $convModel->clientSummary($conv);
        $this->success([
            'conversation' => array_merge($conv, ['client_summary' => $summary]),
        ]);
    }

    /** GET /api/admin/client-chat/threads/:id/messages */
    public function messagesIndex(int $id): never
    {
        $this->requireAuth();
        $this->requireClientSupportThread($id);

        $afterId = max(0, (int)$this->query('after_id', 0));
        $limit = min(100, max(1, (int)$this->query('limit', 50)));
        $res = (new ChatMessageModel())->listForConversation($id, $afterId, 0, $limit);
        $this->success($res['rows'], 'OK', 200, ['has_more' => $res['has_more']]);
    }

    /** POST /api/admin/client-chat/threads/:id/messages */
    public function messagesCreate(int $id): never
    {
        $user = $this->requireAuth();
        $this->requireClientSupportThread($id);

        $body = $this->getJsonBody();
        $text = trim((string)($body['body_text'] ?? $body['text'] ?? ''));
        if ($text === '') {
            $this->error('Message body is required.', 422);
        }

        $senderName = (string)($user['name'] ?? 'CA Team');
        $msgModel = new ChatMessageModel();
        $messageId = $msgModel->insert($id, (int)$user['id'], $text, $senderName);

        $convModel = new ClientChatConversationModel();
        $convModel->touchLastMessage($id);
        $convModel->markStaffRead($id, $messageId);

        $db = \App\Config\Database::getConnection();
        $q = $db->prepare(
            'SELECT msg.id, msg.conversation_id, msg.sender_user_id, msg.sender_kind,
                    msg.sender_display_name, msg.body_text, msg.metadata, msg.created_at,
                    COALESCE(msg.sender_display_name, u.name) AS sender_name
             FROM chat_messages msg
             LEFT JOIN users u ON u.id = msg.sender_user_id
             WHERE msg.id = :id LIMIT 1'
        );
        $q->execute([':id' => $messageId]);
        $row = $q->fetch(\PDO::FETCH_ASSOC);

        $this->success($row, 'Message sent.', 201);
    }

    /** POST /api/admin/client-chat/threads/:id/read */
    public function markRead(int $id): never
    {
        $this->requireAuth();
        $this->requireClientSupportThread($id);

        $body = $this->getJsonBody();
        $messageId = max(0, (int)($body['message_id'] ?? 0));
        if ($messageId <= 0) {
            $this->error('message_id is required.', 422);
        }

        (new ClientChatConversationModel())->markStaffRead($id, $messageId);
        $this->success(['message_id' => $messageId]);
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

    private function requireClientSupportThread(int $id): void
    {
        $conv = (new ClientChatConversationModel())->find($id);
        if ($conv === null || ($conv['type'] ?? '') !== 'client_support') {
            $this->error('Thread not found.', 404);
        }
    }
}
