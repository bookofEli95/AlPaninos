import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Two earlier attempts wrapped calls into expo-notifications (and then the
// whole function body) in try/catch and the crash was identical either way.
// That only makes sense if the throw happens at module-evaluation time --
// i.e. from the `import * as Notifications from 'expo-notifications'`
// statement itself -- since a static import is hoisted and runs before any
// try/catch in the file even exists, so neither fix could ever have caught
// it. Fix: never even load the module while running in Expo Go, using a
// deferred require() (a real function call, unlike import) inside a
// try/catch, gated by an explicit Expo Go check as a first line of defense.
function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
}

// Registers this device for push and returns its Expo push token, or null
// if this is Expo Go (needs a development build instead), permission was
// denied, this is a simulator, or no EAS project is linked yet (`eas init`
// writes the project ID app.json needs).
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Expected every time while testing in Expo Go (this project's normal
  // dev workflow), not an actionable problem -- silently no-op rather than
  // warn on every single app load.
  if (isExpoGo()) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Device = require('expo-device');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (!Device.isDevice) {
      console.warn('Push notifications require a physical device.');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('Push notification permission was not granted.');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#A61C14',
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('No EAS project linked -- run `eas init` to enable push notifications.');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token;
  } catch (e) {
    console.warn('Push notification registration unavailable:', e);
    return null;
  }
}

// Hands the token to a SECURITY DEFINER function rather than upserting the
// row directly: the same physical device's token can end up owned by a
// different account (registered <-> guest <-> a different guest session on
// the same phone during testing), and RLS would block a plain upsert from
// reassigning a row it doesn't already own. register_push_token() deletes
// any existing row for this token and re-inserts it for the current user.
export async function savePushToken(token: string) {
  const { error } = await (supabase as any).rpc('register_push_token', { p_token: token });
  if (error) console.warn('Failed to save push token:', error.message);
}
