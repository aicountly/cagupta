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
export declare function normalizeEngagement(s: Record<string, unknown>): EngagementRow;
export declare function createEngagementsService(api: ApiClient): {
    getEngagementsWithMeta(params?: {
        page?: number;
        perPage?: number;
        search?: string;
        status?: string;
        userId?: number | string | "all" | null;
    }): Promise<{
        engagements: EngagementRow[];
        total: number;
        lastPage: number;
    }>;
    getEngagement(id: number | string): Promise<EngagementRow | null>;
};
//# sourceMappingURL=engagements.d.ts.map