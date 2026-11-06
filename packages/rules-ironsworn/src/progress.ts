import type { DiceResult, ProgressRank, Rng, TrackState } from '@mythweaver/rules-core';
import { compareToChallenge, isMatch } from './dice';

export const TICKS_PER_BOX = 4;
export const BOXES_PER_TRACK = 10;
export const MAX_TICKS = TICKS_PER_BOX * BOXES_PER_TRACK;

/**
 * Ticks added per mark, by rank. A tick is a quarter box, so a full box is 4 ticks.
 *
 * Troublesome 3 boxes = 12 ticks, dangerous 2 = 8, formidable 1 = 4, extreme 2 ticks,
 * epic 1 tick. (SRD, "Marking Progress".)
 */
export const RANK_MARKS: Record<ProgressRank, number> = {
  troublesome: 12,
  dangerous: 8,
  formidable: 4,
  extreme: 2,
  epic: 1,
};

export const RANKS: readonly ProgressRank[] = [
  'troublesome',
  'dangerous',
  'formidable',
  'extreme',
  'epic',
];

export function createTrack(rank: ProgressRank): TrackState {
  return { rank, ticks: 0 };
}

/** Filled boxes, rounded down — a quarter-filled box is not yet a box. */
export function progressScore(track: TrackState): number {
  return Math.floor(track.ticks / TICKS_PER_BOX);
}

/**
 * Marks progress. Ticks cap at the end of the track: over-marking is clamped rather than
 * rejected, because a player can legitimately mark more progress than the track holds.
 */
export function markProgress(track: TrackState, times = 1): TrackState {
  if (times < 1) throw new RangeError('times must be at least 1');
  const added = RANK_MARKS[track.rank] * times;
  return { ...track, ticks: Math.min(MAX_TICKS, track.ticks + added) };
}

export type ProgressRollResult = DiceResult & {
  /** Boxes filled when the roll was made; this is the score compared to the challenge dice. */
  trackScore: number;
  track: TrackState;
};

/**
 * A progress move rolls the number of filled boxes against two challenge dice. There is no
 * action die, so the action die is reported as 0 and `actionScore` is the box count.
 */
export function rollProgress(track: TrackState, rng: Rng): ProgressRollResult {
  const trackScore = progressScore(track);
  const challenge: [number, number] = [rng.d10(), rng.d10()];
  const { outcome, beaten } = compareToChallenge(trackScore, challenge);

  return {
    actionDie: 0,
    challenge,
    actionScore: trackScore,
    beaten,
    outcome,
    match: isMatch(challenge),
    trackScore,
    track,
  };
}
