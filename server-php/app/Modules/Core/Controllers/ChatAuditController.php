<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\ChatConversationModel;
use App\Models\ChatMemberModel;
use App\Models\ChatMessageModel;
use App\Models\ClientChatConversationModel;

final class ChatAuditController extends BaseController
{
    /** GET /api/admin/chat/audit */
    public function search(): never
    {
        $this->requireSuperAdmin();

        $keyword = trim((string)$this->query('q', ''));
        $senderUserId = max(0, (int)$this->query('sender_user_id', 0));
        $conversationId = max(0, (int)$this->query('conversation_id', 0));
        $dateFrom = trim((string)$this->query('date_from', ''));
        $dateTo = trim((string)$this->query('date_to', ''));
        $conversationType = trim((string)$this->query('conversation_type', ''));
        $senderKind = trim((string)$this->query('sender_kind', ''));
        $page = max(1, (int)$this->query('page', 1));
        $perPage = min(100, max(1, (int)$this->query('per_page', 50)));

        $res = (new ChatMessageModel())->auditSearch(
            $keyword,
            $senderUserId,
            $conversationId,
            $dateFrom,
            $dateTo,
            $page,
            $perPage,
            $conversationType,
            $senderKind
        );

        $this->success($res['rows'], 'OK', 200, [
            'pagination' => [
                'page'     => $page,
                'per_page' => $perPage,
                'total'    => $res['total'],
            ],
        ]);
    }

    /** GET /api/admin/chat/audit/conversations/:id */
    public function conversationThread(int $id): never
    {
        $this->requireSuperAdmin();

        $conv = (new ChatConversationModel())->find($id);
        if ($conv === null) {
            $conv = (new ClientChatConversationModel())->find($id);
        }
        if ($conv === null) {
            $this->error('Conversation not found.', 404);
        }

        $afterId = max(0, (int)$this->query('after_id', 0));
        $beforeId = max(0, (int)$this->query('before_id', 0));
        $limit = min(200, max(1, (int)$this->query('limit', 100)));

        $messages = (new ChatMessageModel())->listForConversation($id, $afterId, $beforeId, $limit);
        $members = [];
        $clientSummary = null;
        if (($conv['type'] ?? '') === 'client_support') {
            $clientSummary = (new ClientChatConversationModel())->clientSummary($conv);
        } else {
            $members = (new ChatMemberModel())->listActiveMembers($id);
        }

        $this->success([
            'conversation' => $conv,
            'members'      => $members,
            'client_summary' => $clientSummary,
            'messages'     => $messages['rows'],
        ], 'OK', 200, ['has_more' => $messages['has_more']]);
    }

    private function requireSuperAdmin(): void
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        if (($user['role_name'] ?? '') === 'super_admin') {
            return;
        }
        if ($this->isSuperAdminEmail((string)($user['email'] ?? ''))) {
            return;
        }
        $this->error('Super Admin access required.', 403);
    }
}
