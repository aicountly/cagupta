export function normalizeSupportTicket(row) {
    return {
        id: row.id,
        publicId: String(row.public_id || row.id || ''),
        subject: String(row.subject || '(No subject)'),
        status: String(row.status || 'open'),
        clientName: String(row.client_name || ''),
        createdAt: String(row.created_at || ''),
    };
}
export function createInboxService(api) {
    return {
        async getSupportTicketsWithMeta(params = {}) {
            const data = await api.get('/admin/support-tickets', {
                page: params.page,
                per_page: params.perPage,
                status: params.status && params.status !== 'all' ? params.status : undefined,
            });
            const pagination = data.meta?.pagination || {};
            const rows = Array.isArray(data.data) ? data.data : [];
            return {
                tickets: rows.map((r) => normalizeSupportTicket(r)),
                total: pagination.total ?? rows.length,
                lastPage: pagination.last_page ?? 1,
            };
        },
    };
}
