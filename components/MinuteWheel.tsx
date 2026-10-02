import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import {
  MIN_WORK_SECONDS,
  type IntervalConfig,
  clockTurnsFromOffset,
  currentElapsedMs,
  snapshotFromElapsed,
  unwrapClockTurns,
  workSecondsFromTurns,
} from '../timerEngine';

const WORK_STOPS = ['#C4A06A', '#E06A28', '#C2410C'] as const;
const REST_STOPS = ['#6BA4D0', '#3A6894', '#1A2C40'] as const;
const MARK = '#F4F1EA';
const IVORY = '#F7F6F3';
const STROKE_WIDTH = 20;
const OUTER_PAD = 30;
const TICKER_INSET = 8;
const TICKER_OUTSET = 8;
const TICKER_WIDTH = 1.15;
const BOUNDARY_WIDTH = 1.65;
const HANDLE_RADIUS = 5.2;
const HANDLE_RADIUS_ACTIVE = 6.3;
const HANDLE_OUTSET = 13;
const BOUNDARY_HIT_RADIUS = 52;

const Ticker = Animated.createAnimatedComponent(Line);
const Trail = Animated.createAnimatedComponent(Path);

type MinuteWheelProps = {
  size: number;
  running: boolean;
  elapsedBeforeMs: number;
  segmentStartedAt: number | null;
  remainingSeconds: number;
  config: IntervalConfig;
  onWorkSecondsChange: (workSeconds: number) => void;
};

type Rgb = [number, number, number];

function pointOnClock(cx: number, cy: number, radius: number, turns: number) {
  const angle = turns * Math.PI * 2;
  return {
    x: cx + radius * Math.sin(angle),
    y: cy - radius * Math.cos(angle),
  };
}

