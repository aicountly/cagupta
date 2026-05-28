import type { ApiClient } from './createApiClient.js';
export declare function createAssociatePortalService(api: ApiClient): {
    getDashboard(): Promise<{}>;
    getServices(params?: {
        page?: number;
        perPage?: number;
    }): Promise<{
        rows: {};
        pagination: {};
    }>;
    getCommissions(params?: {
        page?: number;
        perPage?: number;
        dateFrom?: string;
        dateTo?: string;
    }): Promise<{
        rows: {};
        meta: Record<string, unknown>;
    }>;
    getBankList(): Promise<{}>;
    postBank(body: unknown): Promise<void>;
    getPayoutRequests(): Promise<{}>;
    postPayoutRequest(body: unknown): Promise<{}>;
    postSubAssociate(body: unknown): Promise<void>;
    getRewards(): Promise<{}>;
    postRedeem(body: unknown): Promise<void>;
};
export declare function createPartnerPortalService(api: ApiClient): {
    getDashboard(): Promise<{}>;
    getAssignments(params?: {
        page?: number;
        perPage?: number;
        status?: string;
    }): Promise<{
        rows: {};
        pagination: {};
    }>;
    patchAssignment(id: number | string, body: unknown): Promise<void>;
    getBankList(): Promise<{}>;
    postBank(body: unknown): Promise<void>;
    getPayoutRequests(): Promise<{}>;
    postPayoutRequest(body: unknown): Promise<{}>;
    getAccruals(params?: {
        page?: number;
        perPage?: number;
    }): Promise<{}>;
    getPayoutCycles(year?: number): Promise<{}>;
};
export declare function createClientPortalService(api: ApiClient): {
    getMe(): Promise<{}>;
    getServices(params?: {
        group?: string;
        page?: number;
        perPage?: number;
        search?: string;
    }): Promise<{
        rows: {};
        pagination: {};
    }>;
    getService(id: number | string): Promise<{} | null>;
    getLedger(params?: {
        organizationId?: number | string;
        ledgerClass?: string;
        ledgerView?: string;
    }): Promise<{}>;
};
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
export declare function createTeamChatService(api: ApiClient): {
    fetchConversations(): Promise<TeamChatConversation[]>;
    fetchConversation(id: number | string): Promise<TeamChatConversation | undefined>;
    fetchMessages(conversationId: number | string, { afterId, beforeId, limit }?: {
        afterId?: number;
        beforeId?: number;
        limit?: number;
    }): Promise<{
        rows: TeamChatMessage[];
        hasMore: boolean;
    }>;
    sendMessage(conversationId: number | string, bodyText: string): Promise<TeamChatMessage | undefined>;
    markConversationRead(conversationId: number | string, messageId: number | string): Promise<void>;
    fetchContacts(): Promise<{}>;
    createConversation(payload: unknown): Promise<TeamChatConversation | undefined>;
    leaveChannel(conversationId: number | string): Promise<void>;
};
export declare function createClientChatService(api: ApiClient): {
    fetchThread({ afterId }?: {
        afterId?: number;
    }): Promise<{
        conversation: {} | null;
        messages: ClientChatMessage[];
        hasMore: boolean;
    }>;
    sendMessage(bodyText: string): Promise<{
        client_message?: ClientChatMessage;
        bot_message?: ClientChatMessage;
    }>;
    markRead(messageId: number | string): Promise<void>;
};
export declare function createDashboardService(api: ApiClient): {
    getStats(): Promise<{}>;
    getEngagements(params?: {
        page?: number;
        perPage?: number;
        status?: string;
    }): Promise<{}>;
    getInvoices(params?: {
        page?: number;
        perPage?: number;
        status?: string;
    }): Promise<{}>;
    getAppointments(params?: {
        page?: number;
        perPage?: number;
    }): Promise<{}>;
};
//# sourceMappingURL=portalServices.d.ts.map