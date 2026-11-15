import { Platform } from 'react-native';

export type PushResult = { ok: true; token: string } | { ok: false; reason: string };

/** Show notifications that arrive while the app is open. Safe to call more than once. */
export async function configureForegroundNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const N = await import('expo-notifications');
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
  } catch { /* notifications unavailable on this device: the in-app list still works */ }
}

/** Asks permission and returns this phone's Expo push token. Needs a real device and an EAS project id. */
export async function getPushToken(): Promise<PushResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'Push notifications are not available on the web version.' };
  try {
    const N = await import('expo-notifications');
    const Constants = (await import('expo-constants')).default;
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', { name: 'Loka', importance: N.AndroidImportance.DEFAULT });
    }
    let status = (await N.getPermissionsAsync()).status;
    if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
    if (status !== 'granted') return { ok: false, reason: 'Notifications are switched off for Loka in your phone settings.' };
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { ok: false, reason: 'This build has no EAS project id, so push cannot be set up yet. See docs/BACKEND.md.' };
    const t = await N.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: t.data };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Could not set up push notifications.' };
  }
}
