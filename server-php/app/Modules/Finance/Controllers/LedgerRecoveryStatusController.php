<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\LedgerRecoveryStatusModel;
use App\Models\TxnModel;

/**
 * LedgerRecoveryStatusController — NPA / bad-debt classification endpoints.
 *
 * GET  /api/admin/ledger-recovery-status?entity_type=client&entity_id=1
 * POST /api/admin/ledger-recovery-status/mark-npa
 * POST /api/admin/ledger-recovery-status/mark-bad-debt
 */
class LedgerRecoveryStatusController extends BaseController
{
    private LedgerRecoveryStatusModel $model;
    private TxnModel $txn;

    public function __construct()
    {
        $this->model = new LedgerRecoveryStatusModel();
        $this->txn   = new TxnModel();
    }

    /** GET /api/admin/ledger-recovery-status */
    public function show(): never
    {
        $entityType = trim((string)$this->query('entity_type', ''));
        $entityId   = (int)$this->query('entity_id', 0);

        if (!in_array($entityType, ['client', 'organization'], true)) {
            $this->error('entity_type must be client or organization.', 422);
        }
        if ($entityId <= 0) {
            $this->error('entity_id is required.', 422);
        }

        $row = $this->model->getByEntity($entityType, $entityId);
        $this->success($this->model->formatForApi($row), 'Ledger recovery status');
    }

    /** POST /api/admin/ledger-recovery-status/mark-npa */
    public function markNpa(): never
    {
        $body       = $this->getJsonBody();
        $entityType = trim((string)($body['entity_type'] ?? ''));
        $entityId   = (int)($body['entity_id'] ?? 0);
        $reason     = trim((string)($body['reason'] ?? ''));

        $errors = [];
        if (!in_array($entityType, ['client', 'organization'], true)) {
            $errors['entity_type'][] = 'entity_type must be client or organization.';
        }
        if ($entityId <= 0) {
            $errors['entity_id'][] = 'entity_id is required.';
        }
        if ($reason === '') {
            $errors['reason'][] = 'reason is required.';
        }
        if (!empty($errors)) {
            $this->error('Validation failed.', 422, $errors);
        }

        $authUser = $this->authUser();
        if ($authUser === null) {
            $this->error('Unauthorized.', 401);
        }

        try {
            $balance = $this->txn->getEntityReceivableBalance($entityType, $entityId);
            $row     = $this->model->markNpa(
                $entityType,
                $entityId,
                $reason,
                (int)$authUser['id'],
                $balance
            );
            $this->success($row, 'Entity marked as NPA', 201);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }
    }

    /** POST /api/admin/ledger-recovery-status/mark-bad-debt */
    public function markBadDebt(): never
    {
        $body       = $this->getJsonBody();
        $entityType = trim((string)($body['entity_type'] ?? ''));
        $entityId   = (int)($body['entity_id'] ?? 0);
        $reason     = trim((string)($body['reason'] ?? ''));

        $errors = [];
        if (!in_array($entityType, ['client', 'organization'], true)) {
            $errors['entity_type'][] = 'entity_type must be client or organization.';
        }
        if ($entityId <= 0) {
            $errors['entity_id'][] = 'entity_id is required.';
        }
        if ($reason === '') {
            $errors['reason'][] = 'reason is required.';
        }
        if (!empty($errors)) {
            $this->error('Validation failed.', 422, $errors);
        }

        $authUser = $this->authUser();
        if ($authUser === null) {
            $this->error('Unauthorized.', 401);
        }

        try {
            $row = $this->model->markBadDebt(
                $entityType,
                $entityId,
                $reason,
                (int)$authUser['id']
            );
            $this->success($row, 'Entity marked as bad debt');
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage(), 422);
        }
    }
}
