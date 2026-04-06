import { Stack } from 'expo-router';

// Settings uses its own Stack navigator so users can drill into sub-pages
// (Areas, Priorities, Template) and press Back to return to the Settings menu.
export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
