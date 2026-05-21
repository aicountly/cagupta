<?php
declare(strict_types=1);

namespace App\Controllers\Client;

use App\Controllers\BaseController;
use App\Libraries\ClientAssistantBot;
use App\Libraries\ClientChatNotifier;
use App\Models\ChatMessageModel;
use App\Models\ClientChatConversationModel;

final class ClientChatController extends BaseController
{
    /** GET /api/client/chat/thread */
    public function thread(): never
    {
        $user = $this->assertClient();
        $convModel = new ClientChatConversationModel();
        $conv = $convModel->getOrCreateForClient($user);
        $convId = (int)$conv['id'];

        $msgModel = new ChatMessageModel();
        $afterId = max(0, (int)$this->query('after_id', 0));
        $messages = $msgModel->listForConversation($convId, $afterId, 0, 50);
        $summary = $convModel->clientSummary($conv);

        if ($afterId > 0 && $messages['rows'] !== []) {
            $lastId = (int)$messages['rows'][array_key_last($messages['rows'])]['id'];
            $convModel->markClientRead($convId, $lastId);
        }

        $this->success([
            'conversation' => $this->formatConversation($conv, $summary),
            'messages' => $messages['rows'],
        ], 'OK', 200, ['has_more' => $messages['has_more']]);
    }

    /** POST /api/client/chat/messages */
    public function sendMessage(): never
    {
        $user = $this->assertClient();
        $body = $this->getJsonBody();
        $text = trim((string)($body['body_text'] ?? $body['text'] ?? ''));
        if ($text === '') {
            $this->error('Message body is required.', 422);
        }
        if (mb_strlen($text) > 5000) {
            $this->error('Message is too long (max 5000 characters).', 422);
        }

        $convModel = new ClientChatConversationModel();
        $conv = $convModel->getOrCreateForClient($user);
        $convId = (int)$conv['id'];

        if (!$convModel->checkRateLimit($convId)) {
            $this->error('Too many messages. Please wait a few minutes before sending again.', 429);
        }

        $summary = $convModel->clientSummary($conv);
        $clientName = (string)($summary['display_name'] ?? 'Client');

        $msgModel = new ChatMessageModel();
        $clientMsgId = $msgModel->insertClientMessage($convId, $text, $clientName);
        $convModel->touchLastMessage($convId);

        $recent = $msgModel->listForConversation($convId, 0, 0, 15)['rows'];
        $bot = new ClientAssistantBot();
        $botResult = $bot->reply($text, $recent);

        $botMsgId = $msgModel->insertBotMessage($convId, $botResult['reply'], $botResult['metadata']);
        $convModel->touchLastMessage($convId);
        $convModel->markClientRead($convId, $botMsgId);

        if ($botResult['escalate']) {
            $convModel->setNeedsAttention($convId, true);
            (new ClientChatNotifier())->notifyEscalation(
                $convId,
                $clientName,
                (string)$botResult['escalate_reason'],
                $text
            );
        }

        $clientMsg = $this->findMessage($clientMsgId);
        $botMsg = $this->findMessage($botMsgId);

        $this->success([
            'client_message' => $clientMsg,
            'bot_message' => $botMsg,
            'escalated' => $botResult['escalate'],
        ], 'Message sent.', 201);
    }

    /** POST /api/client/chat/read */
    public function markRead(): never
    {
        $user = $this->assertClient();
        $body = $this->getJsonBody();
        $messageId = max(0, (int)($body['message_id'] ?? 0));
        if ($messageId <= 0) {
            $this->error('message_id is required.', 422);
        }

        $convModel = new ClientChatConversationModel();
        $conv = $convModel->getOrCreateForClient($user);
        $convModel->markClientRead((int)$conv['id'], $messageId);
        $this->success(['message_id' => $messageId]);
    }

    /** @return array<string, mixed> */
    private function assertClient(): array
    {
        $u = $this->authUser();
        if ($u === null) {
            $this->error('Not authenticated.', 401);
        }
        if (($u['role_name'] ?? '') !== 'client') {
            $this->error('Client access only.', 403);
        }
        return $u;
    }

    /** @param array<string, mixed> $conv @param array<string, mixed> $summary */
    private function formatConversation(array $conv, array $summary): array
    {
        return [
            'id' => (int)$conv['id'],
            'type' => $conv['type'],
            'title' => $conv['title'],
            'client_display_name' => $summary['display_name'] ?? '',
            'needs_attention' => (bool)($conv['needs_attention'] ?? false),
            'last_message_at' => $conv['last_message_at'],
        ];
    }

    /** @return array<string, mixed>|null */
    private function findMessage(int $messageId): ?array
    {
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
        return $row ?: null;
    }
}
