import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MinuteWheel from './components/MinuteWheel';
import SetSegments from './components/SetSegments';
import {
  type IntervalConfig,
  CYCLE_SECONDS,
  SHORT_CYCLE_SECONDS,
  DEFAULT_CONFIG,
  DEFAULT_SET_COUNT,
  completedSnapshot,
  configFromWorkSeconds,
  currentElapsedMs,
  sessionLimitMs,
  snapshotFromElapsed,
} from './timerEngine';

const { width, height } = Dimensions.get('window');
const ringSize = Math.min(width * 0.9, height * 0.56);

const PILL_THUMB_TRAVEL = 52;

function CycleToggle({
  cycleSeconds,
  onChange,
}: {
  cycleSeconds: number;
  onChange: (cycleSeconds: number) => void;
}) {
  const selected = useSharedValue(cycleSeconds === SHORT_CYCLE_SECONDS ? 1 : 0);

  useEffect(() => {
    selected.value = withTiming(cycleSeconds === SHORT_CYCLE_SECONDS ? 1 : 0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [cycleSeconds, selected]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: selected.value * PILL_THUMB_TRAVEL }],
  }));
  const minuteLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(selected.value, [0, 1], ['#0C0C0E', '#8E8E93']),
  }));
  const halfLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(selected.value, [0, 1], ['#8E8E93', '#0C0C0E']),
  }));

  return (
    <View testID="cycle-toggle" style={styles.pill}>
      <Animated.View style={[styles.pillThumb, thumbStyle]} />
      <Pressable accessibilityRole="button" testID="cycle-60" onPress={() => onChange(CYCLE_SECONDS)} style={styles.pillHalf}>
        <Animated.Text style={[styles.pillLabel, minuteLabelStyle]}>1:00</Animated.Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        testID="cycle-30"
        onPress={() => onChange(SHORT_CYCLE_SECONDS)}
        style={styles.pillHalf}
      >
        <Animated.Text style={[styles.pillLabel, halfLabelStyle]}>0:30</Animated.Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <TimerScreen />
    </SafeAreaProvider>
  );
}

