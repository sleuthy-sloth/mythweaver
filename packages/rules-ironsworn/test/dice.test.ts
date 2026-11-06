import { describe, expect, it } from 'vitest';
import { compareToChallenge, isMatch } from '../src/dice';

describe('compareToChallenge', () => {
  it('is a strong hit when the score beats both dice', () => {
    expect(compareToChallenge(8, [3, 5]).outcome).toBe('strong_hit');
    expect(compareToChallenge(8, [3, 5]).beaten).toEqual([true, true]);
  });

  it('is a weak hit when the score beats exactly one die', () => {
    expect(compareToChallenge(6, [5, 9]).outcome).toBe('weak_hit');
    expect(compareToChallenge(6, [5, 9]).beaten).toEqual([true, false]);
  });

  it('is a miss when the score beats neither die', () => {
    expect(compareToChallenge(4, [5, 9]).outcome).toBe('miss');
    expect(compareToChallenge(4, [5, 9]).beaten).toEqual([false, false]);
  });

  it('does not beat a die on a tie', () => {
    // 5 vs 5 and 3: the first die is not beaten, so this is only a weak hit.
    expect(compareToChallenge(5, [5, 3]).outcome).toBe('weak_hit');
    // 5 vs 5 and 5: neither is beaten.
    expect(compareToChallenge(5, [5, 5]).outcome).toBe('miss');
  });

  it('reports a match when both challenge dice are equal, whatever the outcome', () => {
    expect(isMatch([4, 4])).toBe(true);
    expect(isMatch([4, 5])).toBe(false);
  });
});
