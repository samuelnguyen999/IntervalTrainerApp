import { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MAX_SET_COUNT, MIN_SET_COUNT } from '../timerEngine';

const ITEM_HEIGHT = 40;
const WHEEL_SPAN = 5;
const SEGMENT_GAP = 7;
const SEGMENT_TRACK = Math.min(Dimensions.get('window').width * 0.78, 320);

function segmentWidth(count: number) {
  return (SEGMENT_TRACK - SEGMENT_GAP * Math.max(0, count - 1)) / count;
}
const SET_NUMBERS = Array.from({ length: MAX_SET_COUNT - MIN_SET_COUNT + 1 }, (_, index) => MIN_SET_COUNT + index);

type SetSegmentsProps = {
  count: number;
  filled: number;
  onSelect: (setCount: number) => void;
};

function setCountFromOffset(offsetY: number): number {
  const index = Math.round(offsetY / ITEM_HEIGHT);
  return Math.min(MAX_SET_COUNT, Math.max(MIN_SET_COUNT, MIN_SET_COUNT + index));
}

function SetBar({ lit, width }: { lit: boolean; width: number }) {
  const glow = useSharedValue(lit ? 1 : 0);
  const wasLit = useRef(lit);

  useEffect(() => {
    if (lit && !wasLit.current) {
      glow.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) });
    } else if (!lit) {
      glow.value = 0;
    }
    wasLit.current = lit;
  }, [glow, lit]);

  const greenStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  return (
    <View style={[styles.slot, { width }]}>
      <View style={[styles.rim, styles.rimWaiting]}>
        <View style={[styles.body, styles.bodyWaiting]}>
          <View style={styles.sheen} />
        </View>
      </View>
      <Animated.View style={[styles.greenLayer, greenStyle]}>
        <View style={styles.glow} />
        <View style={[styles.rim, styles.rimLit]}>
          <View style={[styles.body, styles.bodyLit]}>
            <View style={styles.litWash} />
            <View style={[styles.sheen, styles.sheenLit]} />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

export default function SetSegments({ count, filled, onSelect }: SetSegmentsProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(count);
  const highlightedRef = useRef(count);

  function showHighlighted(next: number) {
    if (highlightedRef.current === next) {
      return;
    }
    highlightedRef.current = next;
    setHighlighted(next);
  }

  function commit(next: number) {
    showHighlighted(next);
    onSelect(next);
  }

  function openWheel() {
    highlightedRef.current = count;
    setHighlighted(count);
    setOpen(true);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${count} sets`}
        testID="set-segments"
        onPress={openWheel}
        style={styles.rowHit}
      >
        <View style={styles.row}>
          {Array.from({ length: count }, (_, index) => (
            <View key={index} testID={`set-segment-${index + 1}`}>
              <SetBar lit={index < filled} width={segmentWidth(count)} />
            </View>
          ))}
        </View>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <Pressable accessibilityLabel="Close set picker" style={styles.backdrop} onPress={() => setOpen(false)} />
          <View testID="set-wheel" style={styles.wheelCard}>
            <ScrollView
              style={styles.wheel}
              contentContainerStyle={styles.wheelContent}
              contentOffset={{ x: 0, y: (count - MIN_SET_COUNT) * ITEM_HEIGHT }}
              snapToInterval={ITEM_HEIGHT}
              snapToAlignment="start"
              disableIntervalMomentum
              decelerationRate="fast"
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(event) => showHighlighted(setCountFromOffset(event.nativeEvent.contentOffset.y))}
              onScrollEndDrag={(event) => {
                const velocity = event.nativeEvent.velocity?.y ?? 0;
                if (Math.abs(velocity) > 0.05) {
                  return;
                }
                commit(setCountFromOffset(event.nativeEvent.contentOffset.y));
              }}
              onMomentumScrollEnd={(event) => commit(setCountFromOffset(event.nativeEvent.contentOffset.y))}
            >
              {SET_NUMBERS.map((setNumber) => {
                const distance = Math.abs(setNumber - highlighted);
                return (
                  <View key={setNumber} style={styles.wheelItem}>
                    <Text
                      style={[
                        styles.wheelValue,
                        distance === 0 && styles.wheelValueOn,
                        distance === 1 && styles.wheelValueNear,
                        distance > 1 && styles.wheelValueFar,
                      ]}
                    >
                      {setNumber}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.selection} pointerEvents="none">
              <Text style={styles.setsLabel}>SETS</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  rowHit: {
    paddingVertical: 25,
    paddingHorizontal: 18,
  },
  row: {
    width: SEGMENT_TRACK,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SEGMENT_GAP,
  },
  slot: {
    height: 12,
    justifyContent: 'center',
  },
  greenLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
  },
  glow: {
    position: 'absolute',
    left: -2,
    right: -2,
    top: -3,
    bottom: -3,
    backgroundColor: 'rgba(70, 214, 126, 0.38)',
  },
  rim: {
    flex: 1,
    padding: 1,
  },
  rimLit: {
    backgroundColor: '#08331C',
    shadowColor: '#46E08A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 6,
  },
  rimWaiting: {
    backgroundColor: '#101012',
  },
  body: {
    flex: 1,
    overflow: 'hidden',
  },
  bodyLit: {
    backgroundColor: '#1F9A52',
  },
  bodyWaiting: {
    backgroundColor: '#3A3A40',
  },
  litWash: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '58%',
    backgroundColor: 'rgba(150, 236, 186, 0.42)',
  },
  sheen: {
    position: 'absolute',
    left: 1,
    right: 1,
    top: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  sheenLit: {
    backgroundColor: 'rgba(244, 255, 248, 0.72)',
  },
  modal: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  wheelCard: {
    width: 168,
    height: ITEM_HEIGHT * WHEEL_SPAN,
    borderRadius: 18,
    backgroundColor: '#16161A',
    borderWidth: 1,
    borderColor: 'rgba(244, 241, 234, 0.14)',
    overflow: 'hidden',
  },
  wheel: {
    height: ITEM_HEIGHT * WHEEL_SPAN,
  },
  wheelContent: {
    paddingVertical: ITEM_HEIGHT * 2,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelValue: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  wheelValueOn: {
    color: '#F7F6F3',
    fontSize: 28,
  },
  wheelValueNear: {
    color: '#8E8E93',
    fontSize: 20,
  },
  wheelValueFar: {
    color: '#4A4A4E',
    fontSize: 16,
  },
  selection: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: ITEM_HEIGHT * 2,
    height: ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(244, 241, 234, 0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    pointerEvents: 'none',
  },
  setsLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.6,
  },
});
