import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth.store';

export default function RootLayout() {
  const { setSession, setLoading } = useAuthStore();

  useEffect(() => {
    // Safety net: never leave the app stuck loading for more than 5 seconds
    const timeout = setTimeout(() => setLoading(false), 5000);

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
      } catch {
        setSession(null);
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    };

    initAuth();

    // Keep the session in sync after login/logout/token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}
