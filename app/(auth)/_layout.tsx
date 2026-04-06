import { Stack } from 'expo-router';

// Layout for all logged-out screens.
// Uses a Stack so users can navigate: Landing → Login or Landing → Signup
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
