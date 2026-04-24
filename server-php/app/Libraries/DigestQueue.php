<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Config\Database;

/**
 * DigestQueue — writes activity events to `superadmin_digest_queue`.
 *
 * Controllers call DigestQueue::enqueue() instead of sending an email
 * directly. A nightly CLI script (cli/send-digest.php) reads the queue,
 * builds one consolidated email, and clears the processed rows.
 */
class DigestQueue
{
    /**
     * Insert one activity event into the digest queue.
     *
     * @param string $entityType  'contact' or 'organization'
     * @param string $bucket      Human label for the section bucket (same as entityType)
     * @param int    $entityId    Primary key of the affected row
     * @param string $displayName Human-readable name of the entity
     * @param string $actionLabel e.g. 'Created', 'Updated', 'Deleted', 'Status Changed (Activated)'
     * @param string $status      e.g. 'Active', 'Inactive'
     * @param string $actorName   Name of the user who performed the action
     * @param string $actorEmail  Email of the user who performed the action
     */
    public static function enqueue(
        string $entityType,
        string $bucket,
        int    $entityId,
        string $displayName,
        string $actionLabel,
        string $status,
        string $actorName,
        string $actorEmail
    ): void {
        try {
            $pdo = Database::getConnection();
            $stmt = $pdo->prepare(
                'INSERT INTO superadmin_digest_queue
                    (digest_date, occurred_at, entity_type, bucket,
                     entity_id, display_name, action_label, status,
                     actor_name, actor_email)
                 VALUES
                    (CURRENT_DATE, NOW(), :entity_type, :bucket,
                     :entity_id, :display_name, :action_label, :status,
                     :actor_name, :actor_email)'
            );
            $stmt->execute([
                ':entity_type'  => substr($entityType, 0, 16),
                ':bucket'       => substr($bucket, 0, 16),
                ':entity_id'    => $entityId,
                ':display_name' => $displayName,
                ':action_label' => substr($actionLabel, 0, 128),
                ':status'       => substr($status, 0, 16),
                ':actor_name'   => $actorName,
                ':actor_email'  => $actorEmail,
            ]);
        } catch (\Throwable $e) {
            error_log('[DigestQueue] Failed to enqueue activity: ' . $e->getMessage());
        }
    }
}
