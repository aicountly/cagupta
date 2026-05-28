import type { ApiClient } from './createApiClient.js';

export interface SupportTicketRow {
  id: number | string;
  publicId: string;
  subject: string;
  status: string;
  clientName: string;
  createdAt: string;
}

export function normalizeSupportTicket(row: Record<string, unknown>): SupportTicketRow {
  return {
    id: row.id as number | string,
    publicId: String(row.public_id || row.id || ''),
    subject: String(row.subject || '(No subject)'),
    status: String(row.status || 'open'),
    clientName: String(row.client_name || ''),
    createdAt: String(row.created_at || ''),
  };
}

export function createInboxService(api: ApiClient) {
  return {
    async getSupportTicketsWithMeta(params: {
      page?: number;
      perPage?: number;
      status?: string;
    } = {}) {
      const data = await api.get<Record<string, unknown>[]>('/admin/support-tickets', {
        page: params.page,
        per_page: params.perPage,
        status: params.status && params.status !== 'all' ? params.status : undefined,
      });
      const pagination = (data.meta as { pagination?: { total?: number; last_page?: number } })?.pagination || {};
      const rows = Array.isArray(data.data) ? data.data : [];
      return {
        tickets: rows.map((r) => normalizeSupportTicket(r)),
        total: pagination.total ?? rows.length,
        lastPage: pagination.last_page ?? 1,
      };
    },
  };
}