function clockArc(cx: number, cy: number, radius: number, startTurn: number, endTurn: number) {
  const sweep = endTurn - startTurn;
  if (sweep <= 0.0001) {
    return '';
  }

  const start = pointOnClock(cx, cy, radius, startTurn);
  const end = pointOnClock(cx, cy, radius, endTurn);
  const largeArc = sweep > 0.5 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function hexToRgb(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function mixColor(from: string, to: string, amount: number) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const mixed = start.map((channel, index) => Math.round(channel + (end[index] - channel) * amount));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function colorAlong(stops: readonly [string, string, string], amount: number) {
  const t = Math.min(1, Math.max(0, amount));
  if (t <= 0.5) {
    return mixColor(stops[0], stops[1], t / 0.5);
  }
  return mixColor(stops[1], stops[2], (t - 0.5) / 0.5);
}

function sectionArc(
  cx: number,
  cy: number,
  ringRadius: number,
  startTurn: number,
  endTurn: number,
  opacity: number,
) {
  'worklet';
  const startAngle = startTurn * Math.PI * 2;
  const startX = cx + ringRadius * Math.sin(startAngle);
  const startY = cy - ringRadius * Math.cos(startAngle);
  const sweep = endTurn - startTurn;
  if (sweep < 0.004 || opacity <= 0.02) {
    return { d: `M ${startX} ${startY}`, opacity: 0 };
  }

  const endAngle = endTurn * Math.PI * 2;
  const endX = cx + ringRadius * Math.sin(endAngle);
  const endY = cy - ringRadius * Math.cos(endAngle);
  const largeArc = sweep > 0.5 ? 1 : 0;
  return {
    d: `M ${startX} ${startY} A ${ringRadius} ${ringRadius} 0 ${largeArc} 1 ${endX} ${endY}`,
    opacity,
  };
}

function workGloss(progress: number, split: number) {
  'worklet';
  const end = Math.min(progress, split);
  if (end < 0.004) {
    return { start: 0, end: 0, opacity: 0 };
  }
  if (progress <= split) {
    return { start: 0, end, opacity: 1 };
  }
  const restT = (progress - split) / Math.max(0.001, 1 - split);
  return { start: 0, end: split, opacity: Math.max(0, 1 - restT / 0.75) };
}

function restGloss(progress: number, split: number, held: number) {
  'worklet';
  if (progress > split + 0.004) {
    return { start: split, end: Math.min(progress, 0.999), opacity: 1 };
  }
  if (held < 0.5 || split <= 0.004 || split >= 0.999) {
    return { start: 0, end: 0, opacity: 0 };
  }
  const through = progress / split;
  const opacity = through <= 0.15 ? 1 : Math.max(0, 1 - (through - 0.15) / 0.5);
  if (opacity <= 0.02) {
    return { start: 0, end: 0, opacity: 0 };
  }
  return { start: split, end: 1, opacity };
}

function arcSegments(
  cx: number,
  cy: number,
  radius: number,
  startTurn: number,
  endTurn: number,
  stops: readonly [string, string, string],
) {
  const span = endTurn - startTurn;
  if (span <= 0.0001) {
    return [];
  }

  const count = Math.max(12, Math.round(span * 140));
  const segments = [];
  for (let index = 0; index < count; index += 1) {
    const start = startTurn + (span * index) / count;
    let end = startTurn + (span * (index + 1)) / count;
    if (index < count - 1) {
      end += 0.003;
    }
    segments.push({
      key: `${index}`,
      d: clockArc(cx, cy, radius, start, end),
      color: colorAlong(stops, (index + 0.5) / count),
    });
  }
  return segments;
}

export default function MinuteWheel({
  size,
  running,
  elapsedBeforeMs,
  segmentStartedAt,
  remainingSeconds,
  config,
  onWorkSecondsChange,
}: MinuteWheelProps) {
  const center = size / 2;
  const radius = size / 2 - OUTER_PAD - STROKE_WIDTH / 2;
  const ringInner = radius - STROKE_WIDTH / 2;
  const ringOuter = radius + STROKE_WIDTH / 2;
  const committedTurns = config.workSeconds / config.cycleSeconds;
  const [visualTurns, setVisualTurns] = useState(committedTurns);
  const [dragging, setDragging] = useState(false);
  const progress = useSharedValue(0);
  const boundary = useSharedValue(committedTurns);
  const cycleWrapped = useSharedValue(0);
  const handleOrbit = ringOuter + HANDLE_OUTSET;
  const geometry = useRef({ center, handleOrbit });
  const workSecondsRef = useRef(config.workSeconds);
  const cycleSecondsRef = useRef(config.cycleSeconds);
  const dragTurnsRef = useRef(committedTurns);
  const draggingRef = useRef(false);
  const onWorkSecondsChangeRef = useRef(onWorkSecondsChange);
  const configRef = useRef(config);

  geometry.current = { center, handleOrbit };
  workSecondsRef.current = config.workSeconds;
  cycleSecondsRef.current = config.cycleSeconds;
  onWorkSecondsChangeRef.current = onWorkSecondsChange;
  configRef.current = config;

  useEffect(() => {
    if (!draggingRef.current) {
      setVisualTurns(config.workSeconds / config.cycleSeconds);
    }
  }, [config.cycleSeconds, config.workSeconds]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        const { center: cx, handleOrbit: orbit } = geometry.current;
        const cycleSeconds = cycleSecondsRef.current;
        const handle = pointOnClock(cx, cx, orbit, workSecondsRef.current / cycleSeconds);
        const dx = locationX - handle.x;
        const dy = locationY - handle.y;
        return dx * dx + dy * dy <= BOUNDARY_HIT_RADIUS * BOUNDARY_HIT_RADIUS;
      },
      onPanResponderGrant: () => {
        draggingRef.current = true;
        dragTurnsRef.current = workSecondsRef.current / cycleSecondsRef.current;
        setDragging(true);
      },
      onPanResponderMove: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        const { center: cx } = geometry.current;
        const rawTurns = clockTurnsFromOffset(locationX - cx, locationY - cx);
        const unwrapped = unwrapClockTurns(rawTurns, dragTurnsRef.current);
        dragTurnsRef.current = unwrapped;
        const cycleSeconds = cycleSecondsRef.current;
        const minTurns = MIN_WORK_SECONDS / cycleSeconds;
        const maxTurns = (cycleSeconds - MIN_WORK_SECONDS) / cycleSeconds;
        setVisualTurns(Math.min(maxTurns, Math.max(minTurns, unwrapped)));
        const next = workSecondsFromTurns(unwrapped, cycleSeconds);
        if (next !== workSecondsRef.current) {
          workSecondsRef.current = next;
          onWorkSecondsChangeRef.current(next);
        }
      },
      onPanResponderRelease: () => {
        draggingRef.current = false;
        setDragging(false);
        setVisualTurns(workSecondsRef.current / cycleSecondsRef.current);
        dragTurnsRef.current = workSecondsRef.current / cycleSecondsRef.current;
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false;
        setDragging(false);
        setVisualTurns(workSecondsRef.current / cycleSecondsRef.current);
        dragTurnsRef.current = workSecondsRef.current / cycleSecondsRef.current;
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  useEffect(() => {
    let frame = 0;

    const sample = () => {
      const elapsedMs = currentElapsedMs(elapsedBeforeMs, segmentStartedAt, running, Date.now());
      const next = snapshotFromElapsed(elapsedMs, configRef.current).cycleProgress;
      const split = configRef.current.workSeconds / configRef.current.cycleSeconds;
      const previous = progress.value;
      boundary.value = split;
      if (elapsedBeforeMs === 0 && !running) {
        cycleWrapped.value = 0;
      } else if (previous > split + 0.02 && next < 0.08) {
        cycleWrapped.value = 1;
      } else if (next >= split) {
        cycleWrapped.value = 0;
      } else if (cycleWrapped.value === 1 && split > 0 && next / split > 0.7) {
        cycleWrapped.value = 0;
      }
      progress.value = next;
    };

    sample();

    if (!running) {
      return;
    }

    const loop = () => {
      sample();
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [elapsedBeforeMs, progress, running, segmentStartedAt]);

  const tickerProps = useAnimatedProps(() => {
    const angle = progress.value * Math.PI * 2;
    const inner = radius - STROKE_WIDTH / 2 - TICKER_INSET;
    const outer = radius + STROKE_WIDTH / 2 + TICKER_OUTSET;
    const sine = Math.sin(angle);
    const cosine = Math.cos(angle);
    return {
      x1: center + inner * sine,
      y1: center - inner * cosine,
      x2: center + outer * sine,
      y2: center - outer * cosine,
    };
  });

  const workWashProps = useAnimatedProps(() => {
    const gloss = workGloss(progress.value, boundary.value);
    return sectionArc(center, center, radius, gloss.start, gloss.end, gloss.opacity);
  });

  const workTraceProps = useAnimatedProps(() => {
    const gloss = workGloss(progress.value, boundary.value);
    const traceRadius = radius - STROKE_WIDTH / 2 + 4.5;
    return sectionArc(center, center, traceRadius, gloss.start, gloss.end, gloss.opacity);
  });

  const restWashProps = useAnimatedProps(() => {
    const gloss = restGloss(progress.value, boundary.value, cycleWrapped.value);
    return sectionArc(center, center, radius, gloss.start, gloss.end, gloss.opacity);
  });

  const restTraceProps = useAnimatedProps(() => {
    const gloss = restGloss(progress.value, boundary.value, cycleWrapped.value);
    const traceRadius = radius - STROKE_WIDTH / 2 + 4.5;
    return sectionArc(center, center, traceRadius, gloss.start, gloss.end, gloss.opacity);
  });

  const workSegments = arcSegments(center, center, radius, 0, visualTurns, WORK_STOPS);
  const restSegments = arcSegments(center, center, radius, visualTurns, 1, REST_STOPS);
  const numberSize = Math.round(size * 0.32);
  const numberLine = numberSize;
  const opticalDrop = Math.round(numberSize * 0.05);
  const horizontalNudge = Math.round(numberSize * 0.03);
  const secondsSize = Math.max(11, Math.round(numberSize * 0.18));
  const splitGap = Math.round(size * 0.015);
  const splitValueSize = Math.max(16, Math.round(size * 0.05));
  const splitLabelSize = Math.max(9, Math.round(size * 0.027));
  const labelGap = Math.round(numberSize * 0.08);
  const labelLift = Math.round((numberSize - secondsSize) * 0.2);
  const numberHalf = String(remainingSeconds).length * numberSize * 0.28;
  const spokeInner = ringInner - TICKER_INSET;
  const handleRadius = dragging ? HANDLE_RADIUS_ACTIVE : HANDLE_RADIUS;
  const spokeStart = pointOnClock(center, center, spokeInner, visualTurns);
  const handle = pointOnClock(center, center, handleOrbit, visualTurns);
  const spokeEnd = pointOnClock(center, center, handleOrbit - handleRadius, visualTurns);
  const sheenRadius = ringOuter - 3.4;

  return (
    <View testID="minute-wheel" style={[styles.wheel, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={radius} stroke="#060608" strokeWidth={STROKE_WIDTH + 4} fill="none" />
        {workSegments.map((segment) => (
          <Path key={`work-${segment.key}`} d={segment.d} stroke={segment.color} strokeWidth={STROKE_WIDTH} fill="none" />
        ))}
        {restSegments.map((segment) => (
          <Path key={`rest-${segment.key}`} d={segment.d} stroke={segment.color} strokeWidth={STROKE_WIDTH} fill="none" />
        ))}
        <Trail
          testID="minute-trail"
          animatedProps={workWashProps}
          stroke="rgba(255, 250, 244, 0.22)"
          strokeWidth={8}
          fill="none"
          strokeLinecap="butt"
        />
        <Trail
          animatedProps={workTraceProps}
          stroke="rgba(255, 252, 246, 0.7)"
          strokeWidth={1.7}
          fill="none"
          strokeLinecap="butt"
        />
        <Trail
          animatedProps={restWashProps}
          stroke="rgba(255, 250, 244, 0.22)"
          strokeWidth={8}
          fill="none"
          strokeLinecap="butt"
        />
        <Trail
          animatedProps={restTraceProps}
          stroke="rgba(255, 252, 246, 0.7)"
          strokeWidth={1.7}
          fill="none"
          strokeLinecap="butt"
        />
        <Circle
          cx={center}
          cy={center}
          r={ringOuter - 1}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={1.15}
          fill="none"
        />
        <Path
          d={clockArc(center, center, sheenRadius, 0.88, 1)}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={clockArc(center, center, sheenRadius, 0, 0.1)}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        <Ticker
          testID="minute-ticker"
          animatedProps={tickerProps}
          stroke="rgba(247, 246, 243, 0.92)"
          strokeWidth={TICKER_WIDTH}
          strokeLinecap="round"
        />
        <Line
          x1={spokeStart.x}
          y1={spokeStart.y}
          x2={spokeEnd.x}
          y2={spokeEnd.y}
          stroke={MARK}
          strokeWidth={BOUNDARY_WIDTH}
          strokeLinecap="round"
        />
        <Circle
          testID="boundary-handle"
          cx={handle.x}
          cy={handle.y}
          r={handleRadius}
          fill={MARK}
          stroke="rgba(12, 12, 14, 0.45)"
          strokeWidth={0.6}
        />
      </Svg>
      <View style={styles.gesture} {...panResponder.panHandlers} />
      <View style={styles.readout}>
        <View
          style={[
            styles.counter,
            {
              marginTop: -numberLine / 2 + opticalDrop,
              height: numberLine,
              transform: [{ translateX: -horizontalNudge }],
            },
          ]}
        >
          <Text
            testID="remaining-seconds"
            style={[styles.seconds, { fontSize: numberSize, lineHeight: numberLine }]}
          >
            {remainingSeconds}
          </Text>
          <Text
            style={[
              styles.secondsLabel,
              {
                marginLeft: numberHalf + labelGap,
                bottom: labelLift,
                fontSize: secondsSize,
                lineHeight: secondsSize,
              },
            ]}
          >
            s
          </Text>
        </View>
        <View style={[styles.split, { marginTop: numberLine / 2 + splitGap }]}>
          <View style={styles.splitColumn}>
            <Text testID="work-split" style={[styles.workValue, { fontSize: splitValueSize }]}>
              {config.workSeconds}
            </Text>
            <Text style={[styles.workLabel, { fontSize: splitLabelSize }]}>WORK</Text>
          </View>
          <Text style={[styles.slash, { fontSize: splitValueSize - 2 }]}>/</Text>
          <View style={styles.splitColumn}>
            <Text testID="rest-split" style={[styles.restValue, { fontSize: splitValueSize }]}>
              {config.restSeconds}
            </Text>
            <Text style={[styles.restLabel, { fontSize: splitLabelSize }]}>REST</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: {
    alignSelf: 'center',
  },
  gesture: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  readout: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
  },
  counter: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seconds: {
    color: IVORY,
    fontWeight: '500',
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    alignSelf: 'stretch',
    includeFontPadding: false,
  },
  secondsLabel: {
    position: 'absolute',
    left: '50%',
    color: '#8F8C86',
    fontWeight: '500',
    includeFontPadding: false,
  },
  split: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  splitColumn: {
    alignItems: 'center',
    minWidth: 40,
  },
  workValue: {
    color: WORK_STOPS[2],
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  restValue: {
    color: REST_STOPS[0],
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  slash: {
    color: '#6E6E73',
    fontWeight: '500',
    marginTop: 1,
    marginHorizontal: 10,
  },
  workLabel: {
    color: WORK_STOPS[2],
    fontWeight: '600',
    letterSpacing: 1.4,
    marginTop: 2,
  },
  restLabel: {
    color: REST_STOPS[0],
    fontWeight: '600',
    letterSpacing: 1.4,
    marginTop: 2,
  },
});
