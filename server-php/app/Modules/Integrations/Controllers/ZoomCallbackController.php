<?php
declare(strict_types=1);

namespace App\Controllers\Integrations;

use App\Config\App as AppConfig;
use App\Controllers\BaseController;
use App\Libraries\ZoomOAuthClient;
use App\Models\ZoomOAuthTokenModel;

/**
 * OAuth redirect target (browser) — no Bearer auth; validates signed state.
 */
class ZoomCallbackController extends BaseController
{
    private function stateSecret(): string
    {
        return trim((string)(getenv('ZOOM_STATE_SECRET') ?: 'change-me-zoom-state'));
    }

    private function parseJwtAccountId(string $jwt): ?string
    {
        $parts = explode('.', $jwt);
        if (count($parts) < 2) {
            return null;
        }
        $payload = base64_decode(strtr($parts[1], '-_', '+/'), true);
        if ($payload === false) {
            return null;
        }
        $data = json_decode($payload, true);

        return is_array($data) ? ($data['aid'] ?? null) : null;
    }

    /** GET /api/integrations/zoom/callback?code=&state= */
    public function handle(): never
    {
        $code  = trim((string)($this->query('code', '')));
        $state = trim((string)($this->query('state', '')));
        if ($code === '' || $state === '') {
            $this->htmlResponse('Missing code or state.', 400);
        }
        $decoded = json_decode((string)base64_decode($state, true), true);
        if (!is_array($decoded) || empty($decoded['uid']) || empty($decoded['exp']) || empty($decoded['sig'])) {
            $this->htmlResponse('Invalid state.', 400);
        }
        $uid = (int)$decoded['uid'];
        $exp = (int)$decoded['exp'];
        $sig = (string)$decoded['sig'];
        $expect = hash_hmac('sha256', $uid . '|' . $exp, $this->stateSecret());
        if (!hash_equals($expect, $sig) || $exp < time()) {
            $this->htmlResponse('State verification failed.', 403);
        }

        try {
            $tok = ZoomOAuthClient::exchangeCode($code);
        } catch (\Throwable $e) {
            error_log('[ZoomCallback] ' . $e->getMessage());
            $this->htmlResponse('Token exchange failed.', 502);
        }

        $access  = (string)$tok['access_token'];
        $refresh = (string)($tok['refresh_token'] ?? '');
        if ($refresh === '') {
            $this->htmlResponse('Zoom did not return a refresh token.', 502);
        }
        $expiresIn = (int)($tok['expires_in'] ?? 3600);
        $expiresAt = date('Y-m-d H:i:s', time() + $expiresIn);
        $accountId = $this->parseJwtAccountId($access);

        (new ZoomOAuthTokenModel())->upsert($uid, [
            'access_token'  => $access,
            'refresh_token' => $refresh,
            'expires_at'    => $expiresAt,
            'scope'         => $tok['scope'] ?? null,
            'account_id'    => $accountId,
        ]);

        $app = new AppConfig();
        // CORS_ORIGIN may be comma-separated; postMessage target should be the portal origin (list first).
        $raw   = $app->corsOrigin;
        $parts = array_values(array_filter(array_map('trim', explode(',', $raw))));
        $orig  = $parts[0] ?? $raw;
        $this->htmlCloseWindow($orig);
    }

    private function htmlResponse(string $message, int $status): never
    {
        http_response_code($status);
        header('Content-Type: text/html; charset=UTF-8');
        echo '<!DOCTYPE html><html><body><p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p></body></html>';
        exit;
    }

    private function htmlCloseWindow(string $origin): never
    {
        http_response_code(200);
        header('Content-Type: text/html; charset=UTF-8');
        $o = htmlspecialchars($origin, ENT_QUOTES, 'UTF-8');
        echo '<!DOCTYPE html><html><body><script>'
            . "if(window.opener){window.opener.postMessage({type:'zoom_oauth',ok:true},'{$o}');}"
            . 'window.close();</script><p>Zoom connected. You may close this window.</p></body></html>';
        exit;
    }
}
