<?php
declare(strict_types=1);

namespace App\Controllers\Integrations;

use App\Controllers\BaseController;
use App\Libraries\InboundProcessor;

/**
 * Brevo inbound parsing webhook (no JWT — verify shared secret).
 */
final class BrevoInboundController extends BaseController
{
    /** POST /api/integrations/brevo/inbound */
    public function handle(): never
    {
        $secret = trim((string)(getenv('BREVO_INBOUND_WEBHOOK_SECRET') ?: ''));
        if ($secret === '') {
            http_response_code(503);
            echo json_encode(['success' => false, 'message' => 'Inbound webhook not configured']);
            exit;
        }
        $hdrs = [
            $_SERVER['HTTP_X_BREVO_INBOUND_TOKEN'] ?? '',
            $_SERVER['HTTP_X_WEBHOOK_TOKEN'] ?? '',
        ];
        $ok = false;
        foreach ($hdrs as $h) {
            if (is_string($h) && hash_equals($secret, trim($h))) {
                $ok = true;
                break;
            }
        }
        if (!$ok) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Invalid token']);
            exit;
        }

        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') {
            $this->error('Empty body', 400);
        }
        try {
            $json = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            $this->error('Invalid JSON', 400);
        }
        if (!is_array($json)) {
            $this->error('Invalid payload', 400);
        }

        try {
            $res = (new InboundProcessor())->processWebhookPayload($json);
        } catch (\Throwable $e) {
            error_log('[BrevoInbound] ' . $e->getMessage());
            $this->error('Processing failed', 500);
        }

        $this->success($res, 'Accepted', 201);
    }
}
