<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * CRUD for quotation_shares (tokenized PDF download links).
 */
class QuotationShareModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function findByToken(string $token): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT s.*, q.lead_id
             FROM quotation_shares s
             INNER JOIN lead_quotations q ON q.id = s.lead_quotation_id
             WHERE s.share_token = :token LIMIT 1'
        );
        $stmt->execute([':token' => $token]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function create(
        int $leadQuotationId,
        ?int $sharedBy,
        string $channel,
        ?string $recipientName,
        ?string $recipientEmail,
        ?string $recipientMobile,
        string $shareToken,
        string $pdfPath,
        string $expiresAt
    ): int {
        $stmt = $this->db->prepare(
            'INSERT INTO quotation_shares
                (lead_quotation_id, shared_by, channel, recipient_name, recipient_email,
                 recipient_mobile, share_token, pdf_path, expires_at, status, created_at)
             VALUES
                (:qid, :uid, :channel, :name, :email, :mobile, :token, :path, :exp, \'sent\', NOW())
             RETURNING id'
        );
        $stmt->execute([
            ':qid'     => $leadQuotationId,
            ':uid'     => $sharedBy,
            ':channel' => $channel,
            ':name'    => $recipientName,
            ':email'   => $recipientEmail,
            ':mobile'  => $recipientMobile,
            ':token'   => $shareToken,
            ':path'    => $pdfPath,
            ':exp'     => $expiresAt,
        ]);
        return (int)$stmt->fetchColumn();
    }
}
