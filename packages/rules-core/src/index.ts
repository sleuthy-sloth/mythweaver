/**
 * System-agnostic rules vocabulary.
 *
 * This package holds no game rules on purpose. A ruleset package (for example
 * `@mythweaver/rules-ironsworn`) implements these interfaces, and the API persists whatever a
 * resolution returns. Swapping systems later means adding an implementation, not rewriting
 * campaigns, characters or rolls.
 */

/** Injected randomness. The engine never calls a global RNG, so tests are deterministic. */
export type Rng = {
  /** Uniform integer 1..10. */
  d10: () => number;
  /** Uniform integer 1..6. */
  d6: () => number;
};

/** Every supported system reports outcomes on this scale. */
export type Outcome = 'strong_hit' | 'weak_hit' | 'miss';

export type DiceResult = {
  actionDie: number;
  challenge: [number, number];
  actionScore: number;
  /** Challenge dice strictly below the score are beaten; ties go to the challenge dice. */
  beaten: [boolean, boolean];
  outcome: Outcome;
  /** Both challenge dice equal: a twist, meaningful in most systems. */
  match: boolean;
};

/** Progress tracks are measured in ticks so fractional boxes survive merging and sync. */
export type ProgressRank = 'troublesome' | 'dangerous' | 'formidable' | 'extreme' | 'epic';

export type TrackState = {
  rank: ProgressRank;
  /** 0..40; four ticks per box, ten boxes per track. */
  ticks: number;
};

export type MoveKind = 'action' | 'progress' | 'oracle' | 'story';

/**
 * A move as data, not code. `content` is optional and must carry provenance when it reproduces
 * licensed text; a ruleset can ship mechanics-only definitions and let players write the prose.
 */
export type MoveDefinition = {
  id: string;
  rulesetId: string;
  name: string;
  kind: MoveKind;
  /** Which stat the move rolls, when it rolls one. */
  stat?: string;
  /** Fixed adds the move itself contributes. */
  adds?: number;
  content?: { text: string; license: string; attribution: string };
};

export type CharacterStats = Record<string, number>;

/** What a ruleset needs from a character to resolve a roll. */
export type RollContext = {
  stats: CharacterStats;
  momentum: number;
  debilities: readonly string[];
};
