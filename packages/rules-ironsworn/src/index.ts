/**
 * Ironsworn mechanics as functions of their inputs.
 *
 * No I/O, no clock, no global randomness: every entry point takes an `Rng` or explicit dice
 * values. That is what makes the outcomes reproducible in tests and auditable in a stored roll.
 *
 * No game text, tables or artwork live in this package. Content is a separate, provenance-checked
 * concern (see docs/content-provenance.md).
 */
export { compareToChallenge, isMatch, makeDiceResult } from './dice';
export {
  BASE_MAX_MOMENTUM,
  DEBILITIES,
  DEFAULT_RESET,
  MIN_MOMENTUM,
  clampMomentum,
  countDebilities,
  maxMomentum,
  momentumReset,
  type Debility,
} from './momentum';
export { rollAction, type ActionRollInput, type ActionRollResult } from './action-roll';
export {
  BOXES_PER_TRACK,
  MAX_TICKS,
  RANKS,
  RANK_MARKS,
  TICKS_PER_BOX,
  createTrack,
  markProgress,
  progressScore,
  rollProgress,
  type ProgressRollResult,
} from './progress';

export const RULESET_ID = 'ironsworn';
export const RULESET_VERSION = '1.0.0';

/** Stat keys on an Ironsworn character sheet. */
export const STATS = ['edge', 'heart', 'iron', 'shadow', 'wits'] as const;
export type Stat = (typeof STATS)[number];

/** Meters on the sheet, each 0..5. */
export const TRACKS = ['health', 'spirit', 'supply'] as const;
export type MeterTrack = (typeof TRACKS)[number];

/**
 * Re-exported so consumers (the API) can type dice and tracks without depending on rules-core
 * directly; the ruleset package is the single entry point they import.
 */
export type {
  CharacterStats,
  DiceResult,
  MoveDefinition,
  Outcome,
  ProgressRank,
  Rng,
  TrackState,
} from '@mythweaver/rules-core';
