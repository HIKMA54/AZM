import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, radius, type } from '../theme/theme';
import { ActiveIntervention } from '../interventions/useInterventionWatcher';
import { InterventionOption } from '../interventions/interventionEngine';
import {
  recordResponse,
  getBreakAcceptanceStats,
  getYesterdayBreakMemory,
} from '../interventions/interventionsRepo';
import { WhyContent } from './WhyModal';
import { BreathingExercise } from './BreathingExercise';
import { Monitor } from '../background/monitor';

const EYEBROW: Record<string, string> = {
  gentle: 'A GENTLE NUDGE',
  interrupt: 'TIME TO PAUSE',
};

type InterruptView = 'prompt' | 'why' | 'breathe' | 'confirm';

type BreakKind = 'break' | 'breathe' | 'step_away';

const CONFIRM_COPY: Record<BreakKind, { title: string; body: string }> = {
  break: {
    title: 'You stepped away.',
    body: 'A small win. Your attention is yours again. Azm will keep quiet for a while.',
  },
  breathe: {
    title: 'That minute was yours.',
    body: 'A slower breath is a good reset. Azm will keep quiet for a while.',
  },
  step_away: {
    title: 'Go on, put it down.',
    body: 'Phone face-down, a few minutes somewhere else. Azm will keep quiet for a while.',
  },
};

/**
 * "Take a break" is always tappable. "Keep scrolling" waits out
 * decision.frictionSec, which grows with each intervention that day.
 * Breathing and "Step away" both count as an accepted break.
 */
