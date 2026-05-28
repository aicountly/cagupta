import { PORTAL_META, type PortalKey } from '@cagupta/shared-constants';

export function portalAccent(portal: PortalKey): string {
  return PORTAL_META[portal].accent;
}

export function portalTint(portal: PortalKey): string {
  return PORTAL_META[portal].tint;
}

export const theme = {
  bg: '#f8fafc',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  white: '#ffffff',
  danger: '#dc2626',
};
