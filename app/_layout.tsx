import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth.store';

export default function RootLayout() {
  const { session, setSession, isLoading, setLoading } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // On startup, check if there's already a saved session (user was previously logged in)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false); // Auth check complete — now we know where to send the user
    });

    // Listen for any subsequent auth changes: login, logout, token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe(); // Clean up listener when layout unmounts
  }, []);

  useEffect(() => {
    if (isLoading) return; // Don't redirect until we know the auth state

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Not logged in but trying to access the app — send to auth
      router.replace('/(auth)');
    } else if (session && inAuthGroup) {
      // Already logged in but on an auth screen — send to app
      router.replace('/(app)');
    }
  }, [session, segments, isLoading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}
