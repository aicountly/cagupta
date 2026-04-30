<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * KycDocumentModel — CRUD + audit for the kyc_documents and kyc_document_audit tables.
 *
 * Versioning convention
 * ─────────────────────
 * Every document record belongs to a "version group" identified by:
 *   (entity_type, entity_id, doc_category, doc_label)
 *
 * Within a group, version_number starts at 1 and increments for each new
 * upload.  Only one record has is_latest = TRUE at any time (within the group).
 *
 * For document types that allow_multiple (Passport, Bank Proof …) the
 * doc_label supplied by the user ("HDFC Savings", "Old Passport 2018") forms
 * separate version groups, so each label has its own independent version chain.
 */
class KycDocumentModel
{
    private PDO $db;

    /** Predefined KYC categories for contacts (clients). */
    public const CONTACT_CATEGORIES = [
        'pan'                 => ['label' => 'PAN Card',                    'allow_multiple' => false],
        'aadhaar'             => ['label' => 'Aadhaar Card',                'allow_multiple' => false],
        'din'                 => ['label' => 'DIN',                         'allow_multiple' => false],
        'driving_license'     => ['label' => 'Driving License',             'allow_multiple' => false],
        'voter_id'            => ['label' => 'Voter ID',                    'allow_multiple' => false],
        'passport'            => ['label' => 'Passport',                    'allow_multiple' => true],
        'bank_proof'          => ['label' => 'Bank Proof',                  'allow_multiple' => true],
        'utility_telephone'   => ['label' => 'Utility Bill - Telephone',    'allow_multiple' => true],
        'utility_water'       => ['label' => 'Utility Bill - Water & Sewage','allow_multiple' => true],
        'utility_electricity' => ['label' => 'Utility Bill - Electricity',  'allow_multiple' => true],
        'signature'           => ['label' => 'Signature',                   'allow_multiple' => false],
        'photograph'          => ['label' => 'Photograph',                  'allow_multiple' => false],
        'other'               => ['label' => 'Other Document',              'allow_multiple' => true],
    ];

    /** Predefined KYC categories for organizations. */
    public const ORG_CATEGORIES = [
        'coi'               => ['label' => 'COI (Certificate of Incorporation)', 'allow_multiple' => false],
        'aoa'               => ['label' => 'AOA (Articles of Association)',       'allow_multiple' => false],
        'moa'               => ['label' => 'MOA (Memorandum of Association)',     'allow_multiple' => false],
        'iec'               => ['label' => 'IEC (Import Export Code)',            'allow_multiple' => false],
        'pan'               => ['label' => 'PAN Card',                           'allow_multiple' => false],
        'tan'               => ['label' => 'TAN Certificate',                    'allow_multiple' => false],
        'gst_certificate'   => ['label' => 'GST Certificate',                    'allow_multiple' => true],
        'bank_proof'        => ['label' => 'Bank Proof',                         'allow_multiple' => true],
        'utility_telephone' => ['label' => 'Utility Bill - Telephone',           'allow_multiple' => true],
        'utility_water'     => ['label' => 'Utility Bill - Water & Sewage',      'allow_multiple' => true],
        'utility_electricity'=> ['label' => 'Utility Bill - Electricity',        'allow_multiple' => true],
        'rcmc'              => ['label' => 'RCMC Certificate',                   'allow_multiple' => true],
        'other_registration'=> ['label' => 'Other Registration Certificate',     'allow_multiple' => true],
        'other'             => ['label' => 'Other Document',                     'allow_multiple' => true],
    ];

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    // ── Category helpers ──────────────────────────────────────────────────────

    /**
     * Return category map for the given entity type.
     *
     * @return array<string, array{label: string, allow_multiple: bool}>
     */
    public static function categoriesFor(string $entityType): array
    {
        return $entityType === 'organization'
            ? self::ORG_CATEGORIES
            : self::CONTACT_CATEGORIES;
    }

    /** True when the category is defined for this entity type. */
    public static function isValidCategory(string $entityType, string $category): bool
    {
        return array_key_exists($category, self::categoriesFor($entityType));
    }

