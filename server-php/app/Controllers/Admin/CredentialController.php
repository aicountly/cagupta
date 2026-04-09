<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\CredentialModel;

/**
 * CredentialController — CRUD for the `credentials_vault` table.
 *
 * All endpoints require Bearer token + role: super_admin or admin.
 */
class CredentialController extends BaseController
{
    private CredentialModel $credentials;

    public function __construct()
    {
        $this->credentials = new CredentialModel();
    }

    // ── GET /api/admin/credentials ───────────────────────────────────────────

    /**
     * Return a paginated list of credentials.
     *
     * Query params: page, per_page, client_id
     */
    public function index(): never
    {
        $page     = max(1, (int)$this->query('page', 1));
        $perPage  = min(100, max(1, (int)$this->query('per_page', 20)));
        $clientId = (int)$this->query('client_id', 0);

        $result = $this->credentials->paginate($page, $perPage, $clientId);

        $this->success($result['credentials'], 'Credentials retrieved', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => (int)ceil($result['total'] / $perPage),
            ],
        ]);
    }

    // ── POST /api/admin/credentials ──────────────────────────────────────────

    /**
     * Create a new credential.
     *
     * Body: { client_id?, portal_name, username?, password_encrypted?, url?, notes? }
     */
    public function store(): never
    {
        $body       = $this->getJsonBody();
        $portalName = trim((string)($body['portal_name'] ?? ''));

        if ($portalName === '') {
            $this->error('portal_name is required.', 422);
        }

        $actingUser = $this->authUser();

        $newId = $this->credentials->create([
            'client_id'          => isset($body['client_id'])       ? (int)$body['client_id']       : null,
            'organization_id'    => isset($body['organization_id']) ? (int)$body['organization_id'] : null,
            'portal_name'        => $portalName,
            'username'           => $body['username']           ?? null,
            'password_encrypted' => $body['password_encrypted'] ?? $body['password'] ?? null,
            'url'                => $body['url']                ?? $body['portal_url'] ?? null,
            'notes'              => $body['notes']              ?? null,
            'created_by'         => $actingUser ? (int)$actingUser['id'] : null,
        ]);

        $credential = $this->credentials->find($newId);
        $this->success($credential, 'Credential created', 201);
    }

    // ── GET /api/admin/credentials/:id ───────────────────────────────────────

    /**
     * Return a single credential.
     */
    public function show(int $id): never
    {
        $credential = $this->credentials->find($id);
        if ($credential === null) {
            $this->error('Credential not found.', 404);
        }
        $this->success($credential);
    }

    // ── PUT /api/admin/credentials/:id ───────────────────────────────────────

    /**
     * Update a credential.
     */
    public function update(int $id): never
    {
        $credential = $this->credentials->find($id);
        if ($credential === null) {
            $this->error('Credential not found.', 404);
        }

        $body = $this->getJsonBody();
        $data = [];

        $allowed = ['client_id', 'organization_id', 'portal_name', 'username', 'password_encrypted', 'url', 'notes'];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        if (array_key_exists('password', $body) && !isset($data['password_encrypted'])) {
            $data['password_encrypted'] = $body['password'];
        }
        if (array_key_exists('portal_url', $body) && !isset($data['url'])) {
            $data['url'] = $body['portal_url'];
        }

        $this->credentials->update($id, $data);
        $updated = $this->credentials->find($id);
        $this->success($updated, 'Credential updated');
    }

    // ── DELETE /api/admin/credentials/:id ────────────────────────────────────

    /**
     * Delete a credential.
     */
    public function destroy(int $id): never
    {
        $credential = $this->credentials->find($id);
        if ($credential === null) {
            $this->error('Credential not found.', 404);
        }

        $this->credentials->delete($id);
        $this->success(null, 'Credential deleted');
    }
}
