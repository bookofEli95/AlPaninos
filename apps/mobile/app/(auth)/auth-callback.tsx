import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

// Where Google sends the customer back to after signing in
// (alpaninos://auth-callback, see lib/socialSignIn.ts). The sign-in itself
// is finished by the Sign In screen; as soon as it is, the root layout takes
// the customer into the app. This only shows for that moment -- with a way
// back if it never finishes (they closed Google part-way, say).
export default function AuthCallback() {
  const router = useRouter();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View className="flex-1 bg-[#1C1917] items-center justify-center px-8">
      <ActivityIndicator size="large" color="#F4ECE1" />
      <Text className="text-[#F4ECE1] font-inter-semibold text-sm mt-4">Signing you in...</Text>
      {slow && (
        <TouchableOpacity onPress={() => router.replace('/(auth)/login')} className="mt-6 py-2 px-4">
          <Text className="text-[#FFC72C] font-inter-bold text-sm">Back to Sign In</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
