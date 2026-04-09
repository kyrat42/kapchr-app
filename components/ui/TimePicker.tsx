import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  hour: number;   // 1–12
  minute: number; // 0–55 (5-min steps)
  isPM: boolean;
  onChange: (hour: number, minute: number, isPM: boolean) => void;
}

// Converts our 12-hour parts to a "HH:MM" 24-hour string for the database
export const toTimeString = (hour: number, minute: number, isPM: boolean): string => {
  let h = hour % 12; // 12 → 0
  if (isPM) h += 12;
  return `${h.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
};

// Parses a "HH:MM" 24-hour string into our 12-hour parts
export const fromTimeString = (time: string): { hour: number; minute: number; isPM: boolean } => {
  const [h, m] = time.split(':').map(Number);
  return {
    hour:   h % 12 || 12,
    minute: Math.round(m / 5) * 5, // snap to nearest 5-min step
    isPM:   h >= 12,
  };
};

export default function TimePicker({ hour, minute, isPM, onChange }: Props) {
  const stepHour = (dir: 1 | -1) => {
    const next = hour + dir;
    onChange(next === 0 ? 12 : next === 13 ? 1 : next, minute, isPM);
  };

  const stepMinute = (dir: 1 | -1) => {
    const next = minute + dir * 5;
    onChange(hour, next < 0 ? 55 : next > 55 ? 0 : next, isPM);
  };

  const togglePeriod = () => onChange(hour, minute, !isPM);

  return (
    <View style={styles.row}>
      {/* Hour */}
      <Column
        label={hour.toString().padStart(2, '0')}
        onUp={() => stepHour(1)}
        onDown={() => stepHour(-1)}
      />

      <Text style={styles.colon}>:</Text>

      {/* Minute */}
      <Column
        label={minute.toString().padStart(2, '0')}
        onUp={() => stepMinute(1)}
        onDown={() => stepMinute(-1)}
      />

      {/* AM / PM */}
      <TouchableOpacity style={styles.periodBtn} onPress={togglePeriod}>
        <Text style={styles.periodTop}>{isPM ? 'AM' : 'PM'}</Text>
        <Text style={styles.periodCurrent}>{isPM ? 'PM' : 'AM'}</Text>
        <Text style={styles.periodBottom}>{isPM ? 'AM' : 'PM'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// Reusable up/value/down column
function Column({ label, onUp, onDown }: { label: string; onUp: () => void; onDown: () => void }) {
  return (
    <View style={styles.column}>
      <TouchableOpacity style={styles.arrowBtn} onPress={onUp}>
        <Text style={styles.arrow}>▲</Text>
      </TouchableOpacity>
      <View style={styles.valueBox}>
        <Text style={styles.value}>{label}</Text>
      </View>
      <TouchableOpacity style={styles.arrowBtn} onPress={onDown}>
        <Text style={styles.arrow}>▼</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 4,
  },
  colon: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  column: { alignItems: 'center', gap: 4 },
  arrowBtn: { padding: 8 },
  arrow: { fontSize: 16, color: '#9ca3af' },
  valueBox: {
    width: 64,
    height: 56,
    backgroundColor: '#f5f0e8',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: 32, fontWeight: '700', color: '#1a1a1a' },

  periodBtn: {
    marginLeft: 8,
    alignItems: 'center',
    gap: 2,
  },
  periodTop: { fontSize: 13, color: '#d1d5db', fontWeight: '500' },
  periodCurrent: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    backgroundColor: '#f5f0e8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  periodBottom: { fontSize: 13, color: '#d1d5db', fontWeight: '500' },
});
