import type { ApiClient } from './createApiClient.js';
import { normalizeLedgerClassForApi } from './ledgerUtils.js';

export function createAssociatePortalService(api: ApiClient) {
  return {
    async getDashboard() {
      const data = await api.get('/associate/dashboard');
      return data.data || {};
    },
    async getServices(params: { page?: number; perPage?: number } = {}) {
      const data = await api.get('/associate/services', {
        page: params.page,
        per_page: params.perPage,
      });
      return { rows: data.data || [], pagination: (data.meta as { pagination?: unknown })?.pagination || {} };
    },
    async getCommissions(params: { page?: number; perPage?: number; dateFrom?: string; dateTo?: string } = {}) {
      const data = await api.get('/associate/commissions', {
        page: params.page,
        per_page: params.perPage,
        date_from: params.dateFrom,
        date_to: params.dateTo,
      });
      return { rows: data.data || [], meta: data.meta || {} };
    },
    async getBankList() {
      const data = await api.get('/associate/bank');
      return data.data || [];
    },
    async postBank(body: unknown) {
      await api.post('/associate/bank', body);
    },
    async getPayoutRequests() {
      const data = await api.get('/associate/payout-requests');
      return data.data || [];
    },
    async postPayoutRequest(body: unknown) {
      const data = await api.post('/associate/payout-requests', body);
      return data.data || {};
    },
    async postSubAssociate(body: unknown) {
      await api.post('/associate/sub-associates', body);
    },
    async getRewards() {
      const data = await api.get('/associate/rewards');
      return data.data || {};
    },
    async postRedeem(body: unknown) {
      await api.post('/associate/rewards/redeem', body);
    },
  };
}

export function createPartnerPortalService(api: ApiClient) {
  return {
    async getDashboard() {
      const data = await api.get('/partner/dashboard');
      return data.data || {};
    },
    async getAssignments(params: { page?: number; perPage?: number; status?: string } = {}) {
      const data = await api.get('/partner/assignments', {
        page: params.page,
        per_page: params.perPage,
        status: params.status,
      });
      return { rows: data.data || [], pagination: (data.meta as { pagination?: unknown })?.pagination || {} };
    },
    async patchAssignment(id: number | string, body: unknown) {
      await api.patch(`/partner/assignments/${id}`, body);
    },
    async getBankList() {
      const data = await api.get('/partner/bank');
      return data.data || [];
    },
    async postBank(body: unknown) {
      await api.post('/partner/bank', body);
    },
    async getPayoutRequests() {
      const data = await api.get('/partner/payouts');
      return data.data || [];
    },
    async postPayoutRequest(body: unknown) {
      const data = await api.post('/partner/payouts', body);
      return data.data || {};
    },
    async getAccruals(params: { page?: number; perPage?: number } = {}) {
      const data = await api.get('/partner/accruals', { page: params.page, per_page: params.perPage });
      return data.data || [];
    },
    async getPayoutCycles(year?: number) {
      const y = year ?? new Date().getFullYear();
      const data = await api.get('/partner/payout-cycles', { year: y });
      return data.data || [];
    },
  };
}

export function createClientPortalService(api: ApiClient) {
  return {
    async getMe() {
      const data = await api.get('/client/me');
      return data.data || {};
    },
    async getServices(params: { group?: string; page?: number; perPage?: number; search?: string } = {}) {
      const data = await api.get('/client/services', {
        group: params.group ?? 'active',
        page: params.page ?? 1,
        per_page: params.perPage ?? 50,
        search: params.search,
      });
      return { rows: data.data || [], pagination: (data.meta as { pagination?: unknown })?.pagination || {} };
    },
    async getService(id: number | string) {
      const data = await api.get(`/client/services/${id}`);
      return data.data || null;
    },
    async getLedger(params: {
      organizationId?: number | string;
      ledgerClass?: string;
      ledgerView?: string;
    } = {}) {
      const view = ['fees', 'reimbursement', 'consolidated'].includes(params.ledgerView ?? '')
        ? params.ledgerView!
        : 'consolidated';
      const data = await api.get('/client/ledger', {
        organization_id: params.organizationId,
        ledger_class: normalizeLedgerClassForApi(params.ledgerClass),
        ledger_view: view,
      });
      return data.data || [];
    },
  };
}

export interface ClientChatMessage {
  id: number | string;
  body_text?: string;
  sender_kind?: string;
  sender_user_id?: number | null;
  sender_name?: string;
  created_at?: string;
}

export interface TeamChatConversation {
  id: number | string;
  type?: string;
  title?: string;
  display_title?: string;
  last_message_preview?: string;
  last_message_at?: string;
  unread_count?: number;
}

export interface TeamChatMessage {
  id: number | string;
  conversation_id?: number | string;
  sender_user_id?: number | null;
  sender_kind?: string;
  sender_name?: string;
  body_text?: string;
  created_at?: string;
}

export function createTeamChatService(api: ApiClient) {
  return {
    async fetchConversations() {
      const data = await api.get<TeamChatConversation[]>('/chat/conversations');
      return data.data || [];
    },
    async fetchConversation(id: number | string) {
      const data = await api.get<TeamChatConversation>(`/chat/conversations/${id}`);
      return data.data;
    },
    async fetchMessages(
      conversationId: number | string,
      { afterId = 0, beforeId = 0, limit = 50 }: { afterId?: number; beforeId?: number; limit?: number } = {},
    ) {
      const data = await api.get<TeamChatMessage[]>(`/chat/conversations/${conversationId}/messages`, {
        after_id: afterId > 0 ? afterId : undefined,
        before_id: beforeId > 0 ? beforeId : undefined,
        limit,
      });
      return { rows: data.data || [], hasMore: Boolean(data.has_more) };
    },
    async sendMessage(conversationId: number | string, bodyText: string) {
      const data = await api.post<TeamChatMessage>(
        `/chat/conversations/${conversationId}/messages`,
        { body_text: bodyText },
      );
      return data.data;
    },
    async markConversationRead(conversationId: number | string, messageId: number | string) {
      await api.post(`/chat/conversations/${conversationId}/read`, { message_id: messageId });
    },
    async fetchContacts() {
      const data = await api.get('/chat/contacts');
      return data.data || [];
    },
    async createConversation(payload: unknown) {
      const data = await api.post<TeamChatConversation>('/chat/conversations', payload);
      return data.data;
    },
    async leaveChannel(conversationId: number | string) {
      await api.post(`/chat/conversations/${conversationId}/leave`, {});
    },
  };
}

export function createClientChatService(api: ApiClient) {
  return {
    async fetchThread({ afterId = 0 }: { afterId?: number } = {}) {
      const json = await api.get<{ conversation?: unknown; messages?: ClientChatMessage[] }>(
        '/client/chat/thread',
        afterId > 0 ? { after_id: afterId } : undefined,
      );
      return {
        conversation: json.data?.conversation ?? null,
        messages: json.data?.messages ?? [],
        hasMore: Boolean(json.has_more),
      };
    },
    async sendMessage(bodyText: string) {
      const json = await api.post<{
        client_message?: ClientChatMessage;
        bot_message?: ClientChatMessage;
      }>('/client/chat/messages', { body_text: bodyText });
      return json.data ?? {};
    },
    async markRead(messageId: number | string) {
      await api.post('/client/chat/read', { message_id: messageId });
    },
  };
}

export function createDashboardService(api: ApiClient) {
  return {
    async getStats() {
      const data = await api.get('/admin/dashboard/stats');
      return data.data || {};
    },
    async getEngagements(params: { page?: number; perPage?: number; status?: string } = {}) {
      const data = await api.get('/admin/services', {
        page: params.page,
        per_page: params.perPage,
        status: params.status && params.status !== 'all' ? params.status : undefined,
      });
      return data.data || [];
    },
    async getInvoices(params: { page?: number; perPage?: number; status?: string } = {}) {
      const data = await api.get('/admin/invoices', {
        page: params.page,
        per_page: params.perPage,
        status: params.status && params.status !== 'all' ? params.status : undefined,
      });
      return data.data || [];
    },
    async getAppointments(params: { page?: number; perPage?: number } = {}) {
      const data = await api.get('/admin/appointments', {
        page: params.page,
        per_page: params.perPage,
      });
      return data.data || [];
    },
  };
}
