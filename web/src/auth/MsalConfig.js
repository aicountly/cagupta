import { PublicClientApplication } from '@azure/msal-browser';

export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID || 'dev-placeholder',
    authority: import.meta.env.VITE_MSAL_TENANT_ID
      ? `https://login.microsoftonline.com/${import.meta.env.VITE_MSAL_TENANT_ID}`
      : 'https://login.microsoftonline.com/common',
    redirectUri: `${window.location.origin}/auth-redirect.html`,
  },
  cache: { cacheLocation: 'sessionStorage' },
};

export const msalInstance = new PublicClientApplication(msalConfig);