<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Minimal Razorpay REST client (Orders API + payment fetch).
 */
final class RazorpayClient
{
    private string $keyId;
    private string $keySecret;

    public function __construct()
    {
        $this->keyId     = trim((string)(getenv('RAZORPAY_KEY_ID') ?: ''));
        $this->keySecret = trim((string)(getenv('RAZORPAY_KEY_SECRET') ?: ''));
    }

    public function isConfigured(): bool
    {
        return $this->keyId !== '' && $this->keySecret !== '';
    }

    /**
     * @param array<string, mixed> $notes Flat string values only (Razorpay requirement)
     * @return array<string, mixed> Decoded order JSON
     */
    public function createOrder(int $amountPaise, string $receipt, array $notes = []): array
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('Razorpay is not configured.');
        }
        $payload = [
            'amount'   => $amountPaise,
            'currency' => 'INR',
            'receipt'  => $receipt,
            'notes'    => (object)$notes,
        ];
        $raw = $this->request('POST', 'https://api.razorpay.com/v1/orders', $payload);
        $dec = json_decode($raw, true);
        if (!is_array($dec)) {
            throw new \RuntimeException('Invalid Razorpay response.');
        }
        if (!empty($dec['error'])) {
            throw new \RuntimeException((string)($dec['error']['description'] ?? 'Razorpay order failed.'));
        }

        return $dec;
    }

    /** @return array<string, mixed> */
    public function fetchPayment(string $paymentId): array
    {
        $raw = $this->request('GET', 'https://api.razorpay.com/v1/payments/' . rawurlencode($paymentId), null);
        $dec = json_decode($raw, true);
        if (!is_array($dec)) {
            throw new \RuntimeException('Invalid Razorpay payment response.');
        }

        return $dec;
    }

    public static function verifyWebhookSignature(string $rawBody, string $signatureHeader, string $secret): bool
    {
        $secret = trim($secret);
        if ($secret === '' || $signatureHeader === '') {
            return false;
        }
        $expected = hash_hmac('sha256', $rawBody, $secret);

        return hash_equals($expected, $signatureHeader);
    }

    /**
     * @param array<string, mixed>|null $jsonBody
     */
    private function request(string $method, string $url, ?array $jsonBody): string
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('curl_init failed');
        }
        $auth = base64_encode($this->keyId . ':' . $this->keySecret);
        $headers = [
            'Authorization: Basic ' . $auth,
            'Content-Type: application/json',
        ];
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_HTTPHEADER     => $headers,
        ];
        if ($method === 'POST' && $jsonBody !== null) {
            $opts[CURLOPT_POST]       = true;
            $opts[CURLOPT_POSTFIELDS] = json_encode($jsonBody, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        }
        curl_setopt_array($ch, $opts);
        $response  = curl_exec($ch);
        $httpCode  = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        if ($curlError !== '') {
            throw new \RuntimeException('Razorpay HTTP error: ' . $curlError);
        }
        if ($response === false) {
            throw new \RuntimeException('Razorpay empty response');
        }
        if ($httpCode < 200 || $httpCode >= 300) {
            throw new \RuntimeException('Razorpay HTTP ' . $httpCode . ': ' . $response);
        }

        return $response;
    }
}
