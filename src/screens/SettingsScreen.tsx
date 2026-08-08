import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { Screen, Card, SectionLabel, Divider } from '../components/ui';
import { colors, space, radius, type } from '../theme/theme';
import {
  getSetting,
  getSettingNumber,
  setSetting,
  setSettingNumber,
} from '../database/settingsRepo';
import { countTracked } from '../database/trackedAppsRepo';
import { AppPickerModal } from '../components/AppPickerModal';
import { Monitor } from '../background/monitor';

function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepBtn} onPress={() => set(value - step)}>
        <Text style={styles.stepSign}>−</Text>
      </TouchableOpacity>
      <Text style={styles.stepValue}>{format(value)}</Text>
      <TouchableOpacity style={styles.stepBtn} onPress={() => set(value + step)}>
        <Text style={styles.stepSign}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export default function SettingsScreen() {
  const [goal, setGoal] = useState<number>(getSettingNumber('daily_goal_minutes') ?? 120);
  const [lateHour, setLateHour] = useState<number>(
    getSettingNumber('late_night_start_hour') ?? 23,
  );
  const [quietStart, setQuietStart] = useState<number>(
    parseInt((getSetting('quiet_hours_start') ?? '22:00').split(':')[0], 10),
  );
  const [quietEnd, setQuietEnd] = useState<number>(
    parseInt((getSetting('quiet_hours_end') ?? '07:00').split(':')[0], 10),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trackedCount, setTrackedCount] = useState<number>(countTracked());
  const [monitoring, setMonitoring] = useState<boolean>(Monitor.isEnabled());

  // Reconcile the toggle with whether the service is actually running.
  useEffect(() => {
    Monitor.isRunning().then(r => setMonitoring(r || Monitor.isEnabled()));
  }, []);

  const wrapHour = (h: number) => (h + 24) % 24;

  async function toggleMonitoring(on: boolean) {
    setMonitoring(on); // optimistic
    try {
      if (on) await Monitor.enable();
      else await Monitor.disable();
    } catch {
      setMonitoring(!on); // revert on failure
    }
  }

  return (
    <Screen>
      <Text style={[type.eyebrow, styles.eyebrow]}>SETTINGS</Text>
      <Text style={[type.display, styles.headline]}>How Azm watches your day.</Text>

      <SectionLabel>Background monitoring</SectionLabel>
      <Card>
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={[type.heading, { color: colors.ink }]}>Watch in the background</Text>
            <Text style={[type.caption, styles.caption]}>
              Lets Azm notice patterns and nudge you even when it's closed. Shows a quiet ongoing
              notification while active.
            </Text>
          </View>
          <Switch
            value={monitoring}
            onValueChange={toggleMonitoring}
            trackColor={{ true: colors.accent, false: colors.line }}
            thumbColor={colors.white}
          />
        </View>
      </Card>

      <SectionLabel>Apps to watch</SectionLabel>
      <TouchableOpacity activeOpacity={0.7} onPress={() => setPickerOpen(true)}>
        <Card>
          <View style={styles.linkRow}>
            <View style={styles.linkText}>
              <Text style={[type.heading, { color: colors.ink }]}>Tracked apps</Text>
              <Text style={[type.caption, styles.caption]}>
                {trackedCount === 0
                  ? 'None picked yet — Azm is watching everything it sees.'
                  : `${trackedCount} app${trackedCount === 1 ? '' : 's'} chosen.`}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Card>
      </TouchableOpacity>

      <SectionLabel>Your limits</SectionLabel>
      <Card>
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={[type.heading, { color: colors.ink }]}>Daily goal</Text>
            <Text style={[type.caption, styles.caption]}>
              How much social time feels right in a day.
            </Text>
          </View>
          <Stepper
            value={goal}
            min={30}
            max={480}
            step={15}
            format={v => `${v} min`}
            onChange={v => {
              setGoal(v);
              setSettingNumber('daily_goal_minutes', v);
            }}
          />
        </View>
        <Divider />
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={[type.heading, { color: colors.ink }]}>Late-night starts</Text>
            <Text style={[type.caption, styles.caption]}>
              Opens after this hour count as late-night use.
            </Text>
          </View>
          <Stepper
            value={lateHour}
            min={19}
            max={26}
            step={1}
            format={v => hourLabel(wrapHour(v))}
            onChange={v => {
              const h = wrapHour(v);
              setLateHour(v);
              setSettingNumber('late_night_start_hour', h);
            }}
          />
        </View>
      </Card>

      <SectionLabel>Quiet hours</SectionLabel>
      <Card>
        <Text style={[type.caption, styles.caption, { marginBottom: space.md }]}>
          Azm stays silent during these hours — no nudges, even if something spikes.
        </Text>
        <View style={styles.settingRow}>
          <Text style={[type.body, { color: colors.ink }]}>From</Text>
          <Stepper
            value={quietStart}
            min={0}
            max={23}
            step={1}
            format={hourLabel}
            onChange={v => {
              setQuietStart(v);
              setSetting('quiet_hours_start', hourLabel(v));
            }}
          />
        </View>
        <Divider />
        <View style={styles.settingRow}>
          <Text style={[type.body, { color: colors.ink }]}>Until</Text>
          <Stepper
            value={quietEnd}
            min={0}
            max={23}
            step={1}
            format={hourLabel}
            onChange={v => {
              setQuietEnd(v);
              setSetting('quiet_hours_end', hourLabel(v));
            }}
          />
        </View>
      </Card>

      <AppPickerModal
        visible={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setTrackedCount(countTracked());
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { marginTop: space.sm },
  headline: { marginTop: space.xs, marginBottom: space.sm },
  caption: { marginTop: 3 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkText: { flex: 1, marginRight: space.md },
  chevron: { fontSize: 26, color: colors.inkFaint, marginTop: -2 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
  },
  settingText: { flex: 1, marginRight: space.md },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    padding: 3,
  },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  stepSign: { fontSize: 20, color: colors.ink, lineHeight: 22 },
  stepValue: {
    minWidth: 62,
    textAlign: 'center',
    fontFamily: 'monospace',
    fontSize: 14,
    color: colors.ink,
  },
});