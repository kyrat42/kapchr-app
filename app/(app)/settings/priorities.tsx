import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function PrioritiesScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backLink}>← Settings</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Priority Levels</Text>
      <Text style={styles.placeholder}>Priority editor coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 64 },
  backButton: { marginBottom: 24 },
  backLink: { color: '#6b7280' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  placeholder: { color: '#9ca3af' },
});