    // ── Folder / path helpers ─────────────────────────────────────────────────

    /**
     * Build the entity folder name: CLT-001 or ORG-001.
     */
    public static function entityKey(string $entityType, int $entityId): string
    {
        $prefix = $entityType === 'organization' ? 'ORG' : 'CLT';
        return $prefix . '-' . str_pad((string) $entityId, 3, '0', STR_PAD_LEFT);
    }

    /**
     * Return the relative directory (from docu_bank root) for a given doc.
     * e.g. CLT-001/KYC
     */
    public static function relativeDir(string $entityType, int $entityId, string $docFolder = 'KYC'): string
    {
        return self::entityKey($entityType, $entityId) . DIRECTORY_SEPARATOR . strtoupper($docFolder);
    }

    // ── Reads ─────────────────────────────────────────────────────────────────

    /**
     * List all active documents for an entity.
     * Returns latest version first within each (category, label) group,
     * then all older versions.
     *
     * @return array<int, array<string, mixed>>
     */
    public function listForEntity(string $entityType, int $entityId): array
    {
        $stmt = $this->db->prepare(
            'SELECT d.*,
                    u.name AS uploaded_by_name
             FROM   kyc_documents d
             LEFT JOIN users u ON u.id = d.uploaded_by
             WHERE  d.entity_type = :et
               AND  d.entity_id   = :eid
               AND  d.is_active   = TRUE
             ORDER BY d.doc_category, d.doc_label, d.version_number DESC, d.created_at DESC'
        );
        $stmt->execute([':et' => $entityType, ':eid' => $entityId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * List all documents (across all entities) — for the global Documents page.
     *
     * @return array{docs: array<int, array<string, mixed>>, total: int}
     */
    public function listAll(
        int    $page     = 1,
        int    $perPage  = 50,
        string $search   = '',
        string $entityType = '',
        string $category   = ''
    ): array {
        $conditions = ['d.is_active = TRUE'];
        $params     = [];

        if ($entityType !== '') {
            $conditions[] = 'd.entity_type = :et';
            $params[':et'] = $entityType;
        }
        if ($category !== '') {
            $conditions[] = 'd.doc_category = :cat';
            $params[':cat'] = $category;
        }
        if ($search !== '') {
            $like = '%' . $search . '%';
            $conditions[] = '(d.original_file_name ILIKE :s1 OR d.doc_label ILIKE :s2
                               OR c.first_name ILIKE :s3 OR c.last_name ILIKE :s4
                               OR c.organization_name ILIKE :s5
                               OR o.name ILIKE :s6)';
            $params[':s1'] = $like;
            $params[':s2'] = $like;
            $params[':s3'] = $like;
            $params[':s4'] = $like;
            $params[':s5'] = $like;
            $params[':s6'] = $like;
        }

        $where  = 'WHERE ' . implode(' AND ', $conditions);
        $offset = ($page - 1) * $perPage;

        $countSql = "SELECT COUNT(*) FROM kyc_documents d
                     LEFT JOIN clients       c ON d.entity_type = 'contact'      AND d.entity_id = c.id
                     LEFT JOIN organizations o ON d.entity_type = 'organization' AND d.entity_id = o.id
                     {$where}";
        $cStmt = $this->db->prepare($countSql);
        $cStmt->execute($params);
        $total = (int) $cStmt->fetchColumn();

        $sql = "SELECT d.*,
                       u.name AS uploaded_by_name,
                       CASE d.entity_type
                           WHEN 'contact'
                               THEN CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))
                           WHEN 'organization' THEN o.name
                       END AS entity_display_name
                FROM   kyc_documents d
                LEFT JOIN users        u ON u.id = d.uploaded_by
                LEFT JOIN clients       c ON d.entity_type = 'contact'      AND d.entity_id = c.id
                LEFT JOIN organizations o ON d.entity_type = 'organization' AND d.entity_id = o.id
                {$where}
                ORDER BY d.created_at DESC
                LIMIT :lim OFFSET :off";

        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset,  PDO::PARAM_INT);
        $stmt->execute();

