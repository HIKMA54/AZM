import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, radius, type } from '../theme/theme';
import { ActiveIntervention } from '../interventions/useInterventionWatcher';
import { InterventionOption } from '../interventions/interventionEngine';
import {
  recordResponse,
  getBreakAcceptanceStats,
} from '../interventions/interventionsRepo';

const EYEBROW: Record<string, string> = {
  gentle: 'A GENTLE NUDGE',
  interrupt: 'TIME TO PAUSE',
};

/**
 * The intervention surface. A calm full-screen takeover, not an alarm: plenty of
 * space, plain words, and the user's choice always right there. Accepting a
 * break earns a short confirmation — a small, honest reward for stepping away.
 */
export function InterruptModal({
  active,
  onClose,
}: {
  active: ActiveIntervention | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<'prompt' | 'confirm'>('prompt');
  const [accepted, setAccepted] = useState(0);

  useEffect(() => {
    if (active) setView('prompt');
  }, [active]);

  const decision = active?.decision;

  function choose(opt: InterventionOption) {
    if (!active) return;
    recordResponse(active.id, opt.response);
    if (opt.response === 'accepted_break') {
      setAccepted(getBreakAcceptanceStats().accepted);
      setView('confirm');
    } else {
      onClose();
    }
  }

  return (
    <Modal
      visible={!!active}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + space.xxxl }]}>
        {active && decision && view === 'prompt' && (
          <View style={styles.body}>
            <Text style={styles.eyebrow}>{EYEBROW[decision.level] ?? 'A MOMENT'}</Text>
            <Text style={styles.title}>{decision.title}</Text>
            <Text style={styles.message}>{decision.body}</Text>

            <View style={styles.actions}>
              {decision.options.map((opt, i) => (
                <TouchableOpacity
                  key={opt.response}
                  style={[styles.btn, i === 0 ? styles.btnPrimary : styles.btnGhost]}
                  activeOpacity={0.8}
                  onPress={() => choose(opt)}>
                  <Text style={i === 0 ? styles.btnPrimaryText : styles.btnGhostText}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {view === 'confirm' && (
          <View style={styles.body}>
            <Text style={styles.eyebrow}>NICE ONE</Text>
            <Text style={styles.title}>You stepped away.</Text>
            <Text style={styles.message}>
              A small win — your attention is yours again. Azm will keep quiet for a while.
            </Text>
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
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: space.xxl,
  },
  body: { flex: 1, justifyContent: 'center', paddingBottom: space.xxxl * 2 },
  eyebrow: {
    ...type.eyebrow,
    color: colors.accent,
    marginBottom: space.lg,
  },
  title: { ...type.display, fontSize: 30, lineHeight: 38 },
  message: {
    ...type.body,
    fontSize: 17,
    lineHeight: 26,
    color: colors.inkSoft,
    marginTop: space.lg,
  },
  count: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.inkFaint,
    marginTop: space.xl,
  },
  actions: { marginTop: space.xxxl },
  btn: {
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: space.md,
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.white, fontWeight: '600', fontSize: 16 },
  btnGhost: { backgroundColor: 'transparent' },
  btnGhostText: { color: colors.inkSoft, fontWeight: '600', fontSize: 15 },
});