<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * BrevoMailer — lightweight Brevo Transactional Email API v3 client.
 *
 * Reads configuration from environment variables:
 *   BREVO_API_KEY   — Brevo API key (required)
 *   SENDER_EMAIL    — Sender address (default: office@carahulgupta.in)
 *   SENDER_NAME     — Sender display name (default: CA Rahul Gupta)
 *
 * All email sending is best-effort: failures are logged but never thrown.
 */
class BrevoMailer
{
    private const API_URL = 'https://api.brevo.com/v3/smtp/email';

    /**
     * Send a transactional email via the Brevo HTTP API.
     *
     * @param string $toEmail   Recipient email address.
     * @param string $toName    Recipient display name.
     * @param string $subject   Email subject line.
     * @param string $htmlBody  Rendered HTML body.
     * @return bool TRUE if accepted by Brevo, FALSE on any failure.
     */
    public static function send(
        string $toEmail,
        string $toName,
        string $subject,
        string $htmlBody
    ): bool {
        $apiKey = (string)(getenv('BREVO_API_KEY') ?: '');
        if ($apiKey === '') {
            error_log('[BrevoMailer] BREVO_API_KEY is not set — skipping email send.');
            return false;
        }

        $senderEmail = (string)(getenv('SENDER_EMAIL') ?: 'office@carahulgupta.in');
        $senderName  = (string)(getenv('SENDER_NAME')  ?: 'CA Rahul Gupta');

        $payload = json_encode([
            'sender'      => ['email' => $senderEmail, 'name' => $senderName],
            'to'          => [['email' => $toEmail, 'name' => $toName]],
            'subject'     => $subject,
            'htmlContent' => $htmlBody,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($payload === false) {
            error_log('[BrevoMailer] JSON encoding failed.');
            return false;
        }

        $ch = curl_init(self::API_URL);
        if ($ch === false) {
            error_log('[BrevoMailer] curl_init failed.');
            return false;
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_HTTPHEADER     => [
                'accept: application/json',
                'content-type: application/json',
                "api-key: {$apiKey}",
            ],
        ]);

        $response  = curl_exec($ch);
        $httpCode  = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError !== '') {
            error_log("[BrevoMailer] cURL error: {$curlError}");
            return false;
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            error_log("[BrevoMailer] Brevo API error {$httpCode}: {$response}");
            return false;
        }

        return true;
    }

    /**
     * Load an HTML template from app/Templates/ and replace {{placeholder}} tokens.
     *
     * @param string               $templateName  Filename without .html extension.
     * @param array<string,string> $vars          Key/value substitution pairs.
     * @return string  Rendered HTML, or empty string if the template is missing.
     */
    public static function renderTemplate(string $templateName, array $vars = []): string
    {
        $path = dirname(__DIR__) . "/Templates/{$templateName}.html";
        if (!is_readable($path)) {
            error_log("[BrevoMailer] Template not found: {$path}");
            return '';
        }

        $html = (string)(file_get_contents($path) ?: '');
        foreach ($vars as $key => $value) {
            $html = str_replace('{{' . $key . '}}', (string)$value, $html);
        }
        return $html;
    }
}
