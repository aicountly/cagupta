import { createApiClient } from '@cagupta/shared-services';
import { API_BASE_URL } from '../constants/config';
import { invokeUnauthorizedHandler } from './unauthorizedHandler';

export const apiClient = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => localStorage.getItem('auth_token'),
  onUnauthorized: invokeUnauthorizedHandler,
});
