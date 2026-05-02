<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Libraries\BrevoMailer;
use App\Config\Database;
use App\Models\InboundEmailModel;
use App\Models\SupportTicketModel;

/**
 * Parses Brevo (Sendinblue) inbound webhook payloads, stores email + ticket, sends auto-reply.
 */
final class InboundProcessor
{
    /**
     * @param array<string, mixed> $rawJson Full decoded webhook body
     * @return array{email_id: int, ticket_id: int, public_id: string}
     */
    public function processWebhookPayload(array $rawJson): array
    {
        $norm = self::normalizePayload($rawJson);

        $clientId = null;
        $fromEm   = strtolower(trim($norm['from_email']));
        if ($fromEm !== '' && $fromEm !== 'unknown@invalid.local') {
            $cdb = Database::getConnection();
            $st  = $cdb->prepare('SELECT id FROM clients WHERE LOWER(TRIM(email)) = :e LIMIT 1');
            $st->execute([':e' => $fromEm]);
            $cid = $st->fetchColumn();
            if ($cid !== false) {
                $clientId = (int)$cid;
            }
        }

        $emails = new InboundEmailModel();
        $emailId = $emails->insert([
            'message_id'       => $norm['message_id'] ?: null,
            'from_email'       => $norm['from_email'],
            'from_name'        => $norm['from_name'],
            'to_emails'        => $norm['to_emails'],
            'subject'          => $norm['subject'],
            'body_text'        => $norm['body_text'],
            'body_html'        => $norm['body_html'],
            'raw_payload'      => $rawJson,
            'received_at'      => $norm['received_at'],
            'matched_client_id'=> $clientId,
        ]);

        if ($norm['attachments'] !== []) {
            $emails->addAttachments($emailId, $norm['attachments']);
        }

        $tickets = new SupportTicketModel();
        $publicId = $tickets->nextPublicId();
        $subj     = $norm['subject'] ?: '(no subject)';
        $ticketId = $tickets->create([
            'public_id'               => $publicId,
            'status'                  => 'open',
            'subject'                 => $subj,
            'primary_inbound_email_id'=> $emailId,
            'created_from'            => 'email',
            'related_client_id'       => $clientId,
        ]);

        $snippet = $norm['body_text'] ?? '';
        if ($snippet === '' && $norm['body_html'] !== '') {
            $snippet = strip_tags($norm['body_html']);
        }
        $snippet = trim(mb_substr($snippet, 0, 2000));
        $tickets->addMessage($ticketId, 'inbound', $snippet ?: '[No text body]', null, null, $norm['message_id'] ?: null);

        $auto = '<p>Thank you for contacting CA Rahul Gupta’s office.</p>'
            . '<p>Your request has been logged as <strong>' . htmlspecialchars($publicId, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</strong>.</p>'
            . '<p>We aim to respond within one business day. Please quote this reference in any follow-up.</p>';
        $tickets->addMessage($ticketId, 'system', 'Auto-reply sent to sender.', $auto, null, null);

        BrevoMailer::send(
            $norm['from_email'],
            $norm['from_name'] ?: $norm['from_email'],
            'Re: ' . $subj . ' [' . $publicId . ']',
            $auto
        );

        return ['email_id' => $emailId, 'ticket_id' => $ticketId, 'public_id' => $publicId];
    }

    /** @return array{message_id: string, from_email: string, from_name: string, to_emails: string, subject: string, body_text: string, body_html: string, received_at: ?string, attachments: array<int, array<string, mixed>>} */
    private static function normalizePayload(array $j): array
    {
        $messageId  = '';
        $fromEmail  = '';
        $fromName   = '';
        $toEmails   = '';
        $subject    = '';
        $bodyText   = '';
        $bodyHtml   = '';
        $receivedAt = null;
        $attachments = [];

        if (isset($j['items'][0]) && is_array($j['items'][0])) {
            $item = $j['items'][0];
            $messageId = (string)($item['Uuid'] ?? $item['MessageId'] ?? '');
            if (isset($item['From'])) {
                $f = $item['From'];
                if (is_array($f)) {
                    $fromEmail = (string)($f['Address'] ?? $f['Email'] ?? '');
                    $fromName  = (string)($f['Name'] ?? '');
                }
            }
            if (isset($item['To']) && is_array($item['To'])) {
                $tos = [];
                foreach ($item['To'] as $t) {
                    if (is_array($t)) {
                        $tos[] = (string)($t['Address'] ?? $t['Email'] ?? '');
                    }
                }
                $toEmails = implode(', ', array_filter($tos));
            }
            $subject  = (string)($item['Subject'] ?? '');
            $bodyText = (string)($item['RawTextBody'] ?? $item['TextBody'] ?? '');
            $bodyHtml = (string)($item['RawHtmlBody'] ?? $item['HtmlBody'] ?? '');
            if (!empty($item['Date'])) {
                $receivedAt = date('c', strtotime((string)$item['Date']));
            }
            if (isset($item['Attachments']) && is_array($item['Attachments'])) {
                foreach ($item['Attachments'] as $a) {
                    if (!is_array($a)) {
                        continue;
                    }
                    $attachments[] = [
                        'filename'     => (string)($a['Name'] ?? $a['Filename'] ?? ''),
                        'content_type' => (string)($a['ContentType'] ?? ''),
                        'size_bytes'   => isset($a['Size']) ? (int)$a['Size'] : null,
                        'external_ref' => (string)($a['ID'] ?? $a['AttachmentID'] ?? ''),
                    ];
                }
            }
        } else {
            $messageId = (string)($j['message-id'] ?? $j['message_id'] ?? '');
            $fromEmail = (string)($j['from_email'] ?? $j['sender'] ?? '');
            $subject   = (string)($j['subject'] ?? '');
            $bodyText  = (string)($j['text'] ?? $j['body_text'] ?? '');
            $bodyHtml  = (string)($j['html'] ?? $j['body_html'] ?? '');
            $toEmails  = (string)($j['to'] ?? '');
        }

        if ($fromEmail === '') {
            $fromEmail = 'unknown@invalid.local';
        }

        return [
            'message_id'   => $messageId,
            'from_email'   => $fromEmail,
            'from_name'    => $fromName,
            'to_emails'    => $toEmails,
            'subject'      => $subject,
            'body_text'    => $bodyText,
            'body_html'    => $bodyHtml,
            'received_at'  => $receivedAt,
            'attachments'  => $attachments,
        ];
    }
}
