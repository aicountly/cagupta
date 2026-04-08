<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\LeadModel;

/**
 * LeadController — CRUD for the `leads` table.
 *
 * All endpoints require Bearer token + role: super_admin or admin.
 */
class LeadController extends BaseController
{
    private LeadModel $leads;

    public function __construct()
    {
        $this->leads = new LeadModel();
    }

    // ── GET /api/admin/leads ─────────────────────────────────────────────────

    /**
     * Return a paginated list of leads.
     *
     * Query params: page, per_page, search, status
     */
    public function index(): never
    {
        $page    = max(1, (int)$this->query('page', 1));
        $perPage = min(100, max(1, (int)$this->query('per_page', 20)));
        $search  = trim((string)$this->query('search', ''));
        $status  = trim((string)$this->query('status', ''));

        $result = $this->leads->paginate($page, $perPage, $search, $status);

        $this->success($result['leads'], 'Leads retrieved', 200, [
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $result['total'],
                'last_page' => (int)ceil($result['total'] / $perPage),
            ],
        ]);
    }

    // ── POST /api/admin/leads ────────────────────────────────────────────────

    /**
     * Create a new lead.
     *
     * Body: { name, company?, email?, phone?, source?, estimated_value?,
     *         status?, probability?, assigned_to?, notes?, follow_up_date? }
     */
    public function store(): never
    {
        $body = $this->getJsonBody();
        $name = trim((string)($body['name'] ?? ''));

        if ($name === '') {
            $this->error('name (contact name) is required.', 422);
        }

        $actingUser = $this->authUser();

        $newId = $this->leads->create([
            'name'             => $name,
            'company'          => $body['company']          ?? null,
            'email'            => $body['email']            ?? null,
            'phone'            => $body['phone']            ?? null,
            'source'           => $body['source']           ?? null,
            'service_interest' => $body['service_interest'] ?? null,
            'estimated_value'  => isset($body['estimated_value']) ? (float)$body['estimated_value'] : null,
            'status'           => $body['status']           ?? 'new',
            'probability'      => isset($body['probability']) ? (int)$body['probability'] : 50,
            'assigned_to'      => $body['assigned_to']      ?? null,
            'notes'            => $body['notes']            ?? null,
            'follow_up_date'   => $body['follow_up_date']   ?? null,
            'contact_id'       => $body['contact_id']       ?? null,
            'organization_id'  => $body['organization_id']  ?? null,
            'created_by'       => $actingUser ? (int)$actingUser['id'] : null,
        ]);

        $lead = $this->leads->find($newId);
        $this->success($lead, 'Lead created', 201);
    }

    // ── GET /api/admin/leads/:id ─────────────────────────────────────────────

    /**
     * Return a single lead.
     */
    public function show(int $id): never
    {
        $lead = $this->leads->find($id);
        if ($lead === null) {
            $this->error('Lead not found.', 404);
        }
        $this->success($lead);
    }

    // ── PUT /api/admin/leads/:id ─────────────────────────────────────────────

    /**
     * Update a lead.
     */
    public function update(int $id): never
    {
        $lead = $this->leads->find($id);
        if ($lead === null) {
            $this->error('Lead not found.', 404);
        }

        $body = $this->getJsonBody();
        $data = [];

        $allowed = [
            'name', 'company', 'email', 'phone', 'source',
            'service_interest', 'estimated_value', 'status',
            'probability', 'assigned_to', 'notes', 'follow_up_date',
            'contact_id', 'organization_id',
        ];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }

        $this->leads->update($id, $data);
        $updated = $this->leads->find($id);
        $this->success($updated, 'Lead updated');
    }

    // ── DELETE /api/admin/leads/:id ──────────────────────────────────────────

    /**
     * Delete a lead.
     */
    public function destroy(int $id): never
    {
        $lead = $this->leads->find($id);
        if ($lead === null) {
            $this->error('Lead not found.', 404);
        }

        $this->leads->delete($id);
        $this->success(null, 'Lead deleted');
    }
}
