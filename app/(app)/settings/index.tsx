import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const router = useRouter();

  const items = [
    { label: 'Weekly Template', route: './template' },
    { label: 'Areas of Life', route: './areas' },
    { label: 'Priority Levels', route: './priorities' },
    { label: 'Account', route: './account' },
  ] as const;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {items.map((item) => (
        <TouchableOpacity
          key={item.label}
          style={styles.row}
          onPress={() => router.push(item.route)}
        >
          <Text style={styles.rowLabel}>{item.label}</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 64,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 32,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowLabel: {
    fontSize: 16,
  },
  rowChevron: {
    fontSize: 20,
    color: '#9ca3af',
  },
});
