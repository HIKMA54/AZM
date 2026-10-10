import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, space, radius, type } from '../theme/theme';

/** Paced breathing: 4 s in, 6 s out. A longer exhale is the usual calming ratio. */
const INHALE_MS = 4000;
const EXHALE_MS = 6000;
const CYCLE_MS = INHALE_MS + EXHALE_MS;

const MIN_SCALE = 0.55;
const MAX_SCALE = 1;

/**
 * A one-minute guided breathing pause, offered on the interrupt as something to
 * do instead of scrolling. A circle grows on the in-breath and shrinks on the
 * out-breath, with the phase written underneath so it works without sound.
 * Finishing early is always allowed; nothing here is gated.
 */
export function BreathingExercise({
  durationSec = 60,
  onDone,
}: {
  durationSec?: number;
  onDone: () => void;
}) {
  const scale = useRef(new Animated.Value(MIN_SCALE)).current;
  const [elapsedMs, setElapsedMs] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: MAX_SCALE,
          duration: INHALE_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: MIN_SCALE,
          duration: EXHALE_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    const startedAt = Date.now();
    const tick = setInterval(() => setElapsedMs(Date.now() - startedAt), 250);

    return () => {
      loop.stop();
      clearInterval(tick);
    };
  }, [scale]);

  const totalMs = durationSec * 1000;
  const finished = elapsedMs >= totalMs;

  useEffect(() => {
    if (finished && !doneRef.current) {
      doneRef.current = true;
      onDone();
    }
  }, [finished, onDone]);

  const inhaling = elapsedMs % CYCLE_MS < INHALE_MS;
  const secondsLeft = Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000));

  function finishEarly() {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }

  return (
    <View style={styles.root}>
      <Text style={styles.eyebrow}>ONE MINUTE</Text>

      <View style={styles.stage}>
        <Animated.View style={[styles.circle, { transform: [{ scale }] }]} />
      </View>

      <Text style={styles.phase}>{inhaling ? 'Breathe in' : 'Breathe out'}</Text>
      <Text style={styles.timer}>{secondsLeft}s</Text>

      <TouchableOpacity style={styles.btn} activeOpacity={0.8} onPress={finishEarly}>
        <Text style={styles.btnText}>Finish early</Text>
      </TouchableOpacity>
    </View>
  );
}

const CIRCLE = 220;

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: space.xxxl * 2 },
  eyebrow: { ...type.eyebrow, color: colors.accent, marginBottom: space.xxl },
  stage: { width: CIRCLE, height: CIRCLE, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: colors.accentSoft,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  phase: { ...type.display, marginTop: space.xxl },
  timer: { fontFamily: 'monospace', fontSize: 14, color: colors.inkFaint, marginTop: space.sm },
  btn: {
    marginTop: space.xxxl,
    paddingVertical: 14,
    paddingHorizontal: space.xxl,
    borderRadius: radius.md,
  },
  btnText: { color: colors.inkSoft, fontWeight: '600', fontSize: 15 },
});
