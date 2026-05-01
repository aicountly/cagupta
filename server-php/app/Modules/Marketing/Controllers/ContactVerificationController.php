<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;

/**
 * ContactVerificationController — Email & Mobile OTP verification for clients.
 *
 * Routes (prefix /api/admin/contacts):
 *   POST /api/admin/contacts/:id/verify/send-otp    → sendOtp
 *   POST /api/admin/contacts/:id/verify/confirm      → confirm
 *   GET  /api/admin/contacts/verification/exceptions → exceptions
 */
class ContactVerificationController extends BaseController
{
    private \PDO $db;

    public function __construct()
    {
        $this->db = \App\Config\Database::connect();
    }

    /**
     * POST /api/admin/contacts/:id/verify/send-otp
     *
     * Body: { field: 'email'|'mobile', channel: 'email'|'sms'|'whatsapp' }
     *
     * Sends a 6-digit OTP to the client's email or mobile.
     */
    public function sendOtp(int $clientId): never
    {
        $body    = $this->getJsonBody();
        $actor   = $this->authUser();
        $field   = strtolower(trim((string)($body['field'] ?? 'email')));
        $channel = strtolower(trim((string)($body['channel'] ?? 'email')));

        if (!in_array($field, ['email', 'mobile'], true)) {
            $this->error("field must be 'email' or 'mobile'.", 422);
        }

        $client = $this->db->prepare('SELECT * FROM clients WHERE id = :id LIMIT 1');
        $client->execute([':id' => $clientId]);
        $client = $client->fetch(\PDO::FETCH_ASSOC);
        if (!$client) $this->error('Client not found.', 404);

        $target = $field === 'email' ? ($client['email'] ?? '') : ($client['mobile'] ?? '');
        if (!$target) {
            $this->error("Client has no {$field} registered.", 422);
        }

        $otp     = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        $hash    = password_hash($otp, PASSWORD_BCRYPT);
        $expires = date('Y-m-d H:i:s', strtotime('+10 minutes'));

        // Invalidate any existing unused OTPs for this client + field
        $this->db->prepare("UPDATE contact_verification_otps SET used = TRUE WHERE client_id = :cid AND field = :field AND used = FALSE")
            ->execute([':cid' => $clientId, ':field' => $field]);

        $stmt = $this->db->prepare('
            INSERT INTO contact_verification_otps (client_id, channel, otp_hash, field, expires_at, created_by)
            VALUES (:cid, :channel, :hash, :field, :expires, :uid)
        ');
        $stmt->execute([
            ':cid'     => $clientId,
            ':channel' => $channel,
            ':hash'    => $hash,
            ':field'   => $field,
            ':expires' => $expires,
            ':uid'     => $actor['id'],
        ]);

        // Log the OTP send event
        $this->logVerification($clientId, $field, 'otp_sent', $channel, $target, (int)$actor['id']);

        // Dispatch OTP
        $dispatched = $this->dispatchOtp($channel, $target, $otp, $client);

        if (!$dispatched) {
            $this->error("Failed to send OTP via {$channel}. Please try again.", 502);
        }

        $masked = $field === 'email'
            ? preg_replace('/(?<=.{2}).(?=.*@)/', '*', $target)
            : substr($target, 0, 2) . str_repeat('*', strlen($target) - 4) . substr($target, -2);

        $this->success(['masked' => $masked], "OTP sent to {$field} via {$channel}");
    }

    /**
     * POST /api/admin/contacts/:id/verify/confirm
     *
     * Body: { field: 'email'|'mobile', otp: '123456' }
     */
    public function confirm(int $clientId): never
    {
        $body  = $this->getJsonBody();
        $actor = $this->authUser();
        $field = strtolower(trim((string)($body['field'] ?? 'email')));
        $otp   = trim((string)($body['otp'] ?? ''));

        if (!in_array($field, ['email', 'mobile'], true)) {
            $this->error("field must be 'email' or 'mobile'.", 422);
        }
        if (!preg_match('/^\d{6}$/', $otp)) {
            $this->error('OTP must be 6 digits.', 422);
        }

        $client = $this->db->prepare('SELECT * FROM clients WHERE id = :id LIMIT 1');
        $client->execute([':id' => $clientId]);
        $client = $client->fetch(\PDO::FETCH_ASSOC);
        if (!$client) $this->error('Client not found.', 404);

        // Fetch latest unused OTP
        $otpRow = $this->db->prepare('
            SELECT * FROM contact_verification_otps
            WHERE client_id = :cid AND field = :field AND used = FALSE AND expires_at > NOW()
            ORDER BY created_at DESC LIMIT 1
        ');
        $otpRow->execute([':cid' => $clientId, ':field' => $field]);
        $record = $otpRow->fetch(\PDO::FETCH_ASSOC);

        if (!$record) {
            $this->logVerification($clientId, $field, 'otp_failed', null, null, (int)$actor['id']);
            $this->error('OTP expired or not found. Please request a new OTP.', 422);
        }

        if (!password_verify($otp, $record['otp_hash'])) {
            $this->logVerification($clientId, $field, 'otp_failed', null, null, (int)$actor['id']);
            $this->error('Invalid OTP.', 422);
        }

        // Mark OTP used
        $this->db->prepare('UPDATE contact_verification_otps SET used = TRUE, used_at = NOW() WHERE id = :id')
            ->execute([':id' => $record['id']]);

        // Update client verified status
        $fieldCol  = $field === 'email' ? 'email_verified' : 'mobile_verified';
        $fieldAtCol = $field === 'email' ? 'email_verified_at' : 'mobile_verified_at';
        $value     = $field === 'email' ? ($client['email'] ?? '') : ($client['mobile'] ?? '');

        $this->db->prepare("UPDATE clients SET {$fieldCol} = TRUE, {$fieldAtCol} = NOW() WHERE id = :id")
            ->execute([':id' => $clientId]);

        $this->logVerification($clientId, $field, 'verified', $record['channel'] ?? null, $value, (int)$actor['id']);

        $this->success([], "{$field} verified successfully");
    }

    /**
     * GET /api/admin/contacts/verification/exceptions
     *
     * Returns clients with unverified email or mobile.
     * Query params: type (email|mobile|both), limit, offset
     */
    public function exceptions(): never
    {
        $type   = strtolower(trim($this->query('type', 'both')));
        $limit  = max(1, min(500, (int)$this->query('limit', 100)));
        $offset = max(0, (int)$this->query('offset', 0));

        $conditions = [];
        if ($type === 'email' || $type === 'both') $conditions[] = 'email_verified = FALSE AND email IS NOT NULL AND email != \'\'';
        if ($type === 'mobile' || $type === 'both') $conditions[] = 'mobile_verified = FALSE AND mobile IS NOT NULL AND mobile != \'\'';

        $where = !empty($conditions) ? '(' . implode(' OR ', $conditions) . ')' : '1=1';

        $rows = $this->db->prepare("
            SELECT id, name, email, mobile, email_verified, mobile_verified,
                   email_verified_at, mobile_verified_at, created_at
            FROM clients
            WHERE {$where}
            ORDER BY name ASC
            LIMIT :limit OFFSET :offset
        ");
        $rows->bindValue(':limit', $limit, \PDO::PARAM_INT);
        $rows->bindValue(':offset', $offset, \PDO::PARAM_INT);
        $rows->execute();
        $data = $rows->fetchAll(\PDO::FETCH_ASSOC);

        $total = (int)$this->db->query("SELECT COUNT(*) FROM clients WHERE {$where}")->fetchColumn();
        $this->success(['items' => $data, 'total' => $total, 'limit' => $limit, 'offset' => $offset]);
    }

    private function dispatchOtp(string $channel, string $target, string $otp, array $client): bool
    {
        $name    = $client['name'] ?? 'Client';
        $message = "Your OTP to verify your {contact_type} with CA Rahul Gupta is: {$otp}. Valid for 10 minutes. Do not share this OTP. CAOFFICE";

        if ($channel === 'email') {
            // Forward to Node email service
            $payload = json_encode([
                'to'      => $target,
                'subject' => 'OTP Verification — CA Rahul Gupta',
                'html'    => "<p>Dear {$name},</p><p>Your OTP is: <strong style='font-size:28px;letter-spacing:6px'>{$otp}</strong></p><p>Valid for 10 minutes. Do not share this OTP.</p><p>— CA Rahul Gupta & Associates</p>",
            ]);
            $nodeUrl = rtrim($_ENV['NODE_MAILER_URL'] ?? 'http://localhost:3000', '/');
            $ch = curl_init("{$nodeUrl}/api/email/send");
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
                CURLOPT_POSTFIELDS     => $payload,
                CURLOPT_TIMEOUT        => 8,
            ]);
            $res    = curl_exec($ch);
            $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            return $status >= 200 && $status < 300;
        }

        if ($channel === 'sms') {
            $cfgRow = $this->db->query("SELECT * FROM marketing_api_config WHERE service = 'sms_gateway' LIMIT 1")->fetch(\PDO::FETCH_ASSOC);
            if (!$cfgRow) return false;
            $extra = json_decode($cfgRow['extra_config'] ?? '{}', true);
            $url   = 'https://www.smsgatewayhub.com/api/mt/SendSMS?' . http_build_query([
                'user'     => $extra['username'] ?? '',
                'password' => $cfgRow['api_key'],
                'senderid' => $extra['sender_id'] ?? 'CAOFFICE',
                'channel'  => 4,
                'DCS'      => 0,
                'flashsms' => 0,
                'number'   => $target,
                'text'     => $message,
                'route'    => 'TR',
            ]);
            $ch = curl_init($url);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8]);
            curl_exec($ch);
            $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            return $status === 200;
        }

        return false;
    }

    private function logVerification(int $clientId, string $field, string $action, ?string $channel, ?string $value, int $actorId): void
    {
        $this->db->prepare('
            INSERT INTO contact_verification_log (client_id, field, action, channel, value, actor_id)
            VALUES (:cid, :field, :action, :channel, :value, :actor)
        ')->execute([
            ':cid'     => $clientId,
            ':field'   => $field,
            ':action'  => $action,
            ':channel' => $channel,
            ':value'   => $value,
            ':actor'   => $actorId,
        ]);
    }
}
