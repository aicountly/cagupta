<?php
declare(strict_types=1);

namespace App\Controllers\Webhooks;

use App\Controllers\BaseController;
use App\Libraries\AppointmentPaymentHooks;
use App\Libraries\RazorpayClient;
use App\Models\RazorpayWebhookEventModel;
use App\Models\TxnModel;

/**
 * Razorpay webhooks — signature verified, idempotent.
 */
class RazorpayWebhookController extends BaseController
{
    /** POST /api/webhooks/razorpay */
    public function handle(): never
    {
        $secret = trim((string)(getenv('RAZORPAY_WEBHOOK_SECRET') ?: ''));
        if ($secret === '') {
            http_response_code(503);
            echo json_encode(['message' => 'Webhook not configured']);
            exit;
        }
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            $this->error('Empty body', 400);
        }
        $sig = $_SERVER['HTTP_X_RAZORPAY_SIGNATURE'] ?? '';
        if (!RazorpayClient::verifyWebhookSignature($raw, (string)$sig, $secret)) {
            http_response_code(400);
            echo json_encode(['message' => 'Invalid signature']);
            exit;
        }

        try {
            $payload = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            http_response_code(400);
            echo json_encode(['message' => 'Invalid JSON']);
            exit;
        }
        if (!is_array($payload)) {
            http_response_code(400);
            exit;
        }

        $eventId = (string)($payload['id'] ?? '');
        if ($eventId === '') {
            http_response_code(200);
            echo json_encode(['ok' => true, 'ignored' => true]);
            exit;
        }

        $event = (string)($payload['event'] ?? '');
        if ($event !== 'payment.captured') {
            http_response_code(200);
            echo json_encode(['ok' => true, 'ignored' => true]);
            exit;
        }

        $entity = $payload['payload']['payment']['entity'] ?? null;
        if (!is_array($entity)) {
            http_response_code(200);
            echo json_encode(['ok' => true]);
            exit;
        }

        $paymentId = (string)($entity['id'] ?? '');
        $orderId   = (string)($entity['order_id'] ?? '');
        $amountPaise = (int)($entity['amount'] ?? 0);
        $notes       = $entity['notes'] ?? [];
        if (!is_array($notes)) {
            $notes = [];
        }

        $dup = new RazorpayWebhookEventModel();
        if (!$dup->tryInsertEvent($eventId, $paymentId !== '' ? $paymentId : null, $orderId !== '' ? $orderId : null)) {
            http_response_code(200);
            echo json_encode(['ok' => true, 'duplicate' => true]);
            exit;
        }

        $amountInr = round($amountPaise / 100, 2);
        if ($amountInr <= 0) {
            http_response_code(200);
            echo json_encode(['ok' => true]);
            exit;
        }

        $invoiceTxnId = (int)($notes['invoice_txn_id'] ?? 0);
        if ($invoiceTxnId <= 0) {
            http_response_code(200);
            echo json_encode(['ok' => true, 'ignored' => 'no_invoice']);
            exit;
        }

        $txnModel = new TxnModel();
        $invoice  = $txnModel->find($invoiceTxnId);
        if ($invoice === null || ($invoice['txn_type'] ?? '') !== 'invoice') {
            http_response_code(200);
            echo json_encode(['ok' => true, 'ignored' => 'invoice_missing']);
            exit;
        }

        $cid = (int)($invoice['client_id'] ?? 0);
        $oid = (int)($invoice['organization_id'] ?? 0);
        $aptId = (int)($invoice['appointment_id'] ?? 0);
        if ($aptId <= 0) {
            $aptId = (int)($notes['appointment_id'] ?? 0);
        }

        $receipt = [
            'client_id'          => $cid > 0 ? $cid : null,
            'organization_id'  => $oid > 0 ? $oid : null,
            'amount'             => $amountInr,
            'txn_date'           => date('Y-m-d'),
            'linked_txn_id'      => $invoiceTxnId,
            'payment_method'     => 'razorpay',
            'reference_number'   => $paymentId !== '' ? $paymentId : $orderId,
            'narration'          => 'Razorpay payment',
            'created_by'         => null,
            'appointment_id'     => $aptId > 0 ? $aptId : null,
        ];
        if (($receipt['client_id'] ?? null) === null && ($receipt['organization_id'] ?? null) === null) {
            http_response_code(200);
            echo json_encode(['ok' => true, 'ignored' => 'no_entity']);
            exit;
        }

        try {
            $txnModel->createReceipt($receipt);
        } catch (\Throwable $e) {
            error_log('[RazorpayWebhook] receipt: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['message' => 'Receipt failed']);
            exit;
        }

        AppointmentPaymentHooks::afterReceiptOnInvoice($invoiceTxnId);

        header('Content-Type: application/json; charset=UTF-8');
        http_response_code(200);
        echo json_encode(['ok' => true]);
        exit;
    }
}
