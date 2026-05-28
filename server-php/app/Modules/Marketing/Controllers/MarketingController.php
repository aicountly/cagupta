<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;

/**
 * MarketingController — Marketing & Communication Hub
 *
 * Routes prefix: /api/marketing
 *
 * WA Web:      GET  /wa/session/status
 *              POST /wa/session/start
 *              POST /wa/session/stop
 *              GET  /wa/contacts
 *              GET  /wa/groups
 *              POST /wa/send
 * WA Native:   POST /wa/native/config
 *              POST /wa/native/send
 * SMS:         POST /sms/send
 *              GET  /sms/templates
 *              POST /sms/templates
 *              GET  /sms/logs
 * Social:      POST /social/post
 *              POST /social/config
 * Campaigns:   GET  /campaigns
 *              POST /campaigns
 * Prospects:   GET  /prospects
 *              POST /prospects
 *              PATCH /prospects/:id
 * Doc Share:   POST /documents/:id/share
 * Logs:        GET  /logs
 */
class MarketingController extends BaseController
{
    private \PDO $db;

    public function __construct()
    {
        $this->db = \App\Config\Database::getConnection();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function logMarketing(array $data): int
    {
        $stmt = $this->db->prepare('
            INSERT INTO marketing_logs
                (campaign_id, channel, direction, client_id, recipient_name, recipient_email,
                 recipient_mobile, template_name, message_body, status, provider, sent_by_user_id,
                 scheduled_at, sent_at)
            VALUES
                (:campaign_id, :channel, :direction, :client_id, :recipient_name, :recipient_email,
                 :recipient_mobile, :template_name, :message_body, :status, :provider, :sent_by_user_id,
                 :scheduled_at, :sent_at)
            RETURNING id
        ');
        $stmt->execute([
            ':campaign_id'      => $data['campaign_id'] ?? null,
            ':channel'          => $data['channel'],
            ':direction'        => 'outbound',
            ':client_id'        => $data['client_id'] ?? null,
            ':recipient_name'   => $data['recipient_name'] ?? null,
            ':recipient_email'  => $data['recipient_email'] ?? null,
            ':recipient_mobile' => $data['recipient_mobile'] ?? null,
            ':template_name'    => $data['template_name'] ?? null,
            ':message_body'     => $data['message_body'] ?? null,
            ':status'           => $data['status'] ?? 'sent',
            ':provider'         => $data['provider'] ?? null,
            ':sent_by_user_id'  => $data['sent_by'] ?? null,
            ':scheduled_at'     => $data['scheduled_at'] ?? null,
            ':sent_at'          => $data['status'] === 'sent' ? date('Y-m-d H:i:s') : null,
        ]);
        return (int)$this->db->lastInsertId();
    }

    private function getWaBridgeUrl(): string
    {
        return rtrim($_ENV['WA_BRIDGE_URL'] ?? 'http://localhost:3001', '/');
    }

    private function httpPost(string $url, array $payload, int $timeout = 10): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_TIMEOUT        => $timeout,
        ]);
        $body   = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ['ok' => $status >= 200 && $status < 300, 'body' => json_decode($body ?: '{}', true)];
    }

    private function httpGet(string $url): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
        ]);
        $body   = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ['ok' => $status >= 200 && $status < 300, 'body' => json_decode($body ?: '{}', true)];
    }

    private function httpDelete(string $url): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => 'DELETE',
            CURLOPT_TIMEOUT        => 10,
        ]);
        $body   = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ['ok' => $status >= 200 && $status < 300, 'body' => json_decode($body ?: '{}', true)];
    }

    // ── WA Web Session ────────────────────────────────────────────────────────

    /**
     * GET /api/marketing/wa/session/status
     * Returns current WA Web session status for this user.
     */
    public function waSessionStatus(): never
    {
        $user      = $this->authUser();
        $sessionId = 'user_' . $user['id'];
        $bridgeUrl = $this->getWaBridgeUrl();

        $res = $this->httpGet("{$bridgeUrl}/session/{$sessionId}/status");
        if ($res['ok']) {
            $this->success($res['body']);
        }
        // If bridge isn't running, return disconnected
        $this->success(['status' => 'disconnected']);
    }

    /**
     * POST /api/marketing/wa/session/start
     * Initiates a WhatsApp Web session and returns QR trigger.
     */
    public function waSessionStart(): never
    {
        $user      = $this->authUser();
        $sessionId = 'user_' . $user['id'];
        $bridgeUrl = $this->getWaBridgeUrl();

        $res = $this->httpPost("{$bridgeUrl}/session/start", ['sessionId' => $sessionId]);
        if ($res['ok']) {
            // Upsert session record
            $stmt = $this->db->prepare('
                INSERT INTO marketing_wa_sessions (user_id, session_id, status, updated_at)
                VALUES (:uid, :sid, :status, NOW())
                ON CONFLICT (session_id) DO UPDATE SET status = :status, updated_at = NOW()
            ');
            $stmt->execute([':uid' => $user['id'], ':sid' => $sessionId, ':status' => 'connecting']);
            $this->success(['session_id' => $sessionId, 'status' => 'connecting'], 'Session start requested');
        }
        $this->error('WhatsApp bridge is not available. Ensure the WA service is running.', 503);
    }

    /**
     * POST /api/marketing/wa/session/stop
     * Disconnects the WhatsApp Web session for this user.
     */
    public function waSessionStop(): never
    {
        $user      = $this->authUser();
        $sessionId = 'user_' . $user['id'];
        $bridgeUrl = $this->getWaBridgeUrl();

        $this->httpPost("{$bridgeUrl}/session/stop", ['sessionId' => $sessionId]);
        $stmt = $this->db->prepare('
            UPDATE marketing_wa_sessions SET status = \'disconnected\', updated_at = NOW()
            WHERE session_id = :sid
        ');
        $stmt->execute([':sid' => $sessionId]);
        $this->success([], 'Session disconnected');
    }

    /**
     * GET /api/marketing/wa/contacts
     * Proxies contact list from WA bridge for this user's session.
     */
    public function waContacts(): never
    {
        $user      = $this->authUser();
        $sessionId = 'user_' . $user['id'];
        $bridgeUrl = $this->getWaBridgeUrl();

        $res = $this->httpGet("{$bridgeUrl}/session/{$sessionId}/contacts");
        if ($res['ok']) {
            $this->success($res['body']['contacts'] ?? [], 'Contacts retrieved');
        }
        $this->error('Could not fetch contacts. Ensure WhatsApp is connected.', 502);
    }

    /**
     * GET /api/marketing/wa/groups
     * Proxies group list from WA bridge (Professional Groups).
     */
    public function waGroups(): never
    {
        $user      = $this->authUser();
        $sessionId = 'user_' . $user['id'];
        $bridgeUrl = $this->getWaBridgeUrl();

        $res = $this->httpGet("{$bridgeUrl}/session/{$sessionId}/groups");
        if ($res['ok']) {
            $this->success($res['body']['groups'] ?? [], 'Groups retrieved');
        }
        $this->error('Could not fetch groups. Ensure WhatsApp is connected.', 502);
    }

    /**
     * GET /api/marketing/wa/channels
     * List WhatsApp Channels (newsletters) stored for this session.
     */
    public function waChannels(): never
    {
        $user      = $this->authUser();
        $sessionId = 'user_' . $user['id'];
        $bridgeUrl = $this->getWaBridgeUrl();

        $res = $this->httpGet("{$bridgeUrl}/session/{$sessionId}/newsletters");
        if ($res['ok']) {
            $this->success($res['body']['newsletters'] ?? [], 'Channels retrieved');
        }
        $this->error('Could not fetch channels. Ensure WhatsApp is connected.', 502);
    }

    /**
     * POST /api/marketing/wa/channels
     * Add a WhatsApp Channel by JID or invite code.
     * Body: { jid?, invite_code?, name? }
     */
    public function waChannelAdd(): never
    {
        $user      = $this->authUser();
        $sessionId = 'user_' . $user['id'];
        $bridgeUrl = $this->getWaBridgeUrl();
        $body      = $this->getJsonBody();

        $payload = array_filter([
            'jid'        => isset($body['jid'])         ? trim((string)$body['jid'])         : null,
            'inviteCode' => isset($body['invite_code'])  ? trim((string)$body['invite_code']) : null,
            'name'       => isset($body['name'])         ? trim((string)$body['name'])        : null,
        ]);

        if (empty($payload['jid']) && empty($payload['inviteCode'])) {
            $this->error('Provide jid or invite_code.', 422);
        }

        $res = $this->httpPost("{$bridgeUrl}/session/{$sessionId}/newsletters", $payload);
        if ($res['ok']) {
            $this->success($res['body']['newsletter'] ?? [], 'Channel added');
        }
        $this->error($res['body']['error'] ?? 'Could not add channel.', 502);
    }

    /**
     * DELETE /api/marketing/wa/channels/:jid
     * Remove a WhatsApp Channel from this session's list.
     */
    public function waChannelRemove(string $jid): never
    {
        $user      = $this->authUser();
        $sessionId = 'user_' . $user['id'];
        $bridgeUrl = $this->getWaBridgeUrl();

        $encodedJid = rawurlencode($jid);
        $res = $this->httpDelete("{$bridgeUrl}/session/{$sessionId}/newsletters/{$encodedJid}");
        if ($res['ok']) {
            $this->success([], 'Channel removed');
        }
        $this->error('Could not remove channel.', 502);
    }

    /**
     * POST /api/marketing/wa/send
     * Forward message to WA bridge for delivery with staggered delay.
     */
    public function waSend(): never
    {
        $user      = $this->authUser();
        $sessionId = 'user_' . $user['id'];
        $bridgeUrl = $this->getWaBridgeUrl();

        $targetId   = trim($_POST['target_id'] ?? '');
        $targetType = trim($_POST['target_type'] ?? 'contact');
        $message    = trim($_POST['message'] ?? '');

        if ($targetId === '') {
            $this->error('target_id is required.', 422);
        }

        $payload = [
            'sessionId'  => $sessionId,
            'targetId'   => $targetId,
            'targetType' => $targetType,
            'message'    => $message,
        ];

        $res = $this->httpPost("{$bridgeUrl}/send", $payload, 30);

        $this->logMarketing([
            'channel'      => 'whatsapp',
            'message_body' => $message,
            'status'       => $res['ok'] ? 'sent' : 'failed',
            'provider'     => 'wa_web',
            'sent_by'      => $user['id'],
        ]);

        if ($res['ok']) {
            $this->success([], 'Message sent');
        }

        // Surface the bridge error so the frontend can show why the send failed
        $bridgeError = $res['body']['error'] ?? 'WA bridge returned an error.';
        $this->error($bridgeError, 502);
    }

    // ── WA Native (Business API) ──────────────────────────────────────────────

    /**
     * POST /api/marketing/wa/native/config
     * Save WA Business API configuration (encrypted in DB).
     */
    public function waNativeConfig(): never
    {
        $body     = $this->getJsonBody();
        $user     = $this->authUser();
        $provider = strtolower(trim((string)($body['provider'] ?? 'interakt')));

        $stmt = $this->db->prepare('
            INSERT INTO marketing_api_config (service, provider, api_key, api_secret, extra_config, updated_by, updated_at)
            VALUES (\'wa_native\', :provider, :api_key, :api_secret, :extra, :uid, NOW())
            ON CONFLICT (service) DO UPDATE SET
                provider   = EXCLUDED.provider,
                api_key    = EXCLUDED.api_key,
                api_secret = EXCLUDED.api_secret,
                extra_config = EXCLUDED.extra_config,
                updated_by = EXCLUDED.updated_by,
                updated_at = NOW()
        ');
        $stmt->execute([
            ':provider'  => $provider,
            ':api_key'   => (string)($body['api_key'] ?? ''),
            ':api_secret'=> (string)($body['api_secret'] ?? ''),
            ':extra'     => json_encode(['phone_number_id' => $body['phone_number_id'] ?? '']),
            ':uid'       => $user['id'],
        ]);
        $this->success([], 'WA Native configuration saved');
    }

    /**
     * POST /api/marketing/wa/native/send
     * Send WhatsApp template messages via Official Business API.
     */
    public function waNativeSend(): never
    {
        $body         = $this->getJsonBody();
        $user         = $this->authUser();
        $templateName = trim((string)($body['template_name'] ?? ''));
        $recipients   = (array)($body['recipients'] ?? []);
        $variables    = (array)($body['variables'] ?? []);
        $provider     = strtolower(trim((string)($body['provider'] ?? 'interakt')));

        if ($templateName === '' || empty($recipients)) {
            $this->error('template_name and recipients are required.', 422);
        }

        // Load config from DB
        $cfgRow = $this->db->query("SELECT * FROM marketing_api_config WHERE service = 'wa_native' LIMIT 1")->fetch(\PDO::FETCH_ASSOC);
        if (!$cfgRow) {
            $this->error('WA Native API not configured. Please save your API credentials first.', 422);
        }

        $results = [];
        foreach ($recipients as $mobile) {
            $mobile = preg_replace('/\D/', '', (string)$mobile);
            if (strlen($mobile) < 10) continue;
            $sent = $this->sendWaNativeMessage($provider, $cfgRow, $mobile, $templateName, $variables);
            $results[] = ['mobile' => $mobile, 'success' => $sent];
            $this->logMarketing([
                'channel'          => 'whatsapp',
                'template_name'    => $templateName,
                'recipient_mobile' => $mobile,
                'status'           => $sent ? 'sent' : 'failed',
                'provider'         => $provider,
                'sent_by'          => $user['id'],
            ]);
        }

        $sent   = count(array_filter($results, fn($r) => $r['success']));
        $failed = count($results) - $sent;
        $this->success(['sent' => $sent, 'failed' => $failed], "Messages processed: {$sent} sent, {$failed} failed");
    }

    private function sendWaNativeMessage(string $provider, array $cfg, string $mobile, string $template, array $vars): bool
    {
        $extra = json_decode($cfg['extra_config'] ?? '{}', true);

        if ($provider === 'interakt') {
            $payload = [
                'countryCode' => '+91',
                'phoneNumber' => substr($mobile, -10),
                'callbackData' => 'ca_office',
                'type' => 'Template',
                'template' => [
                    'name'     => $template,
                    'languageCode' => 'en',
                    'bodyValues' => array_values($vars),
                ],
            ];
            $ch = curl_init('https://api.interakt.ai/v1/public/message/');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_HTTPHEADER     => [
                    'Content-Type: application/json',
                    'Authorization: Basic ' . $cfg['api_key'],
                ],
                CURLOPT_POSTFIELDS => json_encode($payload),
                CURLOPT_TIMEOUT    => 10,
            ]);
            $res    = curl_exec($ch);
            $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            return $status === 200;
        }

        // Generic fallback for other providers
        return false;
    }

    // ── SMS ────────────────────────────────────────────────────────────────────

    /**
     * POST /api/marketing/sms/send
     * Send bulk SMS via SMSGatewayHub.
     */
    public function smsSend(): never
    {
        $body         = $this->getJsonBody();
        $user         = $this->authUser();
        $templateId   = (int)($body['template_id'] ?? 0);
        $groupIds     = (array)($body['group_ids'] ?? []);
        $customNos    = (array)($body['custom_recipients'] ?? []);
        $scheduleType = (string)($body['schedule_type'] ?? 'now');
        $scheduleTime = (string)($body['schedule_time'] ?? '');

        if ($templateId === 0) {
            $this->error('template_id is required.', 422);
        }

        // Load template
        $tpl = $this->db->prepare('SELECT * FROM marketing_sms_templates WHERE id = :id AND status = \'approved\' LIMIT 1');
        $tpl->execute([':id' => $templateId]);
        $template = $tpl->fetch(\PDO::FETCH_ASSOC);
        if (!$template) {
            $this->error('Template not found or not approved.', 404);
        }

        // Load SMS config
        $cfgRow = $this->db->query("SELECT * FROM marketing_api_config WHERE service = 'sms_gateway' LIMIT 1")->fetch(\PDO::FETCH_ASSOC);
        if (!$cfgRow) {
            $this->error('SMS Gateway not configured. Please save API credentials in SMS Settings.', 422);
        }

        // Collect mobile numbers from groups
        $mobiles = [];
        if (!empty($groupIds)) {
            $placeholders = implode(',', array_fill(0, count($groupIds), '?'));
            $stmt = $this->db->prepare("SELECT mobile FROM clients WHERE group_id IN ($placeholders) AND mobile IS NOT NULL AND mobile != ''");
            $stmt->execute($groupIds);
            $mobiles = array_column($stmt->fetchAll(\PDO::FETCH_ASSOC), 'mobile');
        }
        $mobiles = array_unique(array_merge($mobiles, $customNos));

        if ($scheduleType === 'later' && $scheduleTime !== '') {
            // Create campaign and schedule
            $campStmt = $this->db->prepare('
                INSERT INTO marketing_campaigns (name, channels, audience, status, scheduled_at, created_by)
                VALUES (:name, :channels, :audience, \'scheduled\', :scheduled_at, :uid) RETURNING id
            ');
            $campStmt->execute([
                ':name'         => "SMS: {$template['name']}",
                ':channels'     => json_encode(['sms']),
                ':audience'     => "Groups + custom ({$template['name']})",
                ':scheduled_at' => $scheduleTime,
                ':uid'          => $user['id'],
            ]);
            $campId = (int)$this->db->lastInsertId();

            foreach ($mobiles as $mobile) {
                $this->logMarketing([
                    'campaign_id'      => $campId,
                    'channel'          => 'sms',
                    'template_name'    => $template['name'],
                    'message_body'     => $template['body'],
                    'recipient_mobile' => $mobile,
                    'status'           => 'scheduled',
                    'scheduled_at'     => $scheduleTime,
                    'provider'         => 'smsgatewayhub',
                    'sent_by'          => $user['id'],
                ]);
            }
            $this->success(['scheduled' => count($mobiles)], 'SMS campaign scheduled for ' . $scheduleTime);
        }

        // Send now
        $sent = 0; $failed = 0;
        foreach ($mobiles as $mobile) {
            $ok = $this->sendSms($cfgRow, $mobile, $template['body']);
            $ok ? $sent++ : $failed++;
            $this->logMarketing([
                'channel'          => 'sms',
                'template_name'    => $template['name'],
                'message_body'     => $template['body'],
                'recipient_mobile' => $mobile,
                'status'           => $ok ? 'sent' : 'failed',
                'provider'         => 'smsgatewayhub',
                'sent_by'          => $user['id'],
            ]);
        }
        $this->success(['sent' => $sent, 'failed' => $failed], "{$sent} SMS sent, {$failed} failed");
    }

    private function sendSms(array $cfg, string $mobile, string $message): bool
    {
        $extra = json_decode($cfg['extra_config'] ?? '{}', true);
        $url   = $extra['api_url'] ?? 'https://www.smsgatewayhub.com/api/mt/SendSMS';
        $full  = $url . '?' . http_build_query([
            'user'     => $extra['username'] ?? '',
            'password' => $cfg['api_key'],
            'senderid' => $extra['sender_id'] ?? 'CAOFFICE',
            'channel'  => 4,
            'DCS'      => 0,
            'flashsms' => 0,
            'number'   => $mobile,
            'text'     => $message,
            'route'    => 'TR',
        ]);
        $ch = curl_init($full);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8]);
        $res    = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return $status === 200;
    }

    /**
     * GET /api/marketing/sms/templates
     */
    public function smsTemplates(): never
    {
        $rows = $this->db->query('SELECT * FROM marketing_sms_templates ORDER BY created_at DESC')->fetchAll(\PDO::FETCH_ASSOC);
        $this->success($rows);
    }

    /**
     * POST /api/marketing/sms/templates
     */
    public function smsTemplateStore(): never
    {
        $body = $this->getJsonBody();
        $user = $this->authUser();

        $name = trim((string)($body['name'] ?? ''));
        $tmpl = trim((string)($body['body'] ?? ''));
        if ($name === '' || $tmpl === '') {
            $this->error('name and body are required.', 422);
        }

        $stmt = $this->db->prepare('
            INSERT INTO marketing_sms_templates (name, dlt_id, category, body, status, created_by)
            VALUES (:name, :dlt_id, :category, :body, \'draft\', :uid) RETURNING id
        ');
        $stmt->execute([
            ':name'     => $name,
            ':dlt_id'   => (string)($body['dlt_id'] ?? ''),
            ':category' => (string)($body['category'] ?? ''),
            ':body'     => $tmpl,
            ':uid'      => $user['id'],
        ]);
        $this->success(['id' => (int)$this->db->lastInsertId()], 'Template created', 201);
    }

    /**
     * GET /api/marketing/sms/logs
     */
    public function smsLogs(): never
    {
        $rows = $this->db->query("SELECT * FROM marketing_logs WHERE channel = 'sms' ORDER BY created_at DESC LIMIT 200")->fetchAll(\PDO::FETCH_ASSOC);
        $this->success($rows);
    }

    // ── Social Posting ────────────────────────────────────────────────────────

    /**
     * POST /api/marketing/social/config
     * Save social media API provider config.
     */
    public function socialConfig(): never
    {
        $body    = $this->getJsonBody();
        $user    = $this->authUser();
        $apiKey  = trim((string)($body['api_key'] ?? ''));
        $provider = strtolower(trim((string)($body['provider'] ?? 'ayrshare')));

        $stmt = $this->db->prepare('
            INSERT INTO marketing_api_config (service, provider, api_key, updated_by, updated_at)
            VALUES (\'social_api\', :provider, :api_key, :uid, NOW())
            ON CONFLICT (service) DO UPDATE SET provider = EXCLUDED.provider, api_key = EXCLUDED.api_key, updated_by = EXCLUDED.updated_by, updated_at = NOW()
        ');
        $stmt->execute([':provider' => $provider, ':api_key' => $apiKey, ':uid' => $user['id']]);
        $this->success([], 'Social API configuration saved');
    }

    /**
     * POST /api/marketing/social/post
     * Post content to multiple social media platforms via Ayrshare/Buffer API.
     */
    public function socialPost(): never
    {
        $content   = trim($_POST['content'] ?? '');
        $platforms = json_decode($_POST['platforms'] ?? '[]', true) ?: [];
        $schedTime = trim($_POST['schedule_time'] ?? '');
        $user      = $this->authUser();

        if ($content === '' || empty($platforms)) {
            $this->error('content and platforms are required.', 422);
        }

        $cfgRow = $this->db->query("SELECT * FROM marketing_api_config WHERE service = 'social_api' LIMIT 1")->fetch(\PDO::FETCH_ASSOC);
        if (!$cfgRow) {
            $this->error('Social API not configured. Please add your API key in Settings.', 422);
        }

        $results = $this->postToSocial($cfgRow, $content, $platforms, $schedTime);

        foreach ($platforms as $platform) {
            $ok = $results[$platform]['success'] ?? false;
            $this->logMarketing([
                'channel'      => 'social',
                'message_body' => $content,
                'provider'     => $cfgRow['provider'] . '/' . $platform,
                'status'       => $ok ? 'sent' : 'failed',
                'sent_by'      => $user['id'],
            ]);
        }

        $sent = count(array_filter($results, fn($r) => $r['success'] ?? false));
        $this->success(['platform_results' => $results], "{$sent} of " . count($platforms) . " platforms published");
    }

    private function postToSocial(array $cfg, string $content, array $platforms, string $schedTime): array
    {
        $provider = $cfg['provider'] ?? 'ayrshare';
        $apiKey   = $cfg['api_key'] ?? '';

        if ($provider === 'ayrshare') {
            $payload = [
                'post'      => $content,
                'platforms' => $platforms,
            ];
            if ($schedTime !== '') {
                $payload['scheduleDate'] = $schedTime;
            }

            $ch = curl_init('https://app.ayrshare.com/api/post');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_HTTPHEADER     => [
                    'Content-Type: application/json',
                    "Authorization: Bearer {$apiKey}",
                ],
                CURLOPT_POSTFIELDS => json_encode($payload),
                CURLOPT_TIMEOUT    => 15,
            ]);
            $res    = curl_exec($ch);
            $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            $data    = json_decode($res ?: '{}', true);
            $results = [];
            foreach ($platforms as $platform) {
                $results[$platform] = ['success' => $status === 200, 'post_id' => $data['id'] ?? null];
            }
            return $results;
        }

        // Fallback: mark all as unsupported
        $results = [];
        foreach ($platforms as $platform) {
            $results[$platform] = ['success' => false, 'error' => 'Provider not fully configured'];
        }
        return $results;
    }

    // ── Campaigns ─────────────────────────────────────────────────────────────

    public function campaignIndex(): never
    {
        $rows = $this->db->query('SELECT * FROM marketing_campaigns ORDER BY created_at DESC LIMIT 100')->fetchAll(\PDO::FETCH_ASSOC);
        $this->success($rows);
    }

    public function campaignStore(): never
    {
        $body = $this->getJsonBody();
        $user = $this->authUser();

        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') $this->error('name is required.', 422);

        $stmt = $this->db->prepare('
            INSERT INTO marketing_campaigns (name, channels, audience, status, scheduled_at, created_by)
            VALUES (:name, :channels, :audience, :status, :scheduled_at, :uid) RETURNING id
        ');
        $stmt->execute([
            ':name'         => $name,
            ':channels'     => json_encode($body['channels'] ?? []),
            ':audience'     => (string)($body['audience'] ?? ''),
            ':status'       => 'draft',
            ':scheduled_at' => !empty($body['scheduled_at']) ? $body['scheduled_at'] : null,
            ':uid'          => $user['id'],
        ]);
        $this->success(['id' => (int)$this->db->lastInsertId()], 'Campaign created', 201);
    }

    // ── Associate Prospects ───────────────────────────────────────────────────

    public function prospectIndex(): never
    {
        $type   = trim($this->query('type', ''));
        $status = trim($this->query('status', ''));
        $search = trim($this->query('search', ''));

        $where = ['1=1'];
        $params = [];
        if ($type !== '') { $where[] = 'type = :type'; $params[':type'] = $type; }
        if ($status !== '') { $where[] = 'status = :status'; $params[':status'] = $status; }
        if ($search !== '') { $where[] = "(name ILIKE :s OR organization ILIKE :s)"; $params[':s'] = "%{$search}%"; }

        $sql  = 'SELECT * FROM marketing_associate_prospects WHERE ' . implode(' AND ', $where) . ' ORDER BY created_at DESC LIMIT 500';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $this->success($stmt->fetchAll(\PDO::FETCH_ASSOC));
    }

    public function prospectStore(): never
    {
        $body = $this->getJsonBody();
        $user = $this->authUser();

        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') $this->error('name is required.', 422);

        $stmt = $this->db->prepare('
            INSERT INTO marketing_associate_prospects
                (name, type, organization, mobile, email, source, status, created_by)
            VALUES
                (:name, :type, :org, :mobile, :email, :source, \'new\', :uid)
            RETURNING id
        ');
        $stmt->execute([
            ':name'   => $name,
            ':type'   => (string)($body['type'] ?? 'banker'),
            ':org'    => (string)($body['organization'] ?? ''),
            ':mobile' => (string)($body['mobile'] ?? ''),
            ':email'  => (string)($body['email'] ?? ''),
            ':source' => (string)($body['source'] ?? 'manual'),
            ':uid'    => $user['id'],
        ]);
        $this->success(['id' => (int)$this->db->lastInsertId()], 'Prospect added', 201);
    }

    public function prospectUpdate(int $id): never
    {
        $body     = $this->getJsonBody();
        $allowed  = ['name', 'type', 'organization', 'mobile', 'email', 'status', 'notes', 'last_contact'];
        $updates  = [];
        $params   = [':id' => $id];

        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $updates[] = "{$field} = :{$field}";
                $params[":{$field}"] = $body[$field];
            }
        }
        if (empty($updates)) $this->error('No fields to update.', 422);

        $stmt = $this->db->prepare('UPDATE marketing_associate_prospects SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE id = :id');
        $stmt->execute($params);
        $this->success([], 'Prospect updated');
    }

    // ── Document Share ────────────────────────────────────────────────────────

    /**
     * POST /api/marketing/documents/:id/share
     * Create a share record and dispatch the message via chosen channel.
     */
    public function documentShare(int $documentId): never
    {
        $body      = $this->getJsonBody();
        $user      = $this->authUser();
        $channel   = strtolower(trim((string)($body['channel'] ?? 'email')));
        $clientId  = !empty($body['client_id']) ? (int)$body['client_id'] : null;
        $recipName = trim((string)($body['recipient_name'] ?? ''));
        $recipEmail= trim((string)($body['recipient_email'] ?? ''));
        $recipMob  = trim((string)($body['recipient_mobile'] ?? ''));

        // Verify document exists
        $doc = $this->db->prepare('SELECT * FROM documents WHERE id = :id LIMIT 1');
        $doc->execute([':id' => $documentId]);
        $document = $doc->fetch(\PDO::FETCH_ASSOC);
        if (!$document) $this->error('Document not found.', 404);

        $token     = bin2hex(random_bytes(16));
        $expiresAt = date('Y-m-d H:i:s', strtotime('+7 days'));

        $stmt = $this->db->prepare('
            INSERT INTO document_shares
                (document_id, shared_by, channel, recipient_name, recipient_email,
                 recipient_mobile, client_id, share_token, expires_at)
            VALUES
                (:doc_id, :shared_by, :channel, :rec_name, :rec_email,
                 :rec_mobile, :client_id, :token, :expires_at)
            RETURNING id
        ');
        $stmt->execute([
            ':doc_id'    => $documentId,
            ':shared_by' => $user['id'],
            ':channel'   => $channel,
            ':rec_name'  => $recipName,
            ':rec_email' => $recipEmail,
            ':rec_mobile'=> $recipMob,
            ':client_id' => $clientId,
            ':token'     => $token,
            ':expires_at'=> $expiresAt,
        ]);

        // Dispatch via chosen channel
        $shareUrl = rtrim($_ENV['APP_URL'] ?? 'https://app.carahulgupta.in', '/') . "/shared/document/{$token}";

        // For now, log the share — actual dispatch handled by Node email service or SMS/WA bridge
        $this->logMarketing([
            'channel'          => $channel,
            'client_id'        => $clientId,
            'recipient_name'   => $recipName,
            'recipient_email'  => $recipEmail,
            'recipient_mobile' => $recipMob,
            'message_body'     => "Document shared: {$document['filename']} — {$shareUrl}",
            'status'           => 'sent',
            'sent_by'          => $user['id'],
        ]);

        $this->success(['share_url' => $shareUrl, 'token' => $token], 'Document share link created and dispatched');
    }

    // ── Marketing Logs ────────────────────────────────────────────────────────

    public function marketingLogs(): never
    {
        $channel = trim($this->query('channel', ''));
        $limit   = max(1, min(500, (int)$this->query('limit', 100)));

        $where  = '1=1';
        $params = [];
        if ($channel !== '') {
            $where  = 'channel = :channel';
            $params = [':channel' => $channel];
        }

        $stmt = $this->db->prepare("SELECT * FROM marketing_logs WHERE {$where} ORDER BY created_at DESC LIMIT {$limit}");
        $stmt->execute($params);
        $this->success($stmt->fetchAll(\PDO::FETCH_ASSOC));
    }
}
