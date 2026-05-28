import type { ApiClient } from './createApiClient.js';

export interface EngagementRow {
  id: number | string;
  clientName: string;
  type: string;
  categoryName: string;
  engagementTypeName: string;
  assignedTo: string;
  dueDate: string;
  status: string;
  feeAgreed: number | null;
  relevantPeriodLabel: string;
  financialYear: string;
}


function parseAssigneeUserIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  raw.forEach((x) => {
    const n = Number(x);
    if (Number.isInteger(n) && n > 0) out.push(n);
  });
  return [...new Set(out)];
}

export function normalizeEngagement(s: Record<string, unknown>): EngagementRow {
  const assigneeUserIds = parseAssigneeUserIds(s.assignee_user_ids);
  const nameLine = (s.assignee_names && String(s.assignee_names).trim() !== '')
    ? String(s.assignee_names)
    : String(s.assigned_to_name || s.assigned_to || '');

  const fees = s.fees != null ? Number(s.fees) : (s.fee_agreed != null ? Number(s.fee_agreed) : null);

  return {
    id: s.id as number | string,
    clientName: String(s.client_name || s.organization_name || 'Unknown'),
    type: String(s.service_type || s.type || ''),
    categoryName: String(s.category_name || ''),
    engagementTypeName: String(s.engagement_type_name || ''),
    assignedTo: nameLine || (assigneeUserIds.length > 0 ? `User #${assigneeUserIds[0]}` : ''),
    dueDate: String(s.due_date || ''),
    status: String(s.status || 'not_started'),
    feeAgreed: fees != null && Number.isFinite(fees) ? fees : null,
    relevantPeriodLabel: String(s.relevant_period_label || ''),
    financialYear: String(s.financial_year || ''),
  };
}

export function createEngagementsService(api: ApiClient) {
  return {
    async getEngagementsWithMeta(params: {
      page?: number;
      perPage?: number;
      search?: string;
      status?: string;
      userId?: number | string | 'all' | null;
    } = {}) {
      const userId = params.userId;
      const data = await api.get<Record<string, unknown>[]>('/admin/services', {
        page: params.page,
        per_page: params.perPage,
        search: params.search || undefined,
        status: params.status && params.status !== 'all' ? params.status : undefined,
        user_id:
          userId === 'all'
            ? 'all'
            : userId != null && userId !== '' && Number(userId) > 0
              ? Number(userId)
              : undefined,
      });
      const pagination = (data.meta as { pagination?: { total?: number; last_page?: number } })?.pagination || {};
      const rows = Array.isArray(data.data) ? data.data : [];
      return {
        engagements: rows.map((r) => normalizeEngagement(r)),
        total: pagination.total ?? rows.length,
        lastPage: pagination.last_page ?? 1,
      };
    },

    async getEngagement(id: number | string): Promise<EngagementRow | null> {
      const data = await api.get<Record<string, unknown>>(`/admin/services/${id}`);
      if (!data.data || typeof data.data !== 'object') return null;
      return normalizeEngagement(data.data as Record<string, unknown>);
    },
  };
}
