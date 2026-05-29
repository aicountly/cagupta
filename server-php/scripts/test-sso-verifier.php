<?php
declare(strict_types=1);

/**
 * Manual SSO verifier checks — run: php scripts/test-sso-verifier.php
 */

$base = dirname(__DIR__);
require_once $base . '/app/Libraries/SsoTokenVerifier.php';

use App\Libraries\SsoTokenVerifier;

$passed = 0;
$failed = 0;

function assertNull(string $label, ?array $result): void
{
    global $passed, $failed;
    if ($result === null) {
        echo "PASS: {$label}\n";
        $passed++;
        return;
    }
    echo "FAIL: {$label} — expected null, got " . json_encode($result) . "\n";
    $failed++;
}

function assertNotNull(string $label, ?array $result, string $expectedEmail = ''): void
{
    global $passed, $failed;
    if ($result !== null && ($expectedEmail === '' || $result['email'] === $expectedEmail)) {
        echo "PASS: {$label}\n";
        $passed++;
        return;
    }
    echo "FAIL: {$label} — expected verified result"
        . ($expectedEmail !== '' ? " with email {$expectedEmail}" : '')
        . ', got ' . json_encode($result) . "\n";
    $failed++;
}

// ── Negative cases ────────────────────────────────────────────────────────────
assertNull('malformed token', SsoTokenVerifier::verify('microsoft', 'not-a-jwt'));
assertNull('empty token', SsoTokenVerifier::verify('microsoft', ''));
assertNull('unsupported provider', SsoTokenVerifier::verify('apple', 'a.b.c'));
assertNull('google invalid token', SsoTokenVerifier::verify('google', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig'));

// Tampered Microsoft JWT structure (valid base64, invalid signature / claims)
$fakeHeader  = rtrim(strtr(base64_encode('{"alg":"RS256","kid":"fake","typ":"JWT"}'), '+/', '-_'), '=');
$fakePayload = rtrim(strtr(base64_encode(json_encode([
    'aud'   => 'wrong-client-id',
    'iss'   => 'https://login.microsoftonline.com/00000000-0000-0000-0000-000000000000/v2.0',
    'exp'   => time() + 3600,
    'tid'   => '00000000-0000-0000-0000-000000000000',
    'email' => 'test@example.com',
    'oid'   => '11111111-1111-1111-1111-111111111111',
], JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
assertNull('fake microsoft token', SsoTokenVerifier::verify('microsoft', "{$fakeHeader}.{$fakePayload}.fakesig"));

// Wrong aud when MSAL_CLIENT_ID is configured
putenv('MSAL_CLIENT_ID=24251bc1-9ce1-426d-ad97-fb164cb0ab13');
$wrongAudPayload = rtrim(strtr(base64_encode(json_encode([
    'aud'   => '00000000-0000-0000-0000-000000000000',
    'iss'   => 'https://login.microsoftonline.com/607f371f-33f6-4473-80d6-efacb929057d/v2.0',
    'exp'   => time() + 3600,
    'tid'   => '607f371f-33f6-4473-80d6-efacb929057d',
    'email' => 'test@example.com',
    'oid'   => 'ddcb8965-2d9c-400e-854e-ae1c786664629',
], JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
$wrongAudHeader = rtrim(strtr(base64_encode('{"alg":"RS256","kid":"Xt-o7hDbpuwAz-ZPm6HxCFWS36I","typ":"JWT"}'), '+/', '-_'), '=');
assertNull('wrong aud rejected', SsoTokenVerifier::verify('microsoft', "{$wrongAudHeader}.{$wrongAudPayload}.fakesig"));

// JWKS fetch sanity (real tenant from production token)
$jwksUrl = 'https://login.microsoftonline.com/607f371f-33f6-4473-80d6-efacb929057d/discovery/v2.0/keys';
$jwksRaw = @file_get_contents($jwksUrl);
if ($jwksRaw !== false) {
    $jwks = json_decode($jwksRaw, true);
    if (!empty($jwks['keys'])) {
        echo "PASS: JWKS fetch for tenant 607f371f… (" . count($jwks['keys']) . " keys)\n";
        $passed++;
    } else {
        echo "FAIL: JWKS fetch returned no keys\n";
        $failed++;
    }
} else {
    echo "WARN: JWKS fetch skipped (no outbound network)\n";
}

// Optional live ID token via TEST_MSAL_ID_TOKEN (must be non-expired)
$sampleToken = getenv('TEST_MSAL_ID_TOKEN') ?: '';
if ($sampleToken !== '') {
    putenv('MSAL_CLIENT_ID=24251bc1-9ce1-426d-ad97-fb164cb0ab13');
    $parts = explode('.', $sampleToken);
    $payloadJson = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
    $exp = (int)($payloadJson['exp'] ?? 0);
    echo 'INFO: sample token exp=' . $exp . ' (' . date('c', $exp) . ') now=' . time() . "\n";

    $verified = SsoTokenVerifier::verify('microsoft', $sampleToken);
    if ($verified !== null) {
        assertNotNull('live microsoft id token', $verified, 'karan@sispl.org');
    } elseif ($exp < time()) {
        echo "PASS: expired sample token rejected (exp in past)\n";
        $passed++;
    } else {
        echo "FAIL: fresh sample token should verify\n";
        $failed++;
    }
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed > 0 ? 1 : 0);
