import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { PALETTE, type PaletteKey } from '@/lib/constants/palette';

interface Props {
  selected: PaletteKey;
  onSelect: (key: PaletteKey) => void;
}

// Reusable color palette picker — renders a grid of swatches.
// Used in the Areas of Life add/edit form.
export default function ColorPicker({ selected, onSelect }: Props) {
  return (
    <View style={styles.grid}>
      {PALETTE.map((colorSet) => (
        <TouchableOpacity
          key={colorSet.key}
          style={[
            styles.swatch,
            { backgroundColor: colorSet.light },
            selected === colorSet.key && styles.swatchSelected,
          ]}
          onPress={() => onSelect(colorSet.key)}
          activeOpacity={0.7}
        >
          {/* Dark dot inside selected swatch as a checkmark indicator */}
          {selected === colorSet.key && (
            <View style={[styles.dot, { backgroundColor: colorSet.dark }]} />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: '#000',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
