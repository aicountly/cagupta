<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Config\Database;
use App\Models\QuotationShareModel;
use PDO;

/**
 * Stores quotation PDFs and dispatches share messages via email, SMS, or WhatsApp.
 */
class QuotationShareService
{
    private PDO $db;
    private QuotationShareModel $shares;

    public function __construct()
    {
        $this->db     = Database::getConnection();
        $this->shares = new QuotationShareModel();
    }

    /**
     * @return array{share_url: string, token: string, share_id: int}
     */
    public function storeAndDispatch(
        array $quotation,
        int $leadId,
        string $clientName,
        ?string $engagementTypeName,
        string $channel,
        ?string $recipientName,
        ?string $recipientEmail,
        ?string $recipientMobile,
        string $pdfBinary,
        ?int $sharedBy
    ): array {
        $token     = bin2hex(random_bytes(16));
        $expiresAt = date('Y-m-d H:i:s', strtotime('+7 days'));
        $relDir    = 'QUOTATIONS' . DIRECTORY_SEPARATOR . 'LEAD-' . $leadId;
        $fileName  = bin2hex(random_bytes(16)) . '.pdf';
        $absDir    = $this->docuBankRoot() . DIRECTORY_SEPARATOR . $relDir;

        if (!is_dir($absDir) && !mkdir($absDir, 0750, true)) {
            throw new \RuntimeException('Failed to create quotation storage directory.');
        }

        $absPath = $absDir . DIRECTORY_SEPARATOR . $fileName;
        $relPath = $relDir . DIRECTORY_SEPARATOR . $fileName;
        if (file_put_contents($absPath, $pdfBinary) === false) {
            throw new \RuntimeException('Failed to save quotation PDF.');
        }

        $shareId = $this->shares->create(
            (int)$quotation['id'],
            $sharedBy,
            $channel,
            $recipientName,
            $recipientEmail,
            $recipientMobile,
            $token,
            $relPath,
            $expiresAt
        );

        $appUrl   = rtrim((string)(getenv('APP_URL') ?: $_ENV['APP_URL'] ?? 'https://app.carahulgupta.in'), '/');
        $shareUrl = "{$appUrl}/shared/quotation/{$token}";

        $engLabel = $engagementTypeName ? " ({$engagementTypeName})" : '';
        $message  = "Quotation for {$clientName}{$engLabel} — download: {$shareUrl}";

        $dispatchOk = match ($channel) {
            'email'   => $this->dispatchEmail($recipientEmail, $recipientName ?: $clientName, $clientName, $engLabel, $shareUrl, $expiresAt, $pdfBinary),
            'sms'     => $this->dispatchSms($recipientMobile, $message),
            'wa_web'  => $this->dispatchWaWeb($sharedBy, $recipientMobile, $message),
            'wa_api'  => $this->dispatchWaApi($recipientMobile, $clientName, $shareUrl),
            default   => throw new \InvalidArgumentException('Unsupported channel.'),
        };

        $this->logMarketing([
            'channel'          => $channel,
            'recipient_name'   => $recipientName,
            'recipient_email'  => $recipientEmail,
            'recipient_mobile' => $recipientMobile,
            'message_body'     => $message,
            'status'           => $dispatchOk ? 'sent' : 'failed',
            'sent_by'          => $sharedBy,
        ]);

        if (!$dispatchOk) {
            throw new \RuntimeException("Failed to dispatch via {$channel}. Check gateway configuration.");
        }

        return ['share_url' => $shareUrl, 'token' => $token, 'share_id' => $shareId];
    }

