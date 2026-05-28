<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Libraries\BrevoMailer;
use App\Config\Database;
use App\Models\InboundEmailModel;
use App\Models\SupportTicketModel;

/**
 * Parses Brevo (Sendinblue) inbound webhook payloads, stores email + ticket, sends auto-reply.
 *
 * Gap fixes applied:
 *  1. Reads ticket_routing_settings.monitored_inbox_email from DB; only creates a ticket
 *     when the To address matches (or when the setting row is absent — fail-open).
 *  2. Detects duplicate MessageId (PostgreSQL SQLSTATE 23505) and returns the existing
 *     email ID silently instead of crashing.
 *  3. Stores attachment binary content (ContentBase64 from Brevo payload) to disk and
 *     writes the resulting path into inbound_email_attachments.stored_url.
 */
final class InboundProcessor
{
    /**
     * @param array<string, mixed> $rawJson Full decoded webhook body
     * @return array{email_id: int, ticket_id: int|null, public_id: string|null, duplicate: bool}
     */
    public function processWebhookPayload(array $rawJson): array
    {
        $norm = self::normalizePayload($rawJson);

        // ── 1. Resolve monitored inbox address ──────────────────────────────
        $monitoredEmail = $this->getMonitoredInboxEmail();

        // ── 2. Match sender to a known client ───────────────────────────────
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

        // ── 3. Persist inbound email (duplicate-safe) ────────────────────────
        $emails = new InboundEmailModel();
        [$emailId, $isDuplicate] = $emails->insertOrGetExisting([
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

        if ($isDuplicate) {
            return ['email_id' => $emailId, 'ticket_id' => null, 'public_id' => null, 'duplicate' => true];
        }

        // ── 4. Store attachment binaries ─────────────────────────────────────
        if ($norm['attachments'] !== []) {
            $storedAtts = $this->storeAttachments($emailId, $norm['attachments']);
            $emails->addAttachments($emailId, $storedAtts);
        }

        // ── 5. Routing filter: only create ticket when To matches monitored address ──
        $toEmails = strtolower($norm['to_emails']);
        $addressMatch = ($monitoredEmail === null)
            || str_contains($toEmails, strtolower($monitoredEmail));

        if (!$addressMatch) {
            return ['email_id' => $emailId, 'ticket_id' => null, 'public_id' => null, 'duplicate' => false];
        }

        // ── 6. Create support ticket ─────────────────────────────────────────
        $tickets  = new SupportTicketModel();
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

        $auto = '<p>Thank you for contacting CA Rahul Gupta\'s office.</p>'
            . '<p>Your request has been logged as <strong>' . htmlspecialchars($publicId, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</strong>.</p>'
            . '<p>We aim to respond within one business day. Please quote this reference in any follow-up.</p>';
        $tickets->addMessage($ticketId, 'system', 'Auto-reply sent to sender.', $auto, null, null);

        BrevoMailer::send(
            $norm['from_email'],
            $norm['from_name'] ?: $norm['from_email'],
            'Re: ' . $subj . ' [' . $publicId . ']',
            $auto
        );

        return ['email_id' => $emailId, 'ticket_id' => $ticketId, 'public_id' => $publicId, 'duplicate' => false];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns the monitored inbox address from ticket_routing_settings, or null
     * if the row/table is absent (fail-open: accept all).
     */
    private function getMonitoredInboxEmail(): ?string
    {
        try {
            $db   = Database::getConnection();
            $stmt = $db->query('SELECT monitored_inbox_email FROM ticket_routing_settings WHERE id = 1 LIMIT 1');
            $val  = $stmt ? $stmt->fetchColumn() : false;
            return ($val !== false && $val !== '') ? (string)$val : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Downloads/decodes attachment binaries and saves them to disk.
     * Returns the $attachments array with 'stored_url' populated for each saved file.
     *
     * Storage layout:
     *   {DOCU_BANK_PATH}/inbound_attachments/{email_id}/{uuid}.{ext}
     *
     * Brevo sends binary content as base64 in ContentBase64 (or Content).
     * If no content is present the attachment row is still saved — stored_url stays null.
     *
     * @param array<int, array<string, mixed>> $attachments From normalizePayload
     * @return array<int, array<string, mixed>>
     */
    private function storeAttachments(int $emailId, array $attachments): array
    {
        $baseDir = $this->attachmentStorageRoot();
        $dir     = $baseDir . DIRECTORY_SEPARATOR . $emailId;

        foreach ($attachments as &$att) {
            $b64 = (string)($att['content_base64'] ?? '');
            if ($b64 === '') {
                continue;
            }

            $binary = base64_decode($b64, true);
            if ($binary === false || $binary === '') {
                continue;
            }

            if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
                error_log('[InboundProcessor] Could not create attachment dir: ' . $dir);
                continue;
            }

            $ext      = $this->extensionFromMime((string)($att['content_type'] ?? ''), (string)($att['filename'] ?? ''));
            $uuid     = bin2hex(random_bytes(16));
            $filename = $uuid . ($ext !== '' ? '.' . $ext : '');
            $path     = $dir . DIRECTORY_SEPARATOR . $filename;

            if (file_put_contents($path, $binary) === false) {
                error_log('[InboundProcessor] Could not write attachment: ' . $path);
                continue;
            }

            $att['stored_url'] = 'inbound_attachments/' . $emailId . '/' . $filename;
        }
        unset($att);

        return $attachments;
    }

    /** @return non-empty-string */
    private function attachmentStorageRoot(): string
    {
        $env = trim((string)(getenv('DOCU_BANK_PATH') ?: ''));
        if ($env !== '' && is_dir(dirname($env))) {
            return rtrim($env, '/\\') . DIRECTORY_SEPARATOR . 'inbound_attachments';
        }
        // Fall back to {repo_root}/docu_bank/inbound_attachments
        return dirname(__DIR__, 4) . DIRECTORY_SEPARATOR . 'docu_bank' . DIRECTORY_SEPARATOR . 'inbound_attachments';
    }

    private function extensionFromMime(string $mime, string $filename): string
    {
        static $map = [
            'image/jpeg'       => 'jpg',
            'image/png'        => 'png',
            'image/gif'        => 'gif',
            'image/webp'       => 'webp',
            'application/pdf'  => 'pdf',
            'text/plain'       => 'txt',
            'text/html'        => 'html',
            'application/zip'  => 'zip',
            'application/msword' => 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
            'application/vnd.ms-excel'       => 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'       => 'xlsx',
        ];

        if (isset($map[$mime])) {
            return $map[$mime];
        }

        // Fall back to the original filename's extension
        $dot = strrpos($filename, '.');
        if ($dot !== false) {
            $ext = strtolower(substr($filename, $dot + 1));
            if (preg_match('/^[a-z0-9]{1,8}$/', $ext)) {
                return $ext;
            }
        }

        return '';
    }

    /**
     * @return array{
     *   message_id: string, from_email: string, from_name: string, to_emails: string,
     *   subject: string, body_text: string, body_html: string, received_at: ?string,
     *   attachments: array<int, array<string, mixed>>
     * }
     */
    private static function normalizePayload(array $j): array
    {
        $messageId   = '';
        $fromEmail   = '';
        $fromName    = '';
        $toEmails    = '';
        $subject     = '';
        $bodyText    = '';
        $bodyHtml    = '';
        $receivedAt  = null;
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
                        'filename'       => (string)($a['Name'] ?? $a['Filename'] ?? ''),
                        'content_type'   => (string)($a['ContentType'] ?? ''),
                        'size_bytes'     => isset($a['Size']) ? (int)$a['Size'] : null,
                        'external_ref'   => (string)($a['ID'] ?? $a['AttachmentID'] ?? ''),
                        // Brevo sends binary content as base64 in ContentBase64 (some versions use Content)
                        'content_base64' => (string)($a['ContentBase64'] ?? $a['Content'] ?? ''),
                        'stored_url'     => null,
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
            'message_id'  => $messageId,
            'from_email'  => $fromEmail,
            'from_name'   => $fromName,
            'to_emails'   => $toEmails,
            'subject'     => $subject,
            'body_text'   => $bodyText,
            'body_html'   => $bodyHtml,
            'received_at' => $receivedAt,
            'attachments' => $attachments,
        ];
    }
}
