import {
  createApiClient,
  createAuthService,
  createAssociatePortalService,
  createPartnerPortalService,
  createClientPortalService,
  createClientChatService,
  createTeamChatService,
  createDashboardService,
  createContactsService,
  createEngagementsService,
  createInboxService,
} from '@cagupta/shared-services';
import { getApiBaseUrl, isMockMode, secureStorageAdapter } from './storage';
import { invokeUnauthorizedHandler } from './unauthorizedHandler';

const baseUrl = getApiBaseUrl();

export const apiClient = createApiClient({
  baseUrl,
  getToken: () => secureStorageAdapter.getToken(),
  onUnauthorized: invokeUnauthorizedHandler,
});

export const authService = createAuthService({
  api: apiClient,
  storage: secureStorageAdapter,
  baseUrl,
  mockMode: isMockMode(),
  getInitials: (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  },
});

export const associatePortal = createAssociatePortalService(apiClient);
export const partnerPortal = createPartnerPortalService(apiClient);
export const clientPortal = createClientPortalService(apiClient);
export const clientChat = createClientChatService(apiClient);
export const teamChat = createTeamChatService(apiClient);
export const dashboardService = createDashboardService(apiClient);
export const contactsService = createContactsService(apiClient);
export const engagementsService = createEngagementsService(apiClient);
export const inboxService = createInboxService(apiClient);