    /**
     * Stream PDF for a valid share token.
     */
    public function streamPdfByToken(string $token): never
    {
        $row = $this->shares->findByToken($token);
        if ($row === null) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'message' => 'Share link not found.']);
            exit;
        }

        if (!empty($row['expires_at']) && strtotime((string)$row['expires_at']) < time()) {
            http_response_code(410);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'message' => 'This share link has expired.']);
            exit;
        }

        $absPath = $this->docuBankRoot() . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, (string)$row['pdf_path']);
        if (!is_readable($absPath)) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'message' => 'PDF file not found.']);
            exit;
        }

        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="quotation.pdf"');
        header('Content-Length: ' . (string)filesize($absPath));
        readfile($absPath);
        exit;
    }

    private function dispatchEmail(
        ?string $email,
        string $name,
        string $clientName,
        string $engLabel,
        string $shareUrl,
        string $expiresAt,
        string $pdfBinary
    ): bool {
        if ($email === null || trim($email) === '') {
            return false;
        }

        $html = BrevoMailer::renderTemplate('quotation-share', [
            'clientName'      => htmlspecialchars($clientName, ENT_QUOTES, 'UTF-8'),
            'engagementLabel' => htmlspecialchars($engLabel, ENT_QUOTES, 'UTF-8'),
            'shareUrl'        => htmlspecialchars($shareUrl, ENT_QUOTES, 'UTF-8'),
            'expiresAt'       => htmlspecialchars(date('d M Y', strtotime($expiresAt)), ENT_QUOTES, 'UTF-8'),
        ]);

        $subject = "Quotation — {$clientName}";
        return BrevoMailer::send(
            trim($email),
            $name,
            $subject,
            $html,
            [[
                'name'    => 'quotation.pdf',
                'content' => base64_encode($pdfBinary),
            ]]
        );
    }

    private function dispatchSms(?string $mobile, string $message): bool
    {
        $mobile = preg_replace('/\D/', '', (string)$mobile);
        if ($mobile === '' || strlen($mobile) < 10) {
            return false;
        }

        $cfgRow = $this->db->query("SELECT * FROM marketing_api_config WHERE service = 'sms_gateway' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$cfgRow) {
            return false;
        }

        return $this->sendSms($cfgRow, $mobile, $message);
    }

    private function dispatchWaWeb(?int $userId, ?string $mobile, string $message): bool
    {
        $mobile = preg_replace('/\D/', '', (string)$mobile);
        if ($mobile === '' || strlen($mobile) < 10 || $userId === null) {
            return false;
        }

        $bridgeUrl = rtrim((string)(getenv('WA_BRIDGE_URL') ?: $_ENV['WA_BRIDGE_URL'] ?? 'http://localhost:3001'), '/');
        $payload   = [
            'sessionId'  => 'user_' . $userId,
            'targetId'   => $mobile,
            'targetType' => 'contact',
            'message'    => $message,
        ];

        $res = $this->httpPost("{$bridgeUrl}/send", $payload, 30);
        return $res['ok'];
    }

    private function dispatchWaApi(?string $mobile, string $clientName, string $shareUrl): bool
    {
        $mobile = preg_replace('/\D/', '', (string)$mobile);
        if ($mobile === '' || strlen($mobile) < 10) {
            return false;
        }

        $cfgRow = $this->db->query("SELECT * FROM marketing_api_config WHERE service = 'wa_native' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$cfgRow) {
            // Fallback: treat as wa_web-style plain message via bridge if native not configured
            return false;
        }

        $provider = strtolower((string)($cfgRow['provider'] ?? 'interakt'));
        $extra    = json_decode((string)($cfgRow['extra_config'] ?? '{}'), true) ?: [];
        $apiKey   = (string)($cfgRow['api_key'] ?? '');

        if ($provider === 'interakt' && $apiKey !== '') {
            $payload = [
                'countryCode' => '+91',
                'phoneNumber' => $mobile,
                'type'        => 'Text',
                'data'        => [
                    'message' => "Quotation for {$clientName} — {$shareUrl}",
                ],
            ];
            $ch = curl_init('https://api.interakt.ai/v1/public/message/');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_HTTPHEADER     => [
                    'Content-Type: application/json',
                    "Authorization: Basic {$apiKey}",
                ],
                CURLOPT_POSTFIELDS     => json_encode($payload),
                CURLOPT_TIMEOUT        => 15,
            ]);
            $res    = curl_exec($ch);
            $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            return $status >= 200 && $status < 300;
        }

        return false;
    }

    private function sendSms(array $cfg, string $mobile, string $message): bool
    {
        $extra = json_decode((string)($cfg['extra_config'] ?? '{}'), true) ?: [];
        $url   = (string)($extra['api_url'] ?? 'https://www.smsgatewayhub.com/api/mt/SendSMS');
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
        curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return $status === 200;
    }

    /**
     * @param array<string, mixed> $data
     */
    private function logMarketing(array $data): void
    {
        $stmt = $this->db->prepare('
            INSERT INTO marketing_logs
                (channel, direction, recipient_name, recipient_email, recipient_mobile,
                 message_body, status, provider, sent_by_user_id, sent_at)
            VALUES
                (:channel, \'outbound\', :name, :email, :mobile, :body, :status, :provider, :uid, NOW())
        ');
        $stmt->execute([
            ':channel'  => $data['channel'],
            ':name'     => $data['recipient_name'] ?? null,
            ':email'    => $data['recipient_email'] ?? null,
            ':mobile'   => $data['recipient_mobile'] ?? null,
            ':body'     => $data['message_body'] ?? null,
            ':status'   => $data['status'] ?? 'sent',
            ':provider' => $data['channel'] === 'email' ? 'brevo' : ($data['channel'] ?? null),
            ':uid'      => $data['sent_by'] ?? null,
        ]);
    }

    /**
     * @return array{ok: bool, body: array<string, mixed>}
     */
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
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ['ok' => $status >= 200 && $status < 300, 'body' => json_decode((string)$body ?: '{}', true) ?: []];
    }

    private function docuBankRoot(): string
    {
        $configured = (string)(getenv('DOCU_BANK_PATH') ?: '');
        if ($configured !== '') {
            return rtrim($configured, '/\\');
        }
        return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'docu_bank';
    }
}
