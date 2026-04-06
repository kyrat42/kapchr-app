import { View, ActivityIndicator } from 'react-native';

// Entry point — shows a spinner while _layout.tsx checks for an existing session.
// Once the auth check is done, _layout.tsx will redirect to (auth) or (app).
export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#000" />
    </View>
  );
}
