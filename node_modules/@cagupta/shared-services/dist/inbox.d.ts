import type { ApiClient } from './createApiClient.js';
export interface SupportTicketRow {
    id: number | string;
    publicId: string;
    subject: string;
    status: string;
    clientName: string;
    createdAt: string;
}
export declare function normalizeSupportTicket(row: Record<string, unknown>): SupportTicketRow;
export declare function createInboxService(api: ApiClient): {
    getSupportTicketsWithMeta(params?: {
        page?: number;
        perPage?: number;
        status?: string;
    }): Promise<{
        tickets: SupportTicketRow[];
        total: number;
        lastPage: number;
    }>;
};
//# sourceMappingURL=inbox.d.ts.map