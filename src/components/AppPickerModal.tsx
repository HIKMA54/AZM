import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  FlatList,
  Switch,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, radius, type } from '../theme/theme';
import { UsageStatsService } from '../services/UsageStats';
import { AppInfo } from '../services/usageTypes';
import { getTrackedSet, setTracked } from '../database/trackedAppsRepo';

/**
 * Full-screen app picker built on React Native's own Modal — no navigation
 * stack or list library needed. Lists the phone's launchable apps (from the
 * native module) and lets the user toggle which ones Azm watches.
 */
export function AppPickerModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [tracked, setTrackedState] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    (async () => {
      try {
        const list = await UsageStatsService.getLaunchableApps();
        list.sort((a, b) => a.appName.localeCompare(b.appName));
        setApps(list);
        setTrackedState(getTrackedSet());
      } finally {
        setLoading(false);
      }
    })();
  }, [visible]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return apps;
    return apps.filter(a => a.appName.toLowerCase().includes(term));
  }, [apps, q]);

  function toggle(app: AppInfo, on: boolean) {
    setTracked(app.packageName, app.appName, on);
    setTrackedState(prev => {
      const next = new Set(prev);
      if (on) next.add(app.packageName);
      else next.delete(app.packageName);
      return next;
    });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.header}>
          <Text style={type.title}>Apps to watch</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.done}>Done</Text>
          </TouchableOpacity>
        </View>
        <Text style={[type.body, styles.intro]}>
          Pick the apps you tend to lose time in. Azm focuses on these.
        </Text>

        <TextInput
          style={styles.search}
          placeholder="Search apps"
          placeholderTextColor={colors.inkFaint}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
        />

        {loading ? (
          <Text style={[type.body, styles.loading]}>Reading installed apps…</Text>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={a => a.packageName}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
            renderItem={({ item }) => {
              const on = tracked.has(item.packageName);
              return (
                <View style={styles.row}>
                  <Text style={[type.body, styles.appName]} numberOfLines={1}>
                    {item.appName}
                  </Text>
                  <Switch
                    value={on}
                    onValueChange={v => toggle(item, v)}
                    trackColor={{ true: colors.accent, false: colors.line }}
                    thumbColor={colors.white}
                  />
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  done: { color: colors.accent, fontWeight: '600', fontSize: 16 },
  intro: { marginTop: space.sm, marginBottom: space.lg },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    marginBottom: space.md,
  },
  loading: { marginTop: space.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  appName: { flex: 1, marginRight: space.lg, color: colors.ink },
});