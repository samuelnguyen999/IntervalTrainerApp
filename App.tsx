import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MinuteWheel from './components/MinuteWheel';
import {
  type IntervalConfig,
  CYCLE_SECONDS,
  SHORT_CYCLE_SECONDS,
  DEFAULT_CONFIG,
  configFromWorkSeconds,
  currentElapsedMs,
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

  useEffect(() => {
    if (!running) {
      return;
    }

    const id = setInterval(() => {
      setNow(Date.now());
    }, 100);

    return () => clearInterval(id);
  }, [running]);

  const elapsedMs = currentElapsedMs(elapsedBeforeMs, segmentStartedAt, running, now);
  const snapshot = snapshotFromElapsed(elapsedMs, config);
  const primaryLabel = running ? 'PAUSE' : elapsedMs > 0 ? 'RESUME' : 'START';

  function onPrimaryPress() {
    if (running && segmentStartedAt != null) {
      setElapsedBeforeMs(currentElapsedMs(elapsedBeforeMs, segmentStartedAt, true, Date.now()));
      setSegmentStartedAt(null);
      setRunning(false);
      return;
    }

    const timestamp = Date.now();
    setSegmentStartedAt(timestamp);
    setNow(timestamp);
    setRunning(true);
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
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 7,
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
