export const STAFF_NOTIFICATIONS_REFRESH_EVENT = 'cagupta:staff-notifications:refresh';
export const TEAM_CHAT_ACTIVE_CONTEXT_EVENT = 'cagupta:team-chat:active-context';

export function dispatchStaffNotificationsRefresh() {
  window.dispatchEvent(new CustomEvent(STAFF_NOTIFICATIONS_REFRESH_EVENT));
}

export function dispatchTeamChatActiveContext({ open, conversationId }) {
  window.dispatchEvent(new CustomEvent(TEAM_CHAT_ACTIVE_CONTEXT_EVENT, {
    detail: {
      open: Boolean(open),
      conversationId: Number(conversationId || 0),
    },
  }));
}
