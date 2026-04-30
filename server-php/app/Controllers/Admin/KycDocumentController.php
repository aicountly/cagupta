<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Auth as AuthConfig;
use App\Controllers\BaseController;
use App\Libraries\BrevoMailer;
use App\Libraries\OtpService;
use App\Models\KycDocumentModel;
use App\Models\UserModel;

/**
 * KycDocumentController — file upload, download, versioning & audit for KYC documents.
 *
 * Storage layout (on server filesystem):
 *   docu_bank/
 *     CLT-001/KYC/{uuid}.pdf
 *     ORG-001/KYC/{uuid}.jpg
 *
 * Root path resolution (in priority order):
 *   1. DOCU_BANK_PATH env var
 *   2. {repo_root}/docu_bank  (four levels up from this file)
 *
 * Compression:
 *   - JPEG / PNG / WebP / GIF: resized to max 2048 px, recompressed at 80 % quality via GD.
 *   - PDF and other types: stored verbatim.
 *   - User may bypass compression by providing a valid super-admin OTP in the
 *     X-Superadmin-Otp request header (obtained via the request-uncompressed-otp endpoint).
 */
class KycDocumentController extends BaseController
{
    private KycDocumentModel $docs;
    private UserModel        $users;

    /** Allowed MIME types / extensions. ZIP, TAR and other archives are blocked. */
    private const ALLOWED_MIME = [
        'image/jpeg'       => 'jpg',
        'image/jpg'        => 'jpg',
        'image/png'        => 'png',
        'image/gif'        => 'gif',
        'image/webp'       => 'webp',
        'application/pdf'  => 'pdf',
    ];

