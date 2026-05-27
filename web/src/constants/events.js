export const STAFF_NOTIFICATIONS_REFRESH_EVENT = 'cagupta:staff-notifications:refresh';

export function dispatchStaffNotificationsRefresh() {
  window.dispatchEvent(new CustomEvent(STAFF_NOTIFICATIONS_REFRESH_EVENT));
}
