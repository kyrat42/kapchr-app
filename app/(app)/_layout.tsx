import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// The main app layout — a bottom tab bar with 3 tabs.
// The task/[id] screen is also declared here but hidden from the tab bar
// (href: null) so it can still be navigated to programmatically.
export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#000',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { borderTopColor: '#e5e7eb' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: 'Planner',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Task detail — part of the app group but not a tab */}
      <Tabs.Screen
        name="task/[id]"
        options={{ href: null }}
      />
    </Tabs>
  );
}