        return ['docs' => $stmt->fetchAll(PDO::FETCH_ASSOC), 'total' => $total];
    }

    /**
     * Fetch a single document by ID.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT d.*, u.name AS uploaded_by_name
             FROM   kyc_documents d
             LEFT JOIN users u ON u.id = d.uploaded_by
             WHERE  d.id = :id'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row !== false ? $row : null;
    }

    // ── Next version number ───────────────────────────────────────────────────

    /**
     * Return the next version_number for the given (entity, category, label) group.
     */
    public function nextVersionNumber(string $entityType, int $entityId, string $category, string $label): int
    {
        $stmt = $this->db->prepare(
            'SELECT COALESCE(MAX(version_number), 0) + 1
             FROM   kyc_documents
             WHERE  entity_type   = :et
               AND  entity_id     = :eid
               AND  doc_category  = :cat
               AND  doc_label     = :lbl'
        );
        $stmt->execute([
            ':et'  => $entityType,
            ':eid' => $entityId,
            ':cat' => $category,
            ':lbl' => $label,
        ]);
        return (int) $stmt->fetchColumn();
    }

    // ── Writes ────────────────────────────────────────────────────────────────

    /**
     * Mark all prior versions in the same group as not-latest.
     */
    private function demotePriorVersions(string $entityType, int $entityId, string $category, string $label): void
    {
        $stmt = $this->db->prepare(
            'UPDATE kyc_documents
             SET    is_latest  = FALSE,
                    updated_at = NOW()
             WHERE  entity_type  = :et
               AND  entity_id    = :eid
               AND  doc_category = :cat
               AND  doc_label    = :lbl
               AND  is_latest    = TRUE'
        );
        $stmt->execute([
            ':et'  => $entityType,
            ':eid' => $entityId,
            ':cat' => $category,
            ':lbl' => $label,
        ]);
    }

    /**
     * Insert a new document record and return its ID.
     *
     * @param array<string, mixed> $data
     */
    public function create(array $data): int
    {
        $this->demotePriorVersions(
            (string) $data['entity_type'],
            (int)    $data['entity_id'],
            (string) $data['doc_category'],
            (string) ($data['doc_label'] ?? '')
        );

        $stmt = $this->db->prepare(
            'INSERT INTO kyc_documents
                (entity_type, entity_id, doc_folder, doc_category, doc_label,
                 version_number, is_latest,
                 original_file_name, stored_file_name, file_path,
                 file_size, original_size, mime_type, is_compressed,
                 notes, uploaded_by, created_at, updated_at)
             VALUES
                (:entity_type, :entity_id, :doc_folder, :doc_category, :doc_label,
                 :version_number, TRUE,
                 :original_file_name, :stored_file_name, :file_path,
                 :file_size, :original_size, :mime_type, :is_compressed,
                 :notes, :uploaded_by, NOW(), NOW())
             RETURNING id'
        );
        $stmt->execute([
            ':entity_type'       => $data['entity_type'],
            ':entity_id'         => $data['entity_id'],
            ':doc_folder'        => $data['doc_folder']        ?? 'KYC',
            ':doc_category'      => $data['doc_category'],
            ':doc_label'         => $data['doc_label']         ?? '',
            ':version_number'    => $data['version_number']    ?? 1,
            ':original_file_name'=> $data['original_file_name'],
            ':stored_file_name'  => $data['stored_file_name'],
            ':file_path'         => $data['file_path'],
            ':file_size'         => $data['file_size']         ?? 0,
            ':original_size'     => $data['original_size']     ?? 0,
            ':mime_type'         => $data['mime_type']         ?? '',
            ':is_compressed'     => $data['is_compressed']     ? 'true' : 'false',
            ':notes'             => $data['notes']             ?? null,
            ':uploaded_by'       => $data['uploaded_by'],
        ]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Update label and/or notes.
     *
     * @param array<string, mixed> $data  Accepts keys: doc_label, notes
     */
    public function update(int $id, array $data): void
    {
        $sets   = [];
        $params = [':id' => $id];

        if (array_key_exists('doc_label', $data)) {
            $sets[] = 'doc_label = :doc_label';
            $params[':doc_label'] = (string) $data['doc_label'];
        }
        if (array_key_exists('notes', $data)) {
            $sets[] = 'notes = :notes';
            $params[':notes'] = $data['notes'] !== '' ? (string) $data['notes'] : null;
        }
        if ($sets === []) {
            return;
        }
        $sets[] = 'updated_at = NOW()';

        $this->db->prepare(
            'UPDATE kyc_documents SET ' . implode(', ', $sets) . ' WHERE id = :id'
        )->execute($params);
    }

    /**
     * Soft-delete a document.
     */
    public function softDelete(int $id, int $deletedBy): void
    {
        $stmt = $this->db->prepare(
            'UPDATE kyc_documents
             SET    is_active  = FALSE,
                    deleted_at = NOW(),
                    deleted_by = :deleted_by,
                    updated_at = NOW()
             WHERE  id = :id'
        );
        $stmt->execute([':id' => $id, ':deleted_by' => $deletedBy]);

        // If this was the latest, promote the previous version (if any)
        $this->promoteLatestAfterDelete($id);
    }

    /**
     * After a soft-delete of a latest document, find the previous version and make it latest.
     */
    private function promoteLatestAfterDelete(int $deletedId): void
    {
        // Fetch the deleted record to know the group
        $del = $this->find($deletedId);
        if ($del === null || (bool) $del['is_latest'] === false) {
            return;
        }
        // Find the highest-versioned still-active record in the same group
        $stmt = $this->db->prepare(
            'SELECT id FROM kyc_documents
             WHERE  entity_type  = :et
               AND  entity_id    = :eid
               AND  doc_category = :cat
               AND  doc_label    = :lbl
               AND  is_active    = TRUE
               AND  id           != :did
             ORDER BY version_number DESC
             LIMIT 1'
        );
        $stmt->execute([
            ':et'  => $del['entity_type'],
            ':eid' => $del['entity_id'],
            ':cat' => $del['doc_category'],
            ':lbl' => $del['doc_label'],
            ':did' => $deletedId,
        ]);
        $prevId = $stmt->fetchColumn();
        if ($prevId !== false && $prevId > 0) {
            $this->db->prepare(
                'UPDATE kyc_documents SET is_latest = TRUE, updated_at = NOW() WHERE id = :id'
            )->execute([':id' => $prevId]);
        }
    }

    // ── Audit ─────────────────────────────────────────────────────────────────

    /**
     * Append an audit entry.
     *
     * @param array<string, mixed> $data
     */
    public function logAudit(array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO kyc_document_audit
                (document_id, action, actor_user_id, actor_name, ip_address, user_agent, notes, created_at)
             VALUES
                (:document_id, :action, :actor_user_id, :actor_name, :ip_address, :user_agent, :notes, NOW())'
        );
        $stmt->execute([
            ':document_id'   => $data['document_id'],
            ':action'        => $data['action'],
            ':actor_user_id' => $data['actor_user_id'] ?? null,
            ':actor_name'    => $data['actor_name']    ?? '',
            ':ip_address'    => $data['ip_address']    ?? null,
            ':user_agent'    => $data['user_agent']    ?? null,
            ':notes'         => $data['notes']         ?? null,
        ]);
    }

    /**
     * Return the full audit trail for one document.
     *
     * @return array<int, array<string, mixed>>
     */
    public function auditFor(int $documentId): array
    {
        $stmt = $this->db->prepare(
            'SELECT a.*, u.name AS actor_display
             FROM   kyc_document_audit a
             LEFT JOIN users u ON u.id = a.actor_user_id
             WHERE  a.document_id = :id
             ORDER BY a.created_at DESC'
        );
        $stmt->execute([':id' => $documentId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
