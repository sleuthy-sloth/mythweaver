import { describe, expect, it } from 'vitest';
import type { Rng } from '@mythweaver/rules-core';
import { rollAction } from '../src/action-roll';

function scripted(d6: number, d10s: [number, number]): Rng {
  let index = 0;
  return {
    d6: () => d6,
    d10: () => {
      const value = d10s[index];
      index += 1;
      if (value === undefined) throw new Error('d10 called too many times');
      return value;
    },
  };
}

describe('rollAction', () => {
  it('adds the action die to stat+adds and compares with both challenge dice', () => {
    const result = rollAction({ base: 2, momentum: 0, debilities: [], rng: scripted(3, [4, 8]) });

    expect(result.actionScore).toBe(5);
    expect(result.challenge).toEqual([4, 8]);
    expect(result.outcome).toBe('weak_hit');
    expect(result.burned).toBe(false);
    expect(result.momentumAfter).toBe(0);
  });

  it('cancels the action die when negative momentum equals it', () => {
    // momentum -3 matches the action die of 3, so the score is stat+adds alone.
    const result = rollAction({ base: 4, momentum: -3, debilities: [], rng: scripted(3, [3, 5]) });

    expect(result.actionDieCancelled).toBe(true);
    expect(result.actionScore).toBe(4);
    expect(result.outcome).toBe('weak_hit');
  });

  it('keeps the action die when negative momentum does not match it', () => {
    const result = rollAction({ base: 4, momentum: -3, debilities: [], rng: scripted(2, [3, 5]) });

    expect(result.actionDieCancelled).toBe(false);
    expect(result.actionScore).toBe(6);
    expect(result.outcome).toBe('strong_hit');
  });

  it('burns momentum to cancel a challenge die and turns a miss into a weak hit', () => {
    // score 3 vs 5 and 8: a miss. Momentum 6 cancels the 5 only.
    const result = rollAction({
      base: 1,
      momentum: 6,
      debilities: [],
      burn: true,
      rng: scripted(2, [5, 8]),
    });

    expect(result.outcome).toBe('weak_hit');
    expect(result.challenge).toEqual([0, 8]);
    expect(result.burned).toBe(true);
    expect(result.momentumAfter).toBe(2);
  });

  it('burns both dice for a strong hit when momentum exceeds both', () => {
    const result = rollAction({
      base: 1,
      momentum: 9,
      debilities: [],
      burn: true,
      rng: scripted(2, [5, 8]),
    });

    expect(result.outcome).toBe('strong_hit');
    expect(result.challenge).toEqual([0, 0]);
    expect(result.momentumAfter).toBe(2);
  });

  it('does not cancel a die equal to momentum', () => {
    // Cancelling is "less than momentum" — a die of 6 is untouched by momentum 6.
    const result = rollAction({
      base: 1,
      momentum: 6,
      debilities: [],
      burn: true,
      rng: scripted(2, [6, 8]),
    });

    expect(result.outcome).toBe('miss');
    expect(result.momentumAfter).toBe(2);
  });

  it('resets momentum to 1 with one debility and 0 with two', () => {
    const one = rollAction({
      base: 1,
      momentum: 8,
      debilities: ['wounded'],
      burn: true,
      rng: scripted(2, [3, 4]),
    });
    const two = rollAction({
      base: 1,
      momentum: 8,
      debilities: ['wounded', 'shaken'],
      burn: true,
      rng: scripted(2, [3, 4]),
    });

    expect(one.momentumAfter).toBe(1);
    expect(two.momentumAfter).toBe(0);
  });

  it('refuses to burn at zero or negative momentum', () => {
    const result = rollAction({
      base: 1,
      momentum: 0,
      debilities: [],
      burn: true,
      rng: scripted(2, [5, 8]),
    });

    expect(result.burned).toBe(false);
    expect(result.momentumAfter).toBe(0);
    expect(result.outcome).toBe('miss');
  });

  it('flags a match on the original challenge dice even when one is cancelled', () => {
    const result = rollAction({
      base: 1,
      momentum: 7,
      debilities: [],
      burn: true,
      rng: scripted(2, [6, 6]),
    });

    expect(result.match).toBe(true);
    expect(result.challenge).toEqual([0, 0]);
  });
});
