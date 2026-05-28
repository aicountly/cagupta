import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

/** Foreground notification behaviour (scaffold — tune before production). */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushRegistrationResult {
  expoPushToken: string | null;
  /** Human-readable reason when token is unavailable. */
  reason?: string;
}

/**
 * Request permissions and return Expo push token.
 * Requires a physical device and (for production) EAS projectId in app config.
 */
export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return { expoPushToken: null, reason: 'Push notifications require a physical device.' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return { expoPushToken: null, reason: 'Notification permission was not granted.' };
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  if (!projectId) {
    return {
      expoPushToken: null,
      reason: 'EAS projectId not configured. Run `eas init` in mobile/app or set EAS_PROJECT_ID.',
    };
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return { expoPushToken: token.data };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not obtain push token.';
    return { expoPushToken: null, reason: message };
  }
}

/** Extract deep-link URL from a notification payload (`data.url`). */
export function pushPayloadUrl(data: Record<string, unknown> | undefined): string | null {
  const url = data?.url;
  return typeof url === 'string' && url.trim() !== '' ? url : null;
}
