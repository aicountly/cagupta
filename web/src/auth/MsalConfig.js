import { PublicClientApplication } from '@azure/msal-browser';

// Always resolve to the canonical (non-www) origin for MSAL redirect
const canonicalOrigin = window.location.origin.replace('://www.', '://');

export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID || 'dev-placeholder',
    authority: import.meta.env.VITE_MSAL_TENANT_ID
      ? `https://login.microsoftonline.com/${import.meta.env.VITE_MSAL_TENANT_ID}`
      : 'https://login.microsoftonline.com/common',
    redirectUri: canonicalOrigin,
  },
  cache: { cacheLocation: 'sessionStorage' },
};

export const msalInstance = new PublicClientApplication(msalConfig);