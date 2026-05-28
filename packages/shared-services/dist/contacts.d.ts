import type { ApiClient } from './createApiClient.js';
export interface ContactRow {
    id: number | string;
    clientCode: string;
    displayName: string;
    mobile: string;
    email: string;
    pan: string;
    city: string;
    organisation: string;
    linkedOrgsCount: number;
    groupName: string;
    assignedManager: string;
    status: string;
    reference: string;
}
export declare function normalizeContact(c: Record<string, unknown>): ContactRow;
export declare function createContactsService(api: ApiClient): {
    getContactsWithMeta(params?: {
        page?: number;
        perPage?: number;
        search?: string;
        status?: string;
    }): Promise<{
        contacts: ContactRow[];
        total: number;
        lastPage: number;
    }>;
};
//# sourceMappingURL=contacts.d.ts.map