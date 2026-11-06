import type { DiceResult, Rng } from '@mythweaver/rules-core';
import { compareToChallenge, isMatch } from './dice';
import { clampMomentum, momentumReset } from './momentum';

export type ActionRollInput = {
  /** Stat + adds, before the action die. */
  base: number;
  momentum: number;
  debilities: readonly string[];
  /** Spend momentum to cancel challenge dice below its value, then reset. */
  burn?: boolean;
  rng: Rng;
};

export type ActionRollResult = DiceResult & {
  /** Momentum after burning, or unchanged when the player did not burn. */
  momentumBefore: number;
  momentumAfter: number;
  burned: boolean;
  /** The action die was cancelled because negative momentum matched it. */
  actionDieCancelled: boolean;
};

/**
 * Resolves one action roll.
 *
 * Two rules interact and both are easy to get wrong:
 *
 * 1. A negative momentum equal to the action die cancels that die — the sheet says to compare
 *    "your stat plus adds" to the challenge dice. This is checked before burning.
 * 2. Burning cancels each challenge die whose value is below momentum (strictly), which can
 *    turn a miss into a weak hit or a weak hit into a strong hit. Both dice must fall below
 *    momentum for a strong hit. Burning is only legal with positive momentum.
 */
export function rollAction(input: ActionRollInput): ActionRollResult {
  const actionDie = input.rng.d6();
  const challenge: [number, number] = [input.rng.d10(), input.rng.d10()];

  // Negative momentum "matches" the action die on its magnitude: momentum -3 cancels a roll of 3.
  const actionDieCancelled = input.momentum < 0 && Math.abs(input.momentum) === actionDie;
  const actionScore = actionDieCancelled ? input.base : input.base + actionDie;

  const { outcome: rawOutcome, beaten } = compareToChallenge(actionScore, challenge);

  const canBurn = input.burn === true && input.momentum > 0;
  let finalChallenge: [number, number] = [challenge[0], challenge[1]];
  let finalOutcome = rawOutcome;
  let finalBeaten = beaten;

  if (canBurn) {
    finalChallenge = [
      challenge[0] < input.momentum ? 0 : challenge[0],
      challenge[1] < input.momentum ? 0 : challenge[1],
    ];
    const comparison = compareToChallenge(actionScore, finalChallenge);
    finalOutcome = comparison.outcome;
    finalBeaten = comparison.beaten;
  }

  const momentumAfter = canBurn
    ? clampMomentum(momentumReset(input.debilities), input.debilities)
    : input.momentum;

  return {
    actionDie,
    challenge: finalChallenge,
    actionScore,
    beaten: finalBeaten,
    // A cancelled die is reported as 0 so the stored roll shows why it counted as beaten.
    outcome: finalOutcome,
    match: isMatch(challenge),
    momentumBefore: input.momentum,
    momentumAfter,
    burned: canBurn,
    actionDieCancelled,
  };
}
