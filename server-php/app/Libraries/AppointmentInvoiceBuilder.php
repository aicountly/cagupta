<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\ClientModel;
use App\Models\OrganizationModel;
use App\Models\TxnModel;

/**
 * Builds and posts a ledger invoice txn for a calendar appointment (no service_id).
 */
final class AppointmentInvoiceBuilder
{
    /**
     * @param array<string, mixed> $appointment Row from calendar_events with billing snapshot fields
     * @return int New txn id
     */
    public static function createInvoiceForAppointment(array $appointment, ?int $createdBy): int
    {
        $feeSubtotal = (float)($appointment['fee_subtotal'] ?? 0);
        if ($feeSubtotal <= 0) {
            throw new \InvalidArgumentException('Appointment fee_subtotal must be greater than zero to invoice.');
        }

        $cid = (int)($appointment['client_id'] ?? 0);
        $oid = (int)($appointment['billing_organization_id'] ?? 0);
        if ($cid <= 0 && $oid <= 0) {
            throw new \InvalidArgumentException('client_id or billing_organization_id is required for invoicing.');
        }
        if ($cid > 0 && $oid > 0) {
            throw new \InvalidArgumentException('Provide only one of client_id or billing_organization_id for invoicing.');
        }

        $recipientGstin = self::resolveRecipientGstin($cid, $oid);
        $snap           = self::normalizeSnapshot($appointment['billing_profile_snapshot'] ?? null);

        $desc = trim((string)($appointment['invoice_line_description'] ?? ''));
        if ($desc === '') {
            $desc = 'Professional fees — Appointment #' . (int)($appointment['id'] ?? 0);
        }
        $lineKind = trim((string)($appointment['invoice_line_kind'] ?? 'professional_fee'));
        if (!in_array($lineKind, ['professional_fee', 'cost_recovery'], true)) {
            $lineKind = 'professional_fee';
        }

        $lineItems = [
            [
                'description' => $desc,
                'amount'      => round($feeSubtotal, 2),
                'line_kind'   => $lineKind,
            ],
        ];

        $body = [
            'txn_type'                   => 'invoice',
            'txn_date'                   => $appointment['event_date'] ?? date('Y-m-d'),
            'due_date'                   => $appointment['event_date'] ?? null,
            'billing_profile_code'       => $appointment['billing_profile_code'] ?? null,
            'line_items'                 => $lineItems,
            'billing_gst_registered'     => (bool)($snap['gstRegistered'] ?? false),
            'billing_supplier_state_code'=> $snap['gstRegistered'] ? ($snap['stateCode'] ?? null) : null,
            'billing_supplier_gstin'     => $snap['gstRegistered'] ? ($snap['gstin'] ?? null) : null,
            'default_gst_rate_percent'   => (float)($snap['defaultGstRate'] ?? 18),
            'notes'                      => 'Appointment #' . (int)($appointment['id'] ?? 0),
            'invoice_status'             => 'sent',
            'appointment_id'           => (int)($appointment['id'] ?? 0),
            'created_by'                 => $createdBy,
        ];
        if ($cid > 0) {
            $body['client_id'] = $cid;
        } else {
            $body['organization_id'] = $oid;
        }

        $prepared = GstInvoiceTax::prepareInvoice($body, $recipientGstin);
        $merged   = array_merge($body, $prepared);
        $merged['line_items'] = self::mergeLineKindsPreserved($lineItems, $merged['line_items'] ?? []);

        $txn = new TxnModel();
        $id  = $txn->createInvoice($merged);
        (new CommissionSyncService())->syncInvoiceSafe($id);

        return $id;
    }

    private static function resolveRecipientGstin(int $clientId, int $orgId): ?string
    {
        if ($clientId > 0) {
            $c = (new ClientModel())->find($clientId);

            return $c ? trim((string)($c['gstin'] ?? '')) : null;
        }
        if ($orgId > 0) {
            $o = (new OrganizationModel())->find($orgId);

            return $o ? trim((string)($o['gstin'] ?? '')) : null;
        }

        return null;
    }

    /**
     * @param mixed $raw JSON string or array from DB
     * @return array<string, mixed>
     */
    /**
     * GstInvoiceTax strips line_kind; restore from originals for commission rules.
     *
     * @param array<int, array<string, mixed>> $original
     * @param array<int, array<string, mixed>> $normalized
     * @return array<int, array<string, mixed>>
     */
    private static function mergeLineKindsPreserved(array $original, array $normalized): array
    {
        $out = [];
        foreach ($normalized as $i => $ln) {
            $o = $original[$i] ?? [];
            if (!empty($o['line_kind'])) {
                $ln['line_kind'] = $o['line_kind'];
            }
            if (!empty($o['manpower_included'])) {
                $ln['manpower_included']      = true;
                $ln['manpower_cost_amount']   = (float)($o['manpower_cost_amount'] ?? 0);
            }
            $out[] = $ln;
        }

        return $out;
    }

    private static function normalizeSnapshot(mixed $raw): array
    {
        if ($raw === null || $raw === '') {
            return ['gstRegistered' => false, 'gstin' => '', 'stateCode' => '', 'defaultGstRate' => 18];
        }
        if (is_string($raw)) {
            try {
                $raw = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                return ['gstRegistered' => false, 'gstin' => '', 'stateCode' => '', 'defaultGstRate' => 18];
            }
        }
        if (!is_array($raw)) {
            return ['gstRegistered' => false, 'gstin' => '', 'stateCode' => '', 'defaultGstRate' => 18];
        }

        return [
            'gstRegistered' => !empty($raw['gstRegistered']),
            'gstin'         => trim((string)($raw['gstin'] ?? '')),
            'stateCode'     => trim((string)($raw['stateCode'] ?? '')),
            'defaultGstRate'=> (float)($raw['defaultGstRate'] ?? 18),
        ];
    }
}