function TimerScreen() {
  const insets = useSafeAreaInsets();
  const [running, setRunning] = useState(false);
  const [elapsedBeforeMs, setElapsedBeforeMs] = useState(0);
  const [segmentStartedAt, setSegmentStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [config, setConfig] = useState<IntervalConfig>(DEFAULT_CONFIG);
  const [workFraction, setWorkFraction] = useState(DEFAULT_CONFIG.workSeconds / DEFAULT_CONFIG.cycleSeconds);
  const [setCount, setSetCount] = useState(DEFAULT_SET_COUNT);
  const [finished, setFinished] = useState(false);
  const finishedRef = useRef(false);
  const elapsedBeforeRef = useRef(elapsedBeforeMs);
  const segmentStartedAtRef = useRef(segmentStartedAt);
  const runningRef = useRef(running);
  const setCountRef = useRef(setCount);
  const configRef = useRef(config);

  elapsedBeforeRef.current = elapsedBeforeMs;
  segmentStartedAtRef.current = segmentStartedAt;
  runningRef.current = running;
  setCountRef.current = setCount;
  configRef.current = config;

  function finishSession() {
    if (finishedRef.current) {
      return;
    }
    const limit = sessionLimitMs(setCountRef.current, configRef.current);
    finishedRef.current = true;
    setFinished(true);
    setElapsedBeforeMs(limit);
    setSegmentStartedAt(null);
    setRunning(false);
    setNow(Date.now());
  }

  useEffect(() => {
    const id = setInterval(() => {
      const timestamp = Date.now();
      if (!runningRef.current || segmentStartedAtRef.current == null || finishedRef.current) {
        return;
      }
      const elapsed = currentElapsedMs(elapsedBeforeRef.current, segmentStartedAtRef.current, true, timestamp);
      if (elapsed >= sessionLimitMs(setCountRef.current, configRef.current)) {
        finishSession();
        return;
      }
      setNow(timestamp);
    }, 100);

    return () => clearInterval(id);
  }, []);

  const limitMs = sessionLimitMs(setCount, config);
  const elapsedMs = currentElapsedMs(elapsedBeforeMs, segmentStartedAt, running, now);
  const complete = finished || elapsedMs >= limitMs;
  const snapshot = complete ? completedSnapshot(config, setCount) : snapshotFromElapsed(elapsedMs, config);
  const filledSets = complete ? setCount : Math.min(snapshot.round, setCount);
  const primaryLabel = finished ? 'COMPLETE' : running ? 'PAUSE' : elapsedMs > 0 ? 'RESUME' : 'START';

  function onReachEnd() {
    finishSession();
  }

  function onPrimaryPress() {
    if (finishedRef.current) {
      return;
    }

    if (running && segmentStartedAt != null) {
      const elapsed = currentElapsedMs(elapsedBeforeMs, segmentStartedAt, true, Date.now());
      const limit = sessionLimitMs(setCount, config);
      if (elapsed >= limit) {
        finishSession();
        return;
      }
      setElapsedBeforeMs(elapsed);
      setSegmentStartedAt(null);
      setRunning(false);
      return;
    }

    const timestamp = Date.now();
    setSegmentStartedAt(timestamp);
    setNow(timestamp);
    setRunning(true);
  }

  function onSetCountChange(nextCount: number) {
    setSetCount(nextCount);
    const limit = sessionLimitMs(nextCount, config);
    const elapsed = currentElapsedMs(elapsedBeforeMs, segmentStartedAt, running, Date.now());
    if (elapsed < limit && finishedRef.current) {
      finishedRef.current = false;
      setFinished(false);
    }
  }

  function onWorkSecondsChange(workSeconds: number) {
    const next = configFromWorkSeconds(workSeconds, config.cycleSeconds);
    setWorkFraction(next.workSeconds / next.cycleSeconds);
    setConfig(next);
  }

  function onCycleChange(cycleSeconds: number) {
    if (config.cycleSeconds === cycleSeconds) {
      return;
    }
    setConfig(configFromWorkSeconds(workFraction * cycleSeconds, cycleSeconds));
  }

  function onReset() {
    finishedRef.current = false;
    setFinished(false);
    setRunning(false);
    setElapsedBeforeMs(0);
    setSegmentStartedAt(null);
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <View style={[styles.cycleSlot, { top: insets.top + 12 }]}>
          <CycleToggle cycleSeconds={config.cycleSeconds} onChange={onCycleChange} />
        </View>
        <View style={[styles.setSlot, { top: insets.top + 54 }]}>
          <SetSegments count={setCount} filled={filledSets} onSelect={onSetCountChange} />
        </View>
        <View style={styles.upper}>
          <Text testID="phase-label" style={[styles.phase, snapshot.phase === 'REST' && styles.restPhase]}>
            {snapshot.phase}
          </Text>
        </View>
        <MinuteWheel
          size={ringSize}
          running={running}
          elapsedBeforeMs={elapsedBeforeMs}
          segmentStartedAt={segmentStartedAt}
          remainingSeconds={snapshot.remainingSeconds}
          config={config}
          elapsedLimitMs={limitMs}
          onReachEnd={onReachEnd}
          onWorkSecondsChange={onWorkSecondsChange}
        />
          <View style={styles.lower}>
            <Text style={styles.round}>ROUND {snapshot.round}</Text>
            <Pressable accessibilityRole="button" onPress={onPrimaryPress} style={styles.startButton}>
              <Text style={styles.startLabel}>{primaryLabel}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onReset} style={styles.resetButton}>
              <Text style={styles.resetLabel}>RESET</Text>
            </Pressable>
          </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0C0C0E',
  },
  cycleSlot: {
    position: 'absolute',
    right: 16,
    zIndex: 2,
  },
  setSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1E',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(244, 241, 234, 0.16)',
    padding: 3,
  },
  pillHalf: {
    width: 52,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  pillThumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    width: 52,
    borderRadius: 999,
    backgroundColor: '#F4F1EA',
    pointerEvents: 'none',
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  upper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 22,
  },
  phase: {
    color: '#E06A28',
    fontSize: 42,
    fontWeight: '600',
    letterSpacing: 9,
  },
  restPhase: {
    color: '#6BA4D0',
  },
  lower: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 22,
  },
  round: {
    color: '#8E8E93',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 4,
  },
  startButton: {
    marginTop: 28,
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 56,
    borderRadius: 999,
  },
  startLabel: {
    color: '#0C0C0E',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 3,
  },
  resetButton: {
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  resetLabel: {
    color: '#A1A1A6',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 3,
  },
});
