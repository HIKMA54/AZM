import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Screen, Card, SectionLabel, StatTile, Pill, Divider } from '../components/ui';
import { colors, space, radius, type, risk as riskTones } from '../theme/theme';
import { useDashboard } from '../hooks/useDashboard';

export default function DashboardScreen() {
  const { phase, model, refresh, greeting, openUsageSettings } = useDashboard();

  if (phase === 'needsPermission') {
    return (
      <Screen>
        <Text style={[type.eyebrow, styles.eyebrow]}>AZM</Text>
        <Text style={[type.display, styles.headline]}>Azm needs one thing to begin.</Text>
        <Text style={[type.body, styles.subline]}>
          To notice your patterns, Azm reads which apps you open and for how long — all on your
          phone, nothing leaves it. Turn on Usage Access to start.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={openUsageSettings}>
          <Text style={styles.primaryBtnText}>Turn on Usage Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={refresh}>
          <Text style={styles.ghostBtnText}>I've done it — check again</Text>
        </TouchableOpacity>
      </Screen>
    );
  }

  if (phase !== 'ready' || !model) {
    return (
      <Screen>
        <Text style={[type.eyebrow, styles.eyebrow]}>AZM</Text>
        <Text style={[type.body, styles.subline]}>
          {phase === 'error' ? 'Something went wrong reading today.' : 'Reading your day…'}
        </Text>
      </Screen>
    );
  }

  const tone = riskTones[model.riskLevel];

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[type.eyebrow, styles.eyebrow]}>{greeting.toUpperCase()}</Text>
      </View>

      {/* Signature: the plain-language daily read */}
      <Text style={[type.display, styles.headline]}>{model.headline}</Text>
      <Text style={[type.body, styles.subline]}>{model.subline}</Text>

      {!model.learningPhase.active && (
        <View style={styles.statusRow}>
          <Pill fg={tone.fg} bg={tone.bg}>{`Today feels ${tone.label}`}</Pill>
        </View>
      )}

      {/* Behavioral evidence — opens lead, time is secondary */}
      <SectionLabel>Today</SectionLabel>
      <Card>
        <View style={styles.statRow}>
          <StatTile value={model.opensToday} label="times opened" />
          <StatTile value={model.longestMin} unit="min" label="longest stretch" />
        </View>
        <Divider />
        <View style={styles.statRow}>
          <StatTile value={model.totalMin} unit="min" label="on tracked apps" />
          <StatTile
            value={`${model.breaks.accepted}/${model.breaks.total}`}
            label="breaks taken"
          />
        </View>
      </Card>

      {/* What stood out */}
      <SectionLabel>What stood out</SectionLabel>
      {model.insights.length === 0 ? (
        <Card tone={colors.surfaceSunken}>
          <Text style={[type.body, { color: colors.inkSoft }]}>
            Nothing pulled you off track today. That's worth noticing too.
          </Text>
        </Card>
      ) : (
        <Card>
          {model.insights.map((line, i) => (
            <View key={i}>
              {i > 0 && <Divider />}
              <Text style={[type.body, styles.insight]}>{line}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Where the time went — behavioral (opens) first */}
      {model.topApps.length > 0 && (
        <>
          <SectionLabel>By app</SectionLabel>
          <Card>
            {model.topApps.map((a, i) => (
              <View key={a.packageName}>
                {i > 0 && <Divider />}
                <View style={styles.appRow}>
                  <Text style={[type.heading, styles.appName]}>{a.name}</Text>
                  <View style={styles.appStats}>
                    <Text style={styles.appData}>{a.opens}</Text>
                    <Text style={[type.caption, styles.appDataLabel]}>opens</Text>
                    <Text style={[styles.appData, styles.appDataSpaced]}>{a.minutes}</Text>
                    <Text style={[type.caption, styles.appDataLabel]}>min</Text>
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}

      <TouchableOpacity style={styles.ghostBtn} onPress={refresh}>
        <Text style={styles.ghostBtnText}>Refresh</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: space.sm, marginBottom: space.md },
  eyebrow: { marginTop: space.sm },
  headline: { marginTop: space.xs },
  subline: { marginTop: space.md },
  statusRow: { marginTop: space.lg },
  statRow: { flexDirection: 'row' },
  insight: { color: colors.ink, paddingVertical: space.xs },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
  },
  appName: { flexShrink: 1 },
  appStats: { flexDirection: 'row', alignItems: 'baseline' },
  appData: { fontFamily: 'monospace', fontSize: 16, color: colors.ink },
  appDataSpaced: { marginLeft: space.lg },
  appDataLabel: { marginLeft: 4 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: space.xxl,
  },
  primaryBtnText: { color: colors.white, fontWeight: '600', fontSize: 15 },
  ghostBtn: { paddingVertical: 14, alignItems: 'center', marginTop: space.md },
  ghostBtnText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
});