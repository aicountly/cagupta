<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Libraries\BrevoMailer;
use App\Models\InboundEmailModel;
use App\Models\SupportTicketModel;

/**
 * Core inbox (inbound email) + support ticket workflow.
 */
final class SupportInboxController extends BaseController
{
    /** GET /api/admin/inbound-emails */
    public function inboundIndex(): never
    {
        if ($this->authUser() === null) {
            $this->error('Unauthorized.', 401);
        }
        $page = max(1, (int)$this->query('page', 1));
        $per  = min(100, max(1, (int)$this->query('per_page', 30)));
        $archived = filter_var($this->query('archived', '0'), FILTER_VALIDATE_BOOL);
        $res = (new InboundEmailModel())->paginate($page, $per, $archived);
        $this->success($res['rows'], 'OK', 200, [
            'pagination' => ['page' => $page, 'per_page' => $per, 'total' => $res['total']],
        ]);
    }

    /** GET /api/admin/inbound-emails/:id */
    public function inboundShow(int $id): never
    {
        if ($this->authUser() === null) {
            $this->error('Unauthorized.', 401);
        }
        $row = (new InboundEmailModel())->find($id);
        if ($row === null) {
            $this->error('Not found', 404);
        }
        $this->success($row);
    }

    /** PATCH /api/admin/inbound-emails/:id */
    public function inboundPatch(int $id): never
    {
        if ($this->authUser() === null) {
            $this->error('Unauthorized.', 401);
        }
        $body = $this->getJsonBody();
        $em   = new InboundEmailModel();
        if (array_key_exists('read', $body)) {
            $em->markRead($id, (bool)$body['read']);
        }
        if (array_key_exists('archived', $body)) {
            $em->setArchived($id, (bool)$body['archived']);
        }
        $this->success($em->find($id));
    }

    /** GET /api/admin/support-tickets */
    public function ticketsIndex(): never
    {
        if ($this->authUser() === null) {
            $this->error('Unauthorized.', 401);
        }
        $page   = max(1, (int)$this->query('page', 1));
        $per    = min(100, max(1, (int)$this->query('per_page', 30)));
        $status = trim((string)$this->query('status', ''));
        $res = (new SupportTicketModel())->paginate($page, $per, $status);
        $this->success($res['rows'], 'OK', 200, [
            'pagination' => ['page' => $page, 'per_page' => $per, 'total' => $res['total']],
        ]);
    }

    /** GET /api/admin/support-tickets/:id */
    public function ticketsShow(int $id): never
    {
        if ($this->authUser() === null) {
            $this->error('Unauthorized.', 401);
        }
        $t = (new SupportTicketModel())->find($id);
        if ($t === null) {
            $this->error('Not found', 404);
        }
        $t['messages'] = (new SupportTicketModel())->listMessages($id);
        $this->success($t);
    }

    /** POST /api/admin/support-tickets/:id/pick */
    public function ticketsPick(int $id): never
    {
        $u = $this->authUser();
        if ($u === null) {
            $this->error('Unauthorized.', 401);
        }
        $uid = (int)$u['id'];
        $res = (new SupportTicketModel())->tryPick($id, $uid);
        if (!$res['ok']) {
            $this->error('Ticket is locked by another user.', 409);
        }
        $this->success($res['current']);
    }

    /** POST /api/admin/support-tickets/:id/reply */
    public function ticketsReply(int $id): never
    {
        $u = $this->authUser();
        if ($u === null) {
            $this->error('Unauthorized.', 401);
        }
        $uid = (int)$u['id'];
        $tickets = new SupportTicketModel();
        if (!$tickets->assertPicker($id, $uid)) {
            $this->error('Pick this ticket before replying, or it is locked.', 409);
        }
        $row = $tickets->find($id);
        if ($row === null) {
            $this->error('Not found', 404);
        }
        $body = $this->getJsonBody();
        $html = trim((string)($body['html'] ?? ''));
        $text = trim((string)($body['text'] ?? ''));
        if ($html === '' && $text === '') {
            $this->error('text or html body required', 422);
        }
        if ($html === '') {
            $html = '<p>' . nl2br(htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')) . '</p>';
        }
        $em = (new InboundEmailModel())->find((int)($row['primary_inbound_email_id'] ?? 0));
        $to = $em['from_email'] ?? null;
        if (!$to) {
            $this->error('Original sender email missing', 422);
        }
        $subj = 'Re: ' . ($row['subject'] ?? 'Support') . ' [' . ($row['public_id'] ?? '') . ']';
        BrevoMailer::send($to, (string)($em['from_name'] ?? $to), $subj, $html);
        $tickets->addMessage($id, 'outbound', $text ?: strip_tags($html), $html, $uid, null);
        $this->success($tickets->find($id));
    }

    /** POST /api/admin/support-tickets/:id/resolve */
    public function ticketsResolve(int $id): never
    {
        $u = $this->authUser();
        if ($u === null) {
            $this->error('Unauthorized.', 401);
        }
        $body = $this->getJsonBody();
        $notes = isset($body['resolution_notes']) ? (string)$body['resolution_notes'] : null;
        $status = trim((string)($body['status'] ?? 'resolved'));
        if (!in_array($status, ['resolved', 'closed', 'open'], true)) {
            $status = 'resolved';
        }
        $ok = (new SupportTicketModel())->updateStatus($id, $status, $notes, (int)$u['id']);
        if (!$ok) {
            $this->error('Cannot update (locked or invalid).', 409);
        }
        $this->success((new SupportTicketModel())->find($id));
    }

    /** PATCH /api/admin/support-tickets/:id */
    public function ticketsPatch(int $id): never
    {
        $u = $this->authUser();
        if ($u === null) {
            $this->error('Unauthorized.', 401);
        }
        $body = $this->getJsonBody();
        if (array_key_exists('related_client_id', $body)) {
            $cid = $body['related_client_id'];
            (new SupportTicketModel())->setRelatedClient($id, $cid === null ? null : (int)$cid);
        }
        $row = (new SupportTicketModel())->find($id);
        if ($row === null) {
            $this->error('Not found', 404);
        }
        $this->success($row);
    }
}
