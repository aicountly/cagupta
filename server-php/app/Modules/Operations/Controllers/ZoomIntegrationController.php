<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Libraries\ZoomOAuthClient;
use App\Models\ZoomOAuthTokenModel;

/**
 * Zoom OAuth — authorize URL (JSON) and connection status.
 */
class ZoomIntegrationController extends BaseController
{
    private function stateSecret(): string
    {
        return trim((string)(getenv('ZOOM_STATE_SECRET') ?: 'change-me-zoom-state'));
    }

    /** GET /api/admin/integrations/zoom/authorize */
    public function authorizeUrl(): never
    {
        if (!ZoomOAuthClient::isConfigured()) {
            $this->error('Zoom OAuth is not configured (ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET).', 503);
        }
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        $uid = (int)$user['id'];
        $exp = time() + 600;
        $sig = hash_hmac('sha256', $uid . '|' . $exp, $this->stateSecret());
        $state = base64_encode((string)json_encode(['uid' => $uid, 'exp' => $exp, 'sig' => $sig], JSON_THROW_ON_ERROR));

        $this->success([
            'authorizationUrl' => ZoomOAuthClient::authorizeUrl($state),
            'state'            => $state,
        ]);
    }

    /** GET /api/admin/integrations/zoom/status */
    public function status(): never
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        $row = (new ZoomOAuthTokenModel())->findByUserId((int)$user['id']);
        $this->success([
            'connected' => $row !== null,
            'accountId' => $row['account_id'] ?? null,
            'expiresAt' => $row['expires_at'] ?? null,
        ]);
    }
}
