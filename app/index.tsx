import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/lib/store/auth.store';

// This is the app's entry point.
// It waits for the auth check in _layout.tsx to complete, then
// redirects to the right place based on whether the user is logged in.
export default function Index() {
  const { session, isLoading } = useAuthStore();

  // Still checking for an existing session — show a spinner
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  // Auth check done — send to the right screen
  return <Redirect href={session ? '/(app)' : '/(auth)'} />;
}
