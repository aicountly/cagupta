import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../../theme/portalTheme';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterChipsProps {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

export function FilterChips({ label, options, value, onChange }: FilterChipsProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 12, color: theme.muted, marginBottom: 6, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.white,
  },
  chipActive: { borderColor: '#15803d', backgroundColor: '#f0fdf4' },
  chipText: { fontSize: 13, color: theme.text },
  chipTextActive: { color: '#15803d', fontWeight: '600' },
});
