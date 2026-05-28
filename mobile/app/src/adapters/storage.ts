import * as SecureStore from 'expo-secure-store';
import type { SessionStorageAdapter } from '@cagupta/shared-services';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export const secureStorageAdapter: SessionStorageAdapter = {
  async getToken() {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async setToken(token: string) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async removeToken() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
  async getUser() {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  async setUser(user: unknown) {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },
  async removeUser() {
    await SecureStore.deleteItemAsync(USER_KEY);
  },
};

export function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8080/api';
}

export function isMockMode(): boolean {
  // Mock auth only in dev builds; production must always use a real API URL.
  return __DEV__ && !process.env.EXPO_PUBLIC_API_BASE_URL;
}