    /** Image MIME types that GD can compress. */
    private const COMPRESSIBLE_IMAGE_MIMES = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    ];

    /** Maximum pixel dimension (longest side) applied during compression. */
    private const MAX_IMAGE_DIMENSION = 2048;

    /** JPEG quality used during compression (0–100). */
    private const JPEG_QUALITY = 80;

    public function __construct()
    {
        $this->docs  = new KycDocumentModel();
        $this->users = new UserModel();
    }

    // ── GET /api/admin/kyc-documents  (query: entity_type, entity_id) ────────

    /**
     * List all KYC documents for one entity, or paginated global list.
     */
    public function index(): never
    {
        $entityType = trim((string) $this->query('entity_type', ''));
        $entityIdRaw = $this->query('entity_id', null);

        if ($entityType !== '' && $entityIdRaw !== null) {
            // Single-entity listing
            if (!in_array($entityType, ['contact', 'organization'], true)) {
                $this->error('entity_type must be contact or organization.', 422);
            }
            $entityId = (int) $entityIdRaw;
            if ($entityId <= 0) {
                $this->error('entity_id must be a positive integer.', 422);
            }

            $rows = $this->docs->listForEntity($entityType, $entityId);
            $this->success([
                'documents'  => $rows,
                'categories' => KycDocumentModel::categoriesFor($entityType),
            ], 'Documents retrieved');
        }

        // Global paginated listing
        $page      = max(1, (int) $this->query('page', 1));
        $perPage   = min(100, max(1, (int) $this->query('per_page', 50)));
        $search    = trim((string) $this->query('search', ''));
        $filterEt  = trim((string) $this->query('entity_type', ''));
        $filterCat = trim((string) $this->query('category', ''));

        $result = $this->docs->listAll($page, $perPage, $search, $filterEt, $filterCat);

        $this->success($result['docs'], 'Documents retrieved', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => (int) ceil($result['total'] / $perPage),
            ],
        ]);
    }

    // ── POST /api/admin/kyc-documents  (multipart/form-data) ─────────────────

    /**
     * Upload one or more files for an entity.
     *
     * Expected multipart fields:
     *   entity_type       contact | organization
     *   entity_id         integer
     *   doc_category      one of the predefined codes
     *   doc_label         user label (required for allow_multiple types, optional otherwise)
     *   notes             optional free text
     *   skip_compression  "1" | "true" — requires valid X-Superadmin-Otp header
     *   files[]           one or more files
     */
    public function store(): never
    {
        $entityType  = trim((string) ($_POST['entity_type']  ?? ''));
        $entityId    = (int) ($_POST['entity_id']   ?? 0);
        $docCategory = trim((string) ($_POST['doc_category'] ?? ''));
        $docLabel    = trim((string) ($_POST['doc_label']    ?? ''));
        $notes       = trim((string) ($_POST['notes']        ?? ''));

        // Validate basics
        if (!in_array($entityType, ['contact', 'organization'], true)) {
            $this->error('entity_type must be contact or organization.', 422);
        }
        if ($entityId <= 0) {
            $this->error('entity_id is required.', 422);
        }
        if ($docCategory === '') {
            $this->error('doc_category is required.', 422);
        }
        if (!KycDocumentModel::isValidCategory($entityType, $docCategory)) {
            $this->error("doc_category '{$docCategory}' is not valid for entity_type '{$entityType}'.", 422);
        }

        // Auto-fill label with the category's human name when not supplied.
        // This ensures every document has a readable label from the moment it
        // is uploaded; the user can always edit it later via PUT.
        if ($docLabel === '') {
            $cats     = KycDocumentModel::categoriesFor($entityType);
            $docLabel = $cats[$docCategory]['label'] ?? $docCategory;
        }

        // Check OTP for uncompressed bypass
        $skipCompression = false;
        $rawSkip = strtolower(trim((string) ($_POST['skip_compression'] ?? '')));
        if ($rawSkip === '1' || $rawSkip === 'true') {
            $otp = $this->readSuperadminOtpFromRequest();
            if ($otp === '' || !$this->verifySuperadminOtp($otp)) {
                $this->error('A valid super-admin OTP is required to upload without compression.', 403);
            }
            $skipCompression = true;
        }

        // Validate files
        if (empty($_FILES['files']) || !isset($_FILES['files']['name'])) {
            $this->error('No files uploaded. Use files[] field.', 422);
        }

        // Normalise PHP's $_FILES multi-file structure
        $fileList = $this->normaliseFiles($_FILES['files']);

        if (count($fileList) === 0) {
            $this->error('No valid files found in the upload.', 422);
        }

        // Max 10 files per request
        if (count($fileList) > 10) {
            $this->error('A maximum of 10 files can be uploaded per request.', 422);
        }

        $root       = $this->docuBankRoot();
        $actingUser = $this->authUser();
        $uploadedBy = (int) ($actingUser['id'] ?? 0);
        $actorName  = (string) ($actingUser['name'] ?? 'Unknown');
        $ip         = $_SERVER['REMOTE_ADDR'] ?? null;
        $ua         = $_SERVER['HTTP_USER_AGENT'] ?? null;

        $created = [];

        foreach ($fileList as $file) {
            if ($file['error'] !== UPLOAD_ERR_OK) {
                $this->error('File upload failed (PHP error code ' . $file['error'] . ').', 422);
            }

            $origName = basename((string) $file['name']);
            $tmpPath  = (string) $file['tmp_name'];
            $origSize = (int) $file['size'];

            // Detect real MIME from file bytes; fall back to original filename's
            // extension when finfo returns the generic application/octet-stream.
            $mime = $this->detectMime($tmpPath, $origName);
            if (!array_key_exists($mime, self::ALLOWED_MIME)) {
                $this->error("File type '{$mime}' is not allowed. Upload only images (JPEG, PNG, GIF, WebP) or PDF.", 422);
            }

            $ext        = self::ALLOWED_MIME[$mime];
            $storedName = bin2hex(random_bytes(16)) . '.' . $ext;
            $relDir     = KycDocumentModel::relativeDir($entityType, $entityId);
            $absDir     = $root . DIRECTORY_SEPARATOR . $relDir;

            if (!is_dir($absDir) && !mkdir($absDir, 0750, true)) {
                $this->error('Failed to create storage directory. Check server permissions.', 500);
            }

            $destPath = $absDir . DIRECTORY_SEPARATOR . $storedName;
            $relPath  = $relDir . DIRECTORY_SEPARATOR . $storedName;

            // Compress if applicable
            $finalSize = $origSize;
            if (!$skipCompression && in_array($mime, self::COMPRESSIBLE_IMAGE_MIMES, true)) {
                $compressed = $this->compressImage($tmpPath, $destPath, $mime);
                if (!$compressed) {
                    // Fallback: move as-is if GD not available
                    if (!move_uploaded_file($tmpPath, $destPath)) {
                        $this->error('Failed to move uploaded file.', 500);
                    }
                }
                $finalSize = (int) filesize($destPath);
            } else {
                if (!move_uploaded_file($tmpPath, $destPath)) {
                    $this->error('Failed to move uploaded file.', 500);
                }
                $finalSize = (int) filesize($destPath);
            }

            $versionNum = $this->docs->nextVersionNumber($entityType, $entityId, $docCategory, $docLabel);

            $docId = $this->docs->create([
                'entity_type'        => $entityType,
                'entity_id'          => $entityId,
                'doc_folder'         => 'KYC',
                'doc_category'       => $docCategory,
                'doc_label'          => $docLabel,
                'version_number'     => $versionNum,
                'original_file_name' => $origName,
                'stored_file_name'   => $storedName,
                'file_path'          => $relPath,
                'file_size'          => $finalSize,
                'original_size'      => $origSize,
                'mime_type'          => $mime,
                'is_compressed'      => !$skipCompression && in_array($mime, self::COMPRESSIBLE_IMAGE_MIMES, true),
                'notes'              => $notes !== '' ? $notes : null,
                'uploaded_by'        => $uploadedBy,
            ]);

            $this->docs->logAudit([
                'document_id'   => $docId,
                'action'        => 'uploaded',
                'actor_user_id' => $uploadedBy,
                'actor_name'    => $actorName,
                'ip_address'    => $ip,
                'user_agent'    => $ua,
                'notes'         => $skipCompression ? 'Uploaded without compression (OTP verified).' : null,
            ]);

            $created[] = $this->docs->find($docId);
        }

        $this->success($created, count($created) . ' file(s) uploaded successfully.', 201);
    }

    // ── GET /api/admin/kyc-documents/:id ─────────────────────────────────────

    /**
     * Return metadata for a single document.
     */
    public function show(int $id): never
    {
        $doc = $this->docs->find($id);
        if ($doc === null) {
            $this->error('Document not found.', 404);
        }

        $actingUser = $this->authUser();
        $this->docs->logAudit([
            'document_id'   => $id,
            'action'        => 'viewed',
            'actor_user_id' => (int) ($actingUser['id'] ?? 0),
            'actor_name'    => (string) ($actingUser['name'] ?? ''),
            'ip_address'    => $_SERVER['REMOTE_ADDR'] ?? null,
            'user_agent'    => $_SERVER['HTTP_USER_AGENT'] ?? null,
        ]);

        $this->success($doc, 'Document retrieved');
    }

    // ── GET /api/admin/kyc-documents/:id/file ────────────────────────────────

    /**
     * Stream the file to the browser.
     *
     * This endpoint streams binary content.  JSON headers set in index.php are
     * overridden here.
     *
     * Query: ?download=1  → Content-Disposition: attachment (force download)
     */
    public function serveFile(int $id): never
    {
        $doc = $this->docs->find($id);
        if ($doc === null || !(bool) $doc['is_active']) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Document not found.']);
            exit;
        }

        $root    = $this->docuBankRoot();
        $absPath = $root . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, (string) $doc['file_path']);

        if (!is_file($absPath)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'File not found on disk.']);
            exit;
        }

        $actingUser = $this->authUser();
        $this->docs->logAudit([
            'document_id'   => $id,
            'action'        => 'downloaded',
            'actor_user_id' => (int) ($actingUser['id'] ?? 0),
            'actor_name'    => (string) ($actingUser['name'] ?? ''),
            'ip_address'    => $_SERVER['REMOTE_ADDR'] ?? null,
            'user_agent'    => $_SERVER['HTTP_USER_AGENT'] ?? null,
        ]);

        $mime     = (string) $doc['mime_type'];
        $origName = rawurlencode((string) $doc['original_file_name']);
        $forceDownload = isset($_GET['download']) && $_GET['download'] === '1';

        // Override JSON content-type set by index.php
        header('Content-Type: ' . ($mime ?: 'application/octet-stream'), true);
        header('Content-Length: ' . filesize($absPath));

        if ($forceDownload) {
            header("Content-Disposition: attachment; filename=\"{$origName}\"");
        } else {
            header("Content-Disposition: inline; filename=\"{$origName}\"");
        }

        header('Cache-Control: private, max-age=3600');
        header('X-Content-Type-Options: nosniff');

        // Flush JSON content-type override before output
        if (ob_get_level()) {
            ob_end_clean();
        }

        readfile($absPath);
        exit;
    }

    // ── PUT /api/admin/kyc-documents/:id ─────────────────────────────────────

    /**
     * Update label and/or notes.
     */
    public function update(int $id): never
    {
        $doc = $this->docs->find($id);
        if ($doc === null || !(bool) $doc['is_active']) {
            $this->error('Document not found.', 404);
        }

        $body = $this->getJsonBody();
        $data = [];

        if (array_key_exists('doc_label', $body)) {
            $data['doc_label'] = trim((string) $body['doc_label']);
        }
        if (array_key_exists('notes', $body)) {
            $data['notes'] = trim((string) $body['notes']);
        }

        if ($data !== []) {
            $this->docs->update($id, $data);
        }

        $actingUser = $this->authUser();
        $this->docs->logAudit([
            'document_id'   => $id,
            'action'        => 'label_updated',
            'actor_user_id' => (int) ($actingUser['id'] ?? 0),
            'actor_name'    => (string) ($actingUser['name'] ?? ''),
            'ip_address'    => $_SERVER['REMOTE_ADDR'] ?? null,
            'notes'         => 'Label/notes updated.',
        ]);

        $this->success($this->docs->find($id), 'Document updated');
    }

    // ── DELETE /api/admin/kyc-documents/:id ──────────────────────────────────

    /**
     * Soft-delete a document.
     *
     * For hard delete (permanent) an X-Superadmin-Otp header is required.
     * Without the OTP header, this performs a soft delete only.
     */
    public function destroy(int $id): never
    {
        $doc = $this->docs->find($id);
        if ($doc === null || !(bool) $doc['is_active']) {
            $this->error('Document not found or already deleted.', 404);
        }

        $actingUser = $this->authUser();
        $userId     = (int) ($actingUser['id'] ?? 0);
        $actorName  = (string) ($actingUser['name'] ?? '');

        $otp = $this->readSuperadminOtpFromRequest();
        $hardDelete = $otp !== '' && $this->verifySuperadminOtp($otp);

        $this->docs->softDelete($id, $userId);

        $action = $hardDelete ? 'hard_deleted' : 'soft_deleted';

        if ($hardDelete) {
            // Remove the physical file
            $root    = $this->docuBankRoot();
            $absPath = $root . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, (string) $doc['file_path']);
            if (is_file($absPath)) {
                @unlink($absPath);
            }
        }

        $this->docs->logAudit([
            'document_id'   => $id,
            'action'        => $action,
            'actor_user_id' => $userId,
            'actor_name'    => $actorName,
            'ip_address'    => $_SERVER['REMOTE_ADDR'] ?? null,
            'notes'         => $hardDelete ? 'File permanently deleted.' : 'Soft-deleted (file retained).',
        ]);

        $this->success(null, $hardDelete ? 'Document permanently deleted.' : 'Document deleted.');
    }

    // ── GET /api/admin/kyc-documents/:id/audit ───────────────────────────────

    /**
     * Return the full audit trail for a document.
     */
    public function auditLog(int $id): never
    {
        $doc = $this->docs->find($id);
        if ($doc === null) {
            $this->error('Document not found.', 404);
        }

        $log = $this->docs->auditFor($id);
        $this->success($log, 'Audit log retrieved');
    }

    // ── DELETE /api/admin/kyc-documents/:id/audit ─────────────────────────────

    /**
     * Permanently delete the entire audit log for a document.
     * Restricted to super admin only (enforced by both the role middleware on
     * the route and an explicit email check here as a second layer of defence).
     */
    public function clearAuditLog(int $id): never
    {
        $actingUser = $this->authUser();
        if (strtolower((string) ($actingUser['email'] ?? '')) !== strtolower(AuthConfig::SUPER_ADMIN_EMAIL)) {
            $this->error('Only the super admin can delete audit logs.', 403);
        }

        $doc = $this->docs->find($id);
        if ($doc === null) {
            $this->error('Document not found.', 404);
        }

        $deleted = $this->docs->deleteAuditLog($id);
        $this->success(['deleted_entries' => $deleted], 'Audit log cleared.');
    }

    // ── POST /api/admin/kyc-documents/:id/new-version ────────────────────────

    /**
     * Upload a new version of an existing document (same entity/category/label group).
     *
     * Accepts a single file via files[].
     */
    public function newVersion(int $id): never
    {
        $existingDoc = $this->docs->find($id);
        if ($existingDoc === null || !(bool) $existingDoc['is_active']) {
            $this->error('Original document not found.', 404);
        }

        // Temporarily set POST fields from the existing document
        $_POST['entity_type']  = $existingDoc['entity_type'];
        $_POST['entity_id']    = (string) $existingDoc['entity_id'];
        $_POST['doc_category'] = $existingDoc['doc_category'];
        $_POST['doc_label']    = $existingDoc['doc_label'];
        $_POST['notes']        = trim((string) ($_POST['notes'] ?? ''));

        // Reuse store() logic
        $this->store();
    }

    // ── POST /api/admin/kyc-documents/request-uncompressed-otp ──────────────

    /**
     * Send a super-admin OTP so the user can upload a file without compression.
     */
    public function requestUncompressedOtp(): never
    {
        $super = $this->users->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
        if ($super === null || !$super['is_active']) {
            $this->error('Super admin account not provisioned.', 500);
        }

        $superId = (int) $super['id'];
        $email   = trim((string) ($super['email'] ?? ''));
        if ($email === '') {
            $this->error('Super admin has no email configured.', 500);
        }

        $otp         = OtpService::generate($superId);
        $actingUser  = $this->authUser();
        $requesterName = (string) ($actingUser['name'] ?? 'A staff member');

        try {
            $htmlBody = BrevoMailer::renderTemplate('document-uncompressed-otp', [
                'userName'      => (string) ($super['name'] ?? $email),
                'otpCode'       => $otp,
                'expiryMinutes' => (string) OtpService::expiryMinutes(),
                'requesterName' => $requesterName,
            ]);
            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $email,
                    (string) ($super['name'] ?? $email),
                    'Document Upload OTP (uncompressed) — CA Rahul Gupta',
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[KycDocumentController] Uncompressed OTP email failed: ' . $e->getMessage());
        }

        $this->success([
            'otp_sent'     => true,
            'masked_email' => $this->maskEmail($email),
        ], 'OTP sent to super-admin email.');
    }

    // ── POST /api/admin/kyc-documents/request-delete-otp ────────────────────

    /**
     * Send a super-admin OTP for hard-deleting a document.
     */
    public function requestDeleteOtp(): never
    {
        $super = $this->users->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
        if ($super === null || !$super['is_active']) {
            $this->error('Super admin account not provisioned.', 500);
        }

        $superId = (int) $super['id'];
        $email   = trim((string) ($super['email'] ?? ''));
        if ($email === '') {
            $this->error('Super admin has no email configured.', 500);
        }

        $actingUser   = $this->authUser();
        $requesterName = (string) ($actingUser['name'] ?? 'A staff member');
        $otp           = OtpService::generate($superId);

        try {
            $htmlBody = BrevoMailer::renderTemplate('document-delete-otp', [
                'userName'      => (string) ($super['name'] ?? $email),
                'otpCode'       => $otp,
                'expiryMinutes' => (string) OtpService::expiryMinutes(),
                'requesterName' => $requesterName,
            ]);
            if ($htmlBody !== '') {
                BrevoMailer::send(
                    $email,
                    (string) ($super['name'] ?? $email),
                    'Document Delete OTP — CA Rahul Gupta',
                    $htmlBody
                );
            }
        } catch (\Throwable $e) {
            error_log('[KycDocumentController] Delete OTP email failed: ' . $e->getMessage());
        }

        $this->success([
            'otp_sent'     => true,
            'masked_email' => $this->maskEmail($email),
        ], 'OTP sent to super-admin email.');
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Return the docu_bank root path (absolute, no trailing separator).
     */
    private function docuBankRoot(): string
    {
        $configured = (string) (getenv('DOCU_BANK_PATH') ?: '');
        if ($configured !== '') {
            return rtrim($configured, '/\\');
        }

        // Fallback: four levels up from this file (Admin → Controllers → app → server-php → repo root).
        // On shared hosting this typically resolves inside public_html, which is web-accessible.
        // Always set DOCU_BANK_PATH in production to a path outside public_html.
        $default = dirname(__DIR__, 4) . DIRECTORY_SEPARATOR . 'docu_bank';

        if (str_contains($default, 'public_html')) {
            error_log(
                '[KYC] WARNING: DOCU_BANK_PATH is not set. Document storage falls back to ' . $default
                . ' which is inside public_html and web-accessible. '
                . 'Set DOCU_BANK_PATH to a path outside public_html in your .env file.'
            );
        }

        return $default;
    }

    /**
     * Detect the real MIME type of an uploaded file using finfo.
     *
     * finfo reads the actual file bytes (magic-number detection) and is the
     * primary source.  When finfo is unavailable OR returns the generic
     * 'application/octet-stream' fallback (which some servers produce for
     * valid PDFs / images depending on the installed magic database), we
     * re-try using the original filename's extension.
     *
     * $origName must be the user-supplied basename (e.g. "aadhaar.pdf").
     * $path is the PHP temporary file path, which has no extension and must
     * never be used for extension-based detection.
     */
    private function detectMime(string $path, string $origName = ''): string
    {
        $extMap = [
            'jpg'  => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png'  => 'image/png',
            'gif'  => 'image/gif',
            'webp' => 'image/webp',
            'pdf'  => 'application/pdf',
        ];

        if (function_exists('finfo_open')) {
            $fi   = finfo_open(FILEINFO_MIME_TYPE);
            $mime = $fi ? (string) finfo_file($fi, $path) : '';
            if ($fi) {
                finfo_close($fi);
            }
            // Accept finfo result only when it is a concrete type (not the
            // generic octet-stream fallback that finfo emits when it cannot
            // identify the file — typically on servers with an outdated or
            // minimal magic database).
            if ($mime !== '' && $mime !== 'application/octet-stream') {
                return $mime;
            }
        }

        // Extension-based fallback — use the ORIGINAL filename, never the
        // temp path (which has no extension).
        $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
        return $extMap[$ext] ?? 'application/octet-stream';
    }

    /**
     * Compress an image using PHP GD and write it to $destPath.
     *
     * Returns true on success, false when GD is not available.
     */
    private function compressImage(string $srcPath, string $destPath, string $mime): bool
    {
        if (!extension_loaded('gd')) {
            return false;
        }

        $img = match ($mime) {
            'image/jpeg', 'image/jpg' => @imagecreatefromjpeg($srcPath),
            'image/png'               => @imagecreatefrompng($srcPath),
            'image/gif'               => @imagecreatefromgif($srcPath),
            'image/webp'              => @imagecreatefromwebp($srcPath),
            default                   => false,
        };

        if ($img === false) {
            return false;
        }

        // Resize if larger than MAX_IMAGE_DIMENSION
        $origW = imagesx($img);
        $origH = imagesy($img);
        $maxD  = self::MAX_IMAGE_DIMENSION;

        if ($origW > $maxD || $origH > $maxD) {
            if ($origW >= $origH) {
                $newW = $maxD;
                $newH = (int) round($origH * $maxD / $origW);
            } else {
                $newH = $maxD;
                $newW = (int) round($origW * $maxD / $origH);
            }
            $resized = imagecreatetruecolor($newW, $newH);
            if ($resized === false) {
                imagedestroy($img);
                return false;
            }
            // Preserve alpha for PNG
            if ($mime === 'image/png') {
                imagealphablending($resized, false);
                imagesavealpha($resized, true);
            }
            imagecopyresampled($resized, $img, 0, 0, 0, 0, $newW, $newH, $origW, $origH);
            imagedestroy($img);
            $img = $resized;
        }

        // Save
        $ok = match ($mime) {
            'image/jpeg', 'image/jpg' => imagejpeg($img, $destPath, self::JPEG_QUALITY),
            'image/png'               => imagepng($img, $destPath, 7),
            'image/gif'               => imagegif($img, $destPath),
            'image/webp'              => imagewebp($img, $destPath, self::JPEG_QUALITY),
            default                   => false,
        };

        imagedestroy($img);
        return $ok !== false;
    }

    /**
     * Normalise PHP's multi-file $_FILES structure into a flat list.
     *
     * When multiple files share the same input name (files[]), PHP gives arrays
     * for each sub-key.  This converts that to an indexed array of single-file arrays.
     *
     * @param array<string, mixed> $filesField  e.g. $_FILES['files']
     * @return array<int, array{name: string, type: string, tmp_name: string, error: int, size: int}>
     */
    private function normaliseFiles(array $filesField): array
    {
        // Single file (not an array of values)
        if (!is_array($filesField['name'])) {
            return [
                [
                    'name'     => $filesField['name'],
                    'type'     => $filesField['type'],
                    'tmp_name' => $filesField['tmp_name'],
                    'error'    => $filesField['error'],
                    'size'     => $filesField['size'],
                ],
            ];
        }

        $list  = [];
        $count = count($filesField['name']);
        for ($i = 0; $i < $count; $i++) {
            if ($filesField['error'][$i] === UPLOAD_ERR_NO_FILE) {
                continue;
            }
            $list[] = [
                'name'     => $filesField['name'][$i],
                'type'     => $filesField['type'][$i],
                'tmp_name' => $filesField['tmp_name'][$i],
                'error'    => $filesField['error'][$i],
                'size'     => $filesField['size'][$i],
            ];
        }
        return $list;
    }

    private function maskEmail(string $email): string
    {
        $parts = explode('@', $email, 2);
        if (count($parts) !== 2) {
            return '***@***.***';
        }
        $local  = $parts[0];
        $domain = $parts[1];
        $len    = strlen($local);
        $masked = $len <= 2
            ? ($local[0] . str_repeat('*', max(1, $len - 1)))
            : ($local[0] . str_repeat('*', $len - 2) . $local[$len - 1]);
        return $masked . '@' . $domain;
    }
}
