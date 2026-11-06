import type { DiceResult, Outcome } from '@mythweaver/rules-core';

/**
 * Outcome comparison for Ironsworn.
 *
 * Challenge dice are beaten when the action score is *strictly* greater. A tie is not a hit —
 * that is the rule as written ("over both"), and it matters: with a score of 5 and challenge
 * dice 5 and 9, the result is a weak hit only because the second die is higher.
 */
export function compareToChallenge(
  actionScore: number,
  challenge: readonly [number, number],
): { outcome: Outcome; beaten: [boolean, boolean] } {
  const beaten: [boolean, boolean] = [actionScore > challenge[0], actionScore > challenge[1]];
  const hits = Number(beaten[0]) + Number(beaten[1]);

  const outcome: Outcome = hits === 2 ? 'strong_hit' : hits === 1 ? 'weak_hit' : 'miss';
  return { outcome, beaten };
}

export function isMatch(challenge: readonly [number, number]): boolean {
  return challenge[0] === challenge[1];
}

export function makeDiceResult(
  actionDie: number,
  actionScore: number,
  challenge: readonly [number, number],
): DiceResult {
  const { outcome, beaten } = compareToChallenge(actionScore, challenge);
  return {
    actionDie,
    challenge: [challenge[0], challenge[1]],
    actionScore,
    beaten,
    outcome,
    match: isMatch(challenge),
  };
}
