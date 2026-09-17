import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Expo Go (SDK 53+) throws real Errors -- not rejected promises we can rely
// on a targeted try/catch for, and apparently not limited to just the token
// call -- when its Android remote-push APIs are touched at all. Detecting
// Expo Go up front turned out not to be reliable across SDK versions, so
// instead every expo-notifications call below (handler registration
// included) is inside one try/catch that swallows whatever throws.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (e) {
  console.warn('Could not set notification handler:', e);
}

// Registers this device for push and returns its Expo push token, or null
// if this is Expo Go (needs a development build instead), permission was
// denied, this is a simulator, or no EAS project is linked yet (`eas init`
// writes the project ID app.json needs).
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
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
    console.warn('Push notification registration unavailable (expected in Expo Go):', e);
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
