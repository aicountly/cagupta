<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

class RazorpayWebhookEventModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return bool true if inserted (new), false if duplicate event_id
     */
    public function tryInsertEvent(string $eventId, ?string $paymentId, ?string $orderId): bool
    {
        try {
            $stmt = $this->db->prepare(
                'INSERT INTO razorpay_webhook_events (event_id, razorpay_payment_id, razorpay_order_id)
                 VALUES (:e, :p, :o)'
            );
            $stmt->execute([
                ':e' => $eventId,
                ':p' => $paymentId,
                ':o' => $orderId,
            ]);

            return true;
        } catch (\PDOException $e) {
            if ($e->getCode() === '23505' || str_contains(strtolower($e->getMessage()), 'duplicate')) {
                return false;
            }
            throw $e;
        }
    }
}
