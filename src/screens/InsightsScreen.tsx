import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Screen, Card, SectionLabel, StatTile, Divider } from '../components/ui';
import { colors, space, radius, type, risk as riskTones } from '../theme/theme';
import { useInsights } from '../hooks/useInsights';
import { DaySeries } from '../detection/history';

const RIBBON_H = 46;
const BAR_H = 110;

/** Signature element: one calm cell per day, colored by that day's risk. */
function RiskRibbon({ series }: { series: DaySeries[] }) {
  return (
    <View>
      <View style={styles.ribbonRow}>
        {series.map(d => {
          const tone = riskTones[d.level];
          const bg = d.hasData ? tone.bg : colors.surfaceSunken;
          const fg = d.hasData ? tone.fg : colors.inkFaint;
          return (
            <View key={d.date} style={styles.ribbonCell}>
              <View
                style={[
                  styles.ribbonBlock,
                  { backgroundColor: bg },
                  d.isToday && styles.ribbonToday,
                ]}>
                {d.hasData && <View style={[styles.ribbonBar, { backgroundColor: fg }]} />}
              </View>
              <Text style={[styles.ribbonLabel, d.isToday && styles.ribbonLabelToday]}>
                {d.weekday}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        {(['low', 'medium', 'high'] as const).map(k => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: riskTones[k].fg }]} />
            <Text style={type.caption}>{riskTones[k].label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Plain-View bar chart of a behavioral value per day. */
function BarChart({
  series,
  valueOf,
}: {
  series: DaySeries[];
  valueOf: (d: DaySeries) => number;
}) {
  const max = Math.max(1, ...series.map(valueOf));
  return (
    <View style={styles.chartRow}>
      {series.map(d => {
        const v = valueOf(d);
        const h = v > 0 ? Math.max(4, (v / max) * BAR_H) : 2;
        return (
          <View key={d.date} style={styles.chartCol}>
            <Text style={styles.barValue}>{v > 0 ? v : ''}</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.bar,
                  { height: h, backgroundColor: v > 0 ? colors.accent : colors.line },
                  d.isToday && { backgroundColor: colors.ink },
                ]}
              />
            </View>
            <Text style={styles.barLabel}>{d.weekday}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function InsightsScreen() {
  const { model, loading, refresh } = useInsights();

  if (loading && !model) {
    return (
      <Screen>
        <Text style={[type.eyebrow, styles.eyebrow]}>INSIGHTS</Text>
        <Text style={[type.body, styles.subline]}>Gathering your week…</Text>
      </Screen>
    );
  }
  if (!model) return null;

  const { series, summary, breaks, topApps } = model;
  const hours = Math.floor(summary.totalMinutes / 60);
  const mins = summary.totalMinutes % 60;
  const totalLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <Screen>
      <Text style={[type.eyebrow, styles.eyebrow]}>INSIGHTS</Text>
      <Text style={[type.display, styles.headline]}>Your last seven days.</Text>
      {summary.daysWithData < 7 && (
        <Text style={[type.body, styles.subline]}>
          {summary.daysWithData} of 7 days in. The picture sharpens as the week fills.
        </Text>
      )}

      <SectionLabel>Risk, day by day</SectionLabel>
      <Card>
        <RiskRibbon series={series} />
      </Card>

      <SectionLabel>This week</SectionLabel>
      <Card>
        <View style={styles.statRow}>
          <StatTile value={summary.avgOpensPerDay} label="opens / day" />
          <StatTile value={totalLabel} label="total time" />
        </View>
        <Divider />
        <View style={styles.statRow}>
          <StatTile value={summary.lateNightMinutes} unit="min" label="late-night use" />
          <StatTile value={`${breaks.accepted}/${breaks.total}`} label="breaks taken" />
        </View>
      </Card>

      <SectionLabel>Times opened, by day</SectionLabel>
      <Card>
        <BarChart series={series} valueOf={d => d.opens} />
      </Card>

      {topApps.length > 0 && (
        <>
          <SectionLabel>What pulled hardest</SectionLabel>
          <Card>
            {topApps.map((a, i) => (
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
  eyebrow: { marginTop: space.sm },
  headline: { marginTop: space.xs },
  subline: { marginTop: space.md },
  statRow: { flexDirection: 'row' },

  ribbonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  ribbonCell: { flex: 1, alignItems: 'center' },
  ribbonBlock: {
    width: '84%',
    height: RIBBON_H,
    borderRadius: radius.sm,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 6,
  },
  ribbonToday: { borderWidth: 1.5, borderColor: colors.ink },
  ribbonBar: { width: '46%', height: 4, borderRadius: 2 },
  ribbonLabel: { ...type.caption, marginTop: 6 },
  ribbonLabelToday: { color: colors.ink, fontWeight: '700' },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: space.lg,
    gap: space.lg as unknown as number,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: space.sm },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },

  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  chartCol: { flex: 1, alignItems: 'center' },
  barValue: { fontFamily: 'monospace', fontSize: 11, color: colors.inkFaint, marginBottom: 4, height: 14 },
  barTrack: { height: BAR_H, justifyContent: 'flex-end' },
  bar: { width: 14, borderRadius: 4 },
  barLabel: { ...type.caption, marginTop: 6 },

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

  ghostBtn: { paddingVertical: 14, alignItems: 'center', marginTop: space.lg },
  ghostBtnText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
});