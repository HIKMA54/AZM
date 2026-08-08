import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, radius, type } from '../theme/theme';

/** Full-screen scrollable container that respects the status bar / notch. */
export function Screen({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

export function Card({
  children,
  style,
  tone,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: string;
}) {
  return (
    <View style={[styles.card, tone ? { backgroundColor: tone } : null, style]}>
      {children}
    </View>
  );
}

/** Small uppercase section eyebrow — labels a section, never decorates. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={[type.eyebrow, styles.sectionLabel]}>{children}</Text>;
}

/** A single behavioral stat: a monospace number over a plain label. */
export function StatTile({
  value,
  unit,
  label,
}: {
  value: string | number;
  unit?: string;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statValueRow}>
        <Text style={type.data}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      <Text style={[type.caption, styles.statLabel]}>{label}</Text>
    </View>
  );
}

export function Pill({
  children,
  fg,
  bg,
}: {
  children: React.ReactNode;
  fg: string;
  bg: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{children}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollBody: {
    paddingHorizontal: space.xxl,
    paddingBottom: space.xxxl * 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionLabel: {
    marginTop: space.xxl,
    marginBottom: space.md,
    textTransform: 'uppercase',
  },
  stat: { flex: 1 },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  statUnit: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.inkFaint,
    marginLeft: 3,
  },
  statLabel: { marginTop: space.xs },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: 12, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: space.lg },
});