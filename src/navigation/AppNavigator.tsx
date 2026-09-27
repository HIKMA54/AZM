import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, type } from '../theme/theme';
import DashboardScreen from '../screens/DashboardScreen';
import InsightsScreen from '../screens/InsightsScreen';
import SettingsScreen from '../screens/SettingsScreen';

type TabKey = 'today' | 'insights' | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'insights', label: 'Insights' },
  { key: 'settings', label: 'Settings' },
];

/**
 * Lightweight state-based tab shell. Intentionally not react-navigation yet —
 * three sibling tabs are just state, and this avoids another native dependency
 * on a fragile build. react-navigation's stack/modal comes in when we add
 * pushed detail screens and the full-screen interrupt, where it earns its place.
 */
export default function AppNavigator() {
  const [tab, setTab] = useState<TabKey>('today');
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        <View style={[styles.screenWrap, tab !== 'today' && styles.hidden]}>
          <DashboardScreen />
        </View>
        <View style={[styles.screenWrap, tab !== 'insights' && styles.hidden]}>
          <InsightsScreen />
        </View>
        <View style={[styles.screenWrap, tab !== 'settings' && styles.hidden]}>
          <SettingsScreen />
        </View>
      </View>

      <View style={[styles.tabBar, { paddingBottom: insets.bottom + space.sm }]}>
        {TABS.map(t => {
          const active = t.key === tab;
          return (
            <TouchableOpacity
              key={t.key}
              style={styles.tab}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}>
              <View style={[styles.dot, active && styles.dotActive]} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  screenWrap: { flex: 1 },
  hidden: { display: 'none' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    paddingTop: space.sm,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'transparent',
    marginBottom: 5,
  },
  dotActive: { backgroundColor: colors.accent },
  tabLabel: { ...type.label, color: colors.inkFaint },
  tabLabelActive: { color: colors.accent, fontWeight: '600' },
});