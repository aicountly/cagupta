<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Verifies SSO tokens with the identity provider before trusting email claims.
 */
class SsoTokenVerifier
{
    /** @var array<string, array<string, mixed>|null> */
    private static array $jwksCache = [];

    /**
     * @return array{sub: string, email: string}|null
     */
    public static function verify(string $provider, string $token): ?array
    {
        $provider = strtolower(trim($provider));
        if ($provider === 'google') {
            return self::verifyGoogle($token);
        }
        if ($provider === 'microsoft') {
            return self::verifyMicrosoft($token);
        }
        return null;
    }

    /** @return array{sub: string, email: string}|null */
    private static function verifyGoogle(string $idToken): ?array
    {
        $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($idToken);
        $payload = self::fetchJson($url);
        if ($payload === null) {
            return null;
        }
        if (empty($payload['sub']) || empty($payload['email'])) {
            return null;
        }
        if (isset($payload['email_verified']) && $payload['email_verified'] !== 'true' && $payload['email_verified'] !== true) {
            return null;
        }
        $clientId = trim((string)(getenv('GOOGLE_CLIENT_ID') ?: ''));
        if ($clientId !== '') {
            $aud = (string)($payload['aud'] ?? '');
            if ($aud !== $clientId) {
                return null;
            }
        }
        return [
            'sub'   => (string)$payload['sub'],
            'email' => strtolower((string)$payload['email']),
        ];
    }

    /** @return array{sub: string, email: string}|null */
    private static function verifyMicrosoft(string $idToken): ?array
    {
        $parts = explode('.', $idToken);
        if (count($parts) !== 3) {
            return null;
        }

        [$headerB64, $payloadB64, $sigB64] = $parts;
        $header  = self::decodeJwtPart($headerB64);
        $payload = self::decodeJwtPart($payloadB64);
        if ($header === null || $payload === null) {
            return null;
        }

        if (($header['alg'] ?? '') !== 'RS256') {
            return null;
        }

        $kid = (string)($header['kid'] ?? '');
        if ($kid === '') {
            return null;
        }

        $now = time();
        if (empty($payload['exp']) || (int)$payload['exp'] < $now) {
            return null;
        }
        if (!empty($payload['nbf']) && (int)$payload['nbf'] > $now + 60) {
            return null;
        }

        $tid = (string)($payload['tid'] ?? '');
        if ($tid === '') {
            return null;
        }

        $expectedIss = 'https://login.microsoftonline.com/' . $tid . '/v2.0';
        if ((string)($payload['iss'] ?? '') !== $expectedIss) {
            return null;
        }

        $configuredTenant = trim((string)(getenv('MSAL_TENANT_ID') ?: ''));
        if ($configuredTenant !== '' && $configuredTenant !== 'common' && strcasecmp($configuredTenant, $tid) !== 0) {
            return null;
        }

        $msClientId = trim((string)(getenv('MSAL_CLIENT_ID') ?: ''));
        if ($msClientId !== '') {
            $aud = (string)($payload['aud'] ?? '');
            if ($aud !== $msClientId) {
                return null;
            }
        }

        $email = strtolower(trim((string)($payload['email'] ?? $payload['preferred_username'] ?? '')));
        $sub   = (string)($payload['oid'] ?? $payload['sub'] ?? '');
        if ($email === '' || $sub === '') {
            return null;
        }

        $jwks = self::fetchMicrosoftJwks($tid);
        if ($jwks === null) {
            return null;
        }

        $jwk = null;
        foreach ($jwks['keys'] ?? [] as $key) {
            if (is_array($key) && (string)($key['kid'] ?? '') === $kid) {
                $jwk = $key;
                break;
            }
        }
        if ($jwk === null) {
            return null;
        }

        $pem = self::jwkToPem($jwk);
        if ($pem === null) {
            return null;
        }

        $signature = self::base64UrlDecode($sigB64);
        if ($signature === '') {
            return null;
        }

        if (!self::verifyRs256("{$headerB64}.{$payloadB64}", $signature, $pem)) {
            return null;
        }

        return ['sub' => $sub, 'email' => $email];
    }

    /** @return array<string, mixed>|null */
    private static function decodeJwtPart(string $part): ?array
    {
        try {
            $raw = self::base64UrlDecode($part);
            if ($raw === '') {
                return null;
            }
            /** @var array<string, mixed> $data */
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            return $data;
        } catch (\Throwable) {
            return null;
        }
    }

    /** @return array<string, mixed>|null */
    private static function fetchMicrosoftJwks(string $tenantId): ?array
    {
        if (array_key_exists($tenantId, self::$jwksCache)) {
            return self::$jwksCache[$tenantId];
        }

        $url = 'https://login.microsoftonline.com/' . rawurlencode($tenantId) . '/discovery/v2.0/keys';
        $data = self::fetchJson($url);
        self::$jwksCache[$tenantId] = $data;

        return $data;
    }

    /** @param array<string, mixed> $jwk */
    private static function jwkToPem(array $jwk): ?string
    {
        if (($jwk['kty'] ?? '') !== 'RSA' || empty($jwk['n']) || empty($jwk['e'])) {
            return null;
        }

        $modulus  = self::base64UrlDecode((string)$jwk['n']);
        $exponent = self::base64UrlDecode((string)$jwk['e']);
        if ($modulus === '' || $exponent === '') {
            return null;
        }

        $rsaPublicKey = self::encodeDerSequence(
            self::encodeDerInteger($modulus),
            self::encodeDerInteger($exponent),
        );
        $publicKeyInfo = self::encodeDerSequence(
            self::encodeDerOidRsaEncryption(),
            self::encodeDerBitString($rsaPublicKey),
        );

        $pem = "-----BEGIN PUBLIC KEY-----\n"
            . chunk_split(base64_encode($publicKeyInfo), 64, "\n")
            . "-----END PUBLIC KEY-----\n";

        return $pem;
    }

    private static function verifyRs256(string $data, string $signature, string $pem): bool
    {
        $pubKey = openssl_pkey_get_public($pem);
        if ($pubKey === false) {
            return false;
        }

        return openssl_verify($data, $signature, $pubKey, OPENSSL_ALGO_SHA256) === 1;
    }

    private static function encodeDerInteger(string $value): string
    {
        if ($value !== '' && (ord($value[0]) & 0x80) !== 0) {
            $value = "\x00" . $value;
        }

        return "\x02" . self::encodeDerLength(strlen($value)) . $value;
    }

    private static function encodeDerLength(int $length): string
    {
        if ($length < 0x80) {
            return chr($length);
        }

        $lenBytes = '';
        while ($length > 0) {
            $lenBytes = chr($length & 0xff) . $lenBytes;
            $length >>= 8;
        }

        return chr(0x80 | strlen($lenBytes)) . $lenBytes;
    }

    private static function encodeDerSequence(string ...$elements): string
    {
        $body = implode('', $elements);

        return "\x30" . self::encodeDerLength(strlen($body)) . $body;
    }

    private static function encodeDerBitString(string $value): string
    {
        $value = "\x00" . $value;

        return "\x03" . self::encodeDerLength(strlen($value)) . $value;
    }

    private static function encodeDerOidRsaEncryption(): string
    {
        // AlgorithmIdentifier for rsaEncryption with NULL parameters
        return hex2bin('300d06092a864886f70d0101010500') ?: '';
    }

    private static function base64UrlDecode(string $data): string
    {
        $padded = str_pad(strtr($data, '-_', '+/'), (int)(ceil(strlen($data) / 4) * 4), '=', STR_PAD_RIGHT);
        $decoded = base64_decode($padded, true);

        return $decoded === false ? '' : $decoded;
    }

    /** @return array<string, mixed>|null */
    private static function fetchJson(string $url): ?array
    {
        $ctx = stream_context_create(['http' => ['timeout' => 10]]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) {
            return null;
        }
        try {
            /** @var array<string, mixed> $data */
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            return $data;
        } catch (\Throwable) {
            return null;
        }
    }
}
