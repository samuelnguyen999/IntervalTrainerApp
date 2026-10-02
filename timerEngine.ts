export const CYCLE_SECONDS = 60;
export const WORK_SECONDS = 45;
export const REST_SECONDS = 15;
export const MIN_WORK_SECONDS = 5;
export const MAX_WORK_SECONDS = CYCLE_SECONDS - MIN_WORK_SECONDS;

export type Phase = 'WORK' | 'REST';

export type IntervalConfig = {
  cycleSeconds: number;
  workSeconds: number;
  restSeconds: number;
};

export const DEFAULT_CONFIG: IntervalConfig = {
  cycleSeconds: CYCLE_SECONDS,
  workSeconds: WORK_SECONDS,
  restSeconds: REST_SECONDS,
};

export type TimerSnapshot = {
  phase: Phase;
  round: number;
  remainingMs: number;
  remainingSeconds: number;
  cycleElapsed: number;
  cycleProgress: number;
  phaseProgress: number;
};

export function configFromWorkSeconds(
  workSeconds: number,
  cycleSeconds: number = CYCLE_SECONDS,
): IntervalConfig {
  const maxWork = cycleSeconds - MIN_WORK_SECONDS;
  const work = Math.min(maxWork, Math.max(MIN_WORK_SECONDS, Math.round(workSeconds)));
  return {
    cycleSeconds,
    workSeconds: work,
    restSeconds: cycleSeconds - work,
  };
}

export function clockTurnsFromOffset(dx: number, dy: number): number {
  const turns = Math.atan2(dx, -dy) / (2 * Math.PI);
  return turns < 0 ? turns + 1 : turns;
}

export function unwrapClockTurns(rawTurns: number, previousTurns: number): number {
  let turns = rawTurns;
  while (turns - previousTurns > 0.5) {
    turns -= 1;
  }
  while (previousTurns - turns > 0.5) {
    turns += 1;
  }
  return turns;
}

export const SHORT_CYCLE_SECONDS = 30;

export function workSecondsFromTurns(turns: number, cycleSeconds: number = CYCLE_SECONDS): number {
  return configFromWorkSeconds(turns * cycleSeconds, cycleSeconds).workSeconds;
}

export function currentElapsedMs(
  elapsedBeforeMs: number,
  segmentStartedAt: number | null,
  running: boolean,
  now: number,
): number {
  if (running && segmentStartedAt != null) {
    return Math.max(0, elapsedBeforeMs + (now - segmentStartedAt));
  }

  return Math.max(0, elapsedBeforeMs);
}

export function snapshotFromElapsed(elapsedMs: number, config: IntervalConfig = DEFAULT_CONFIG): TimerSnapshot {
  const cycleMs = config.cycleSeconds * 1000;
  const workMs = config.workSeconds * 1000;
  const restMs = config.restSeconds * 1000;
  const elapsed = Math.max(0, Math.floor(elapsedMs));
  const cycleIndex = Math.floor(elapsed / cycleMs);
  const positionInCycle = elapsed % cycleMs;
  const inWork = positionInCycle < workMs;
  const remainingMs = inWork ? workMs - positionInCycle : cycleMs - positionInCycle;
  const phaseElapsedMs = inWork ? positionInCycle : positionInCycle - workMs;
  const phaseDurationMs = inWork ? workMs : restMs;

  return {
    phase: inWork ? 'WORK' : 'REST',
    round: cycleIndex + 1,
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    cycleElapsed: positionInCycle / 1000,
    cycleProgress: positionInCycle / cycleMs,
    phaseProgress: phaseDurationMs === 0 ? 0 : phaseElapsedMs / phaseDurationMs,
  };
}
