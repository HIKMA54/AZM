import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, radius, type } from '../theme/theme';
import { runDetection, DetectionResult } from '../detection/engine';
import { RuleResult } from '../detection/rules';
import { displayAppName } from '../utils/appNames';
import { getTrackedNameMap } from '../database/trackedAppsRepo';

function describe(
  rule: RuleResult,
  trackedNames: Map<string, string>,
): { head: string; sub: string } {
  const d = rule.detail ?? {};
  const app = displayAppName(rule.packageName, trackedNames);
  switch (rule.type) {
    case 'impulse_opens':
      return {
        head: `Opened ${app} ${d.opens} times today`,
        sub: `your usual is about ${d.usual}`,
      };
    case 'long_session':
      return {
        head: `A ${d.sessionMin}-minute stretch on ${app}`,
        sub: `longer than your usual ${d.usualMin} minutes`,
      };
    case 'late_night':
      return {
        head: `Active after ${d.sinceHour}:00`,
        sub: `${d.opens} late-night open${d.opens === 1 ? '' : 's'} tonight`,
      };
    case 'daily_goal':
      return {
        head: `${d.usedMin} minutes on tracked apps`,
        sub: `past your ${d.goalMin}-minute goal`,
      };
    default:
      return { head: 'A pattern stood out', sub: '' };
  }
}

/** Shared by WhyModal (fresh detection) and the interrupt (the rules that fired it). */
export function WhyContent({ rules }: { rules: RuleResult[] }) {
  if (rules.length === 0) {
    return (
      <>
        <Text style={[type.display, styles.title]}>Nothing is flagged right now.</Text>
        <Text style={[type.body, styles.calm]}>
          Azm only speaks up when one of its rules actually matches. When it does, this screen
          shows you exactly which ones.
        </Text>
        <PrivacyNote />
      </>
    );
  }

  const trackedNames = getTrackedNameMap();
  return (
    <>
      <Text style={[type.display, styles.title]}>
        Azm flagged this because {rules.length === 1 ? 'this matched:' : 'these matched:'}
      </Text>
      <View style={styles.list}>
        {rules.map((r, i) => {
          const { head, sub } = describe(r, trackedNames);
          return (
            <View key={`${r.type}-${r.packageName ?? 'all'}-${i}`} style={styles.card}>
              <View style={styles.dot} />
              <View style={styles.cardText}>
                <Text style={styles.head}>{head}</Text>
                {sub ? <Text style={styles.sub}>{sub}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
      <PrivacyNote />
    </>
  );
}

function PrivacyNote() {
  return (
    <View style={styles.privacy}>
      <Text style={styles.privacyHead}>These rules run entirely on your device.</Text>
      <Text style={styles.privacySub}>No usage data ever leaves your phone.</Text>
    </View>
  );
}

export function WhyModal({
  visible,
  onClose,
  onAdjustSettings,
}: {
  visible: boolean;
  onClose: () => void;
  onAdjustSettings?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [result, setResult] = useState<DetectionResult | null>(null);

  useEffect(() => {
    if (!visible) return;
    try {
      setResult(runDetection(Date.now()));
    } catch {
      setResult(null);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.header}>
          <Text style={type.eyebrow}>WHY YOU SAW THIS</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <WhyContent rules={result?.firedRules ?? []} />

          {onAdjustSettings ? (
            <TouchableOpacity
              style={styles.adjustBtn}
              activeOpacity={0.8}
              onPress={onAdjustSettings}>
              <Text style={styles.adjustText}>Adjust nudge settings</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
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
    marginBottom: space.lg,
  },
  close: { color: colors.accent, fontWeight: '600', fontSize: 16 },
  body: { paddingBottom: space.xxxl * 2 },
  title: { fontSize: 24, lineHeight: 31, marginBottom: space.xl },
  calm: { color: colors.inkSoft, marginBottom: space.xl },
  list: { marginTop: space.xs },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space.xl,
    marginBottom: space.md,
    alignItems: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: 7,
    marginRight: space.md,
  },
  cardText: { flex: 1 },
  head: { ...type.heading, color: colors.ink },
  sub: { ...type.caption, marginTop: 3 },
  privacy: {
    marginTop: space.xl,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: space.lg,
  },
  privacyHead: { ...type.label, color: colors.ink },
  privacySub: { ...type.caption, marginTop: 3 },
  adjustBtn: {
    marginTop: space.xxl,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  adjustText: { color: colors.white, fontWeight: '600', fontSize: 16 },
});