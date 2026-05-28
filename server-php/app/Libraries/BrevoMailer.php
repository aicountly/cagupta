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

    /** @internal Shared flags for Brevo JSON bodies */
    private const JSON_FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE;

    /**
     * Send a transactional email via the Brevo HTTP API.
     *
     * @param string $toEmail   Recipient email address.
     * @param string $toName    Recipient display name.
     * @param string $subject   Email subject line.
     * @param string $htmlBody  Rendered HTML body.
     * @param array<int, array{name: string, content: string}> $attachments Base64-encoded file content.
     * @return bool TRUE if accepted by Brevo, FALSE on any failure.
     */
    public static function send(
        string $toEmail,
        string $toName,
        string $subject,
        string $htmlBody,
        array $attachments = []
    ): bool {
        $apiKey = (string)(getenv('BREVO_API_KEY') ?: '');
        if ($apiKey === '') {
            error_log('[BrevoMailer] BREVO_API_KEY is not set — skipping email send.');
            return false;
        }

        if (!function_exists('curl_init')) {
            error_log('[BrevoMailer] PHP cURL extension is not loaded — cannot send email.');
            return false;
        }

        $senderEmail = (string)(getenv('SENDER_EMAIL') ?: 'office@carahulgupta.in');
        $senderName  = (string)(getenv('SENDER_NAME')  ?: 'CA Rahul Gupta');

        $body = [
            'sender'      => ['email' => $senderEmail, 'name' => $senderName],
            'to'          => [['email' => $toEmail, 'name' => $toName]],
            'subject'     => $subject,
            'htmlContent' => $htmlBody,
        ];
        if ($attachments !== []) {
            $body['attachment'] = array_values(array_map(
                static fn (array $a) => [
                    'name'    => (string)($a['name'] ?? 'attachment.pdf'),
                    'content' => (string)($a['content'] ?? ''),
                ],
                $attachments
            ));
        }
        $payload = json_encode($body, self::JSON_FLAGS);

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
     * Send the same HTML/subject to many recipients using concurrent HTTP requests (curl_multi).
     * Dramatically reduces wall-clock time vs sequential sends — avoids PHP max_execution_time kills on large lists.
     *
     * @param array<int, array{email: string, name: string}> $recipients
     * @return int Count of recipients for whom Brevo returned HTTP 2xx.
     */
    public static function sendBulkSameHtml(array $recipients, string $subject, string $htmlBody): int
    {
        if ($recipients === []) {
            return 0;
        }

        $apiKey = (string)(getenv('BREVO_API_KEY') ?: '');
        if ($apiKey === '') {
            error_log('[BrevoMailer] BREVO_API_KEY is not set — skipping bulk email send.');
            return 0;
        }

        if (!function_exists('curl_init')) {
            error_log('[BrevoMailer] PHP cURL extension is not loaded — cannot send email.');
            return 0;
        }

        if (!function_exists('curl_multi_init')) {
            $ok = 0;
            foreach ($recipients as $r) {
                if (self::send((string)$r['email'], (string)$r['name'], $subject, $htmlBody)) {
                    $ok++;
                }
            }
            return $ok;
        }

        $senderEmail = (string)(getenv('SENDER_EMAIL') ?: 'office@carahulgupta.in');
        $senderName  = (string)(getenv('SENDER_NAME')  ?: 'CA Rahul Gupta');

        $conc = (int)(getenv('BREVO_SEND_CONCURRENCY') ?: '12');
        $conc = max(1, min(30, $conc));

        $successCount = 0;

        foreach (array_chunk($recipients, $conc) as $batch) {
            $mh = curl_multi_init();
            if ($mh === false) {
                foreach ($batch as $r) {
                    if (self::send((string)$r['email'], (string)$r['name'], $subject, $htmlBody)) {
                        $successCount++;
                    }
                }
                continue;
            }

            $handles = [];

            foreach ($batch as $r) {
                $email = trim((string)($r['email'] ?? ''));
                $name  = (string)($r['name'] ?? '');
                if ($email === '') {
                    continue;
                }

                $payload = json_encode([
                    'sender'      => ['email' => $senderEmail, 'name' => $senderName],
                    'to'          => [['email' => $email, 'name' => $name]],
                    'subject'     => $subject,
                    'htmlContent' => $htmlBody,
                ], self::JSON_FLAGS);

                if ($payload === false) {
                    error_log('[BrevoMailer] JSON encode failed for a bulk recipient.');
                    continue;
                }

                $ch = curl_init(self::API_URL);
                if ($ch === false) {
                    continue;
                }

                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_POST           => true,
                    CURLOPT_POSTFIELDS     => $payload,
                    CURLOPT_TIMEOUT        => 30,
                    CURLOPT_CONNECTTIMEOUT => 10,
                    CURLOPT_HTTPHEADER     => [
                        'accept: application/json',
                        'content-type: application/json',
                        "api-key: {$apiKey}",
                    ],
                ]);

                curl_multi_add_handle($mh, $ch);
                $handles[] = $ch;
            }

            if ($handles === []) {
                curl_multi_close($mh);
                continue;
            }

            $running = null;
            do {
                $stat = curl_multi_exec($mh, $running);
                if ($running > 0) {
                    $sel = curl_multi_select($mh, 1.0);
                    if ($sel === -1) {
                        usleep(100_000);
                    }
                }
            } while ($running > 0 && $stat === CURLM_OK);

            foreach ($handles as $ch) {
                $curlError = curl_error($ch);
                $httpCode  = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $response  = (string)curl_multi_getcontent($ch);

                if ($curlError !== '') {
                    error_log("[BrevoMailer] bulk cURL error: {$curlError}");
                } elseif ($httpCode >= 200 && $httpCode < 300) {
                    $successCount++;
                } else {
                    error_log("[BrevoMailer] bulk Brevo API error {$httpCode}: {$response}");
                }

                curl_multi_remove_handle($mh, $ch);
                curl_close($ch);
            }

            curl_multi_close($mh);
        }

        return $successCount;
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