export function InterruptModal({
  active,
  onClose,
}: {
  active: ActiveIntervention | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<InterruptView>('prompt');
  const [breakKind, setBreakKind] = useState<BreakKind>('break');
  const [accepted, setAccepted] = useState(0);
  const [memory] = useState<string | null>(() => {
    try {
      return active ? getYesterdayBreakMemory() : null;
    } catch {
      return null;
    }
  });
  const [elapsed, setElapsed] = useState(0);

  const decision = active?.decision;
  const maxDelay = Math.max(0, ...(decision?.options.map(o => o.delaySec) ?? []));
  const secondsLeft = (opt: InterventionOption) => Math.max(0, opt.delaySec - elapsed);

  // On screen now, so the matching background notification is redundant.
  useEffect(() => {
    if (active) Monitor.clearInterventionNotification();
  }, [active]);

  // Keeps counting while the "why" view is open.
  useEffect(() => {
    if (maxDelay === 0) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(s);
      if (s >= maxDelay) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [maxDelay]);

  function takeBreak(kind: BreakKind, next: InterruptView) {
    if (!active) return;
    recordResponse(active.id, 'accepted_break');
    setAccepted(getBreakAcceptanceStats().accepted);
    setBreakKind(kind);
    setView(next);
  }

  function choose(opt: InterventionOption) {
    if (secondsLeft(opt) > 0) return;
    if (!active) return;
    if (opt.response === 'accepted_break') {
      takeBreak('break', 'confirm');
      return;
    }
    recordResponse(active.id, opt.response);
    onClose();
  }

  const onBreathingDone = useCallback(() => setView('confirm'), []);

  const confirm = CONFIRM_COPY[breakKind];

  return (
    <Modal
      visible={!!active}
      animationType="fade"
      onRequestClose={() => {
        // Back only leaves the "why" view, so it can't skip the countdown.
        if (view === 'why') setView('prompt');
      }}
      statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + space.xxxl }]}>
        {active && decision && view === 'prompt' && (
          <ScrollView
            contentContainerStyle={styles.scrollBody}
            showsVerticalScrollIndicator={false}>
            <Text style={styles.eyebrow}>{EYEBROW[decision.level] ?? 'A MOMENT'}</Text>
            <Text style={styles.title}>{decision.title}</Text>
            <Text style={styles.message}>{decision.body}</Text>

            {memory ? (
              <View style={styles.memory}>
                <Text style={styles.memoryText}>{memory}</Text>
              </View>
            ) : null}

            <Text style={styles.altLabel}>Instead of scrolling:</Text>
            <View style={styles.altRow}>
              <TouchableOpacity
                style={styles.chip}
                activeOpacity={0.8}
                onPress={() => takeBreak('breathe', 'breathe')}>
                <Text style={styles.chipText}>Breathe for 1 min</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, styles.chipSpaced]}
                activeOpacity={0.8}
                onPress={() => takeBreak('step_away', 'confirm')}>
                <Text style={styles.chipText}>Step away</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => setView('why')} hitSlop={12}>
              <Text style={styles.whyLink}>Why am I seeing this?</Text>
            </TouchableOpacity>

            <View style={styles.actions}>
              {decision.options.map((opt, i) => {
                const left = secondsLeft(opt);
                const gated = left > 0;
                const isPrimary = i === 0;
                return (
                  <TouchableOpacity
                    key={opt.response}
                    style={[
                      styles.btn,
                      isPrimary ? styles.btnPrimary : styles.btnGhost,
                      gated && styles.btnDisabled,
                    ]}
                    disabled={gated}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: gated }}
                    accessibilityHint={gated ? `Available in ${left} seconds` : undefined}
                    activeOpacity={0.8}
                    onPress={() => choose(opt)}>
                    <Text style={isPrimary ? styles.btnPrimaryText : styles.btnGhostText}>
                      {gated ? `${opt.label} (${left}s)` : opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {elapsed < maxDelay && (
              <Text style={styles.frictionNote}>
                Take a break anytime. Continuing waits a moment, and the wait
                gets longer each time you push past your limit today.
              </Text>
            )}
          </ScrollView>
        )}

        {active && decision && view === 'why' && (
          <ScrollView
            contentContainerStyle={styles.scrollBody}
            showsVerticalScrollIndicator={false}>
            <Text style={styles.eyebrow}>WHY YOU SAW THIS</Text>
            <WhyContent rules={decision.firedRules} />
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, styles.backBtn]}
              activeOpacity={0.8}
              onPress={() => setView('prompt')}>
              <Text style={styles.btnPrimaryText}>Back</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {view === 'breathe' && <BreathingExercise onDone={onBreathingDone} />}

        {view === 'confirm' && (
          <View style={styles.body}>
            <Text style={styles.eyebrow}>NICE ONE</Text>
            <Text style={styles.title}>{confirm.title}</Text>
            <Text style={styles.message}>{confirm.body}</Text>
            <Text style={styles.count}>
              {accepted} break{accepted === 1 ? '' : 's'} taken with Azm.
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                activeOpacity={0.8}
                onPress={onClose}>
                <Text style={styles.btnPrimaryText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.xxl },
  body: { flex: 1, justifyContent: 'center', paddingBottom: space.xxxl * 2 },
  scrollBody: { flexGrow: 1, justifyContent: 'center', paddingBottom: space.xxxl * 2 },
  eyebrow: { ...type.eyebrow, color: colors.accent, marginBottom: space.lg },
  title: { ...type.display, fontSize: 30, lineHeight: 38 },
  message: { ...type.body, fontSize: 17, lineHeight: 26, color: colors.inkSoft, marginTop: space.lg },
  memory: {
    marginTop: space.xl,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: space.lg,
  },
  memoryText: { ...type.body, color: colors.ink },
  altLabel: { ...type.label, marginTop: space.xxl },
  altRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.md },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: space.lg,
  },
  chipSpaced: { marginLeft: space.sm },
  chipText: { color: colors.ink, fontWeight: '500', fontSize: 14 },
  whyLink: { color: colors.accent, fontWeight: '600', fontSize: 14, marginTop: space.xl },
  count: { fontFamily: 'monospace', fontSize: 13, color: colors.inkFaint, marginTop: space.xl },
  actions: { marginTop: space.xxl },
  btn: { borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: space.md },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.white, fontWeight: '600', fontSize: 16 },
  btnGhost: { backgroundColor: 'transparent' },
  btnGhostText: { color: colors.inkSoft, fontWeight: '600', fontSize: 15 },
  btnDisabled: { opacity: 0.45 },
  backBtn: { marginTop: space.xxl },
  frictionNote: {
    ...type.caption,
    color: colors.inkFaint,
    marginTop: space.xl,
    lineHeight: 18,
  },
});
