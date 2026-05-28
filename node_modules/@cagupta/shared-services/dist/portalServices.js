import { normalizeLedgerClassForApi } from './ledgerUtils.js';
export function createAssociatePortalService(api) {
    return {
        async getDashboard() {
            const data = await api.get('/associate/dashboard');
            return data.data || {};
        },
        async getServices(params = {}) {
            const data = await api.get('/associate/services', {
                page: params.page,
                per_page: params.perPage,
            });
            return { rows: data.data || [], pagination: data.meta?.pagination || {} };
        },
        async getCommissions(params = {}) {
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
        async postBank(body) {
            await api.post('/associate/bank', body);
        },
        async getPayoutRequests() {
            const data = await api.get('/associate/payout-requests');
            return data.data || [];
        },
        async postPayoutRequest(body) {
            const data = await api.post('/associate/payout-requests', body);
            return data.data || {};
        },
        async postSubAssociate(body) {
            await api.post('/associate/sub-associates', body);
        },
        async getRewards() {
            const data = await api.get('/associate/rewards');
            return data.data || {};
        },
        async postRedeem(body) {
            await api.post('/associate/rewards/redeem', body);
        },
    };
}
export function createPartnerPortalService(api) {
    return {
        async getDashboard() {
            const data = await api.get('/partner/dashboard');
            return data.data || {};
        },
        async getAssignments(params = {}) {
            const data = await api.get('/partner/assignments', {
                page: params.page,
                per_page: params.perPage,
                status: params.status,
            });
            return { rows: data.data || [], pagination: data.meta?.pagination || {} };
        },
        async patchAssignment(id, body) {
            await api.patch(`/partner/assignments/${id}`, body);
        },
        async getBankList() {
            const data = await api.get('/partner/bank');
            return data.data || [];
        },
        async postBank(body) {
            await api.post('/partner/bank', body);
        },
        async getPayoutRequests() {
            const data = await api.get('/partner/payouts');
            return data.data || [];
        },
        async postPayoutRequest(body) {
            const data = await api.post('/partner/payouts', body);
            return data.data || {};
        },
        async getAccruals(params = {}) {
            const data = await api.get('/partner/accruals', { page: params.page, per_page: params.perPage });
            return data.data || [];
        },
        async getPayoutCycles(year) {
            const y = year ?? new Date().getFullYear();
            const data = await api.get('/partner/payout-cycles', { year: y });
            return data.data || [];
        },
    };
}
export function createClientPortalService(api) {
    return {
        async getMe() {
            const data = await api.get('/client/me');
            return data.data || {};
        },
        async getServices(params = {}) {
            const data = await api.get('/client/services', {
                group: params.group ?? 'active',
                page: params.page ?? 1,
                per_page: params.perPage ?? 50,
                search: params.search,
            });
            return { rows: data.data || [], pagination: data.meta?.pagination || {} };
        },
        async getService(id) {
            const data = await api.get(`/client/services/${id}`);
            return data.data || null;
        },
        async getLedger(params = {}) {
            const view = ['fees', 'reimbursement', 'consolidated'].includes(params.ledgerView ?? '')
                ? params.ledgerView
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
export function createTeamChatService(api) {
    return {
        async fetchConversations() {
            const data = await api.get('/chat/conversations');
            return data.data || [];
        },
        async fetchConversation(id) {
            const data = await api.get(`/chat/conversations/${id}`);
            return data.data;
        },
        async fetchMessages(conversationId, { afterId = 0, beforeId = 0, limit = 50 } = {}) {
            const data = await api.get(`/chat/conversations/${conversationId}/messages`, {
                after_id: afterId > 0 ? afterId : undefined,
                before_id: beforeId > 0 ? beforeId : undefined,
                limit,
            });
            return { rows: data.data || [], hasMore: Boolean(data.has_more) };
        },
        async sendMessage(conversationId, bodyText) {
            const data = await api.post(`/chat/conversations/${conversationId}/messages`, { body_text: bodyText });
            return data.data;
        },
        async markConversationRead(conversationId, messageId) {
            await api.post(`/chat/conversations/${conversationId}/read`, { message_id: messageId });
        },
        async fetchContacts() {
            const data = await api.get('/chat/contacts');
            return data.data || [];
        },
        async createConversation(payload) {
            const data = await api.post('/chat/conversations', payload);
            return data.data;
        },
        async leaveChannel(conversationId) {
            await api.post(`/chat/conversations/${conversationId}/leave`, {});
        },
    };
}
export function createClientChatService(api) {
    return {
        async fetchThread({ afterId = 0 } = {}) {
            const json = await api.get('/client/chat/thread', afterId > 0 ? { after_id: afterId } : undefined);
            return {
                conversation: json.data?.conversation ?? null,
                messages: json.data?.messages ?? [],
                hasMore: Boolean(json.has_more),
            };
        },
        async sendMessage(bodyText) {
            const json = await api.post('/client/chat/messages', { body_text: bodyText });
            return json.data ?? {};
        },
        async markRead(messageId) {
            await api.post('/client/chat/read', { message_id: messageId });
        },
    };
}
export function createDashboardService(api) {
    return {
        async getStats() {
            const data = await api.get('/admin/dashboard/stats');
            return data.data || {};
        },
        async getEngagements(params = {}) {
            const data = await api.get('/admin/services', {
                page: params.page,
                per_page: params.perPage,
                status: params.status && params.status !== 'all' ? params.status : undefined,
            });
            return data.data || [];
        },
        async getInvoices(params = {}) {
            const data = await api.get('/admin/invoices', {
                page: params.page,
                per_page: params.perPage,
                status: params.status && params.status !== 'all' ? params.status : undefined,
            });
            return data.data || [];
        },
        async getAppointments(params = {}) {
            const data = await api.get('/admin/appointments', {
                page: params.page,
                per_page: params.perPage,
            });
            return data.data || [];
        },
    };
}
