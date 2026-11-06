import { describe, expect, it } from 'vitest';
import type { Rng } from '@mythweaver/rules-core';
import {
  MAX_TICKS,
  TICKS_PER_BOX,
  createTrack,
  markProgress,
  progressScore,
  rollProgress,
} from '../src/progress';

function scripted(d10s: [number, number]): Rng {
  let index = 0;
  return {
    d6: () => 1,
    d10: () => {
      const value = d10s[index];
      index += 1;
      if (value === undefined) throw new Error('d10 called too many times');
      return value;
    },
  };
}

describe('progress marks', () => {
  it('marks 3 boxes for a troublesome track', () => {
    const track = markProgress(createTrack('troublesome'));
    expect(track.ticks).toBe(12);
    expect(progressScore(track)).toBe(3);
  });

  it('marks 2 boxes for dangerous and 1 for formidable', () => {
    expect(progressScore(markProgress(createTrack('dangerous')))).toBe(2);
    expect(progressScore(markProgress(createTrack('formidable')))).toBe(1);
  });

  it('marks ticks for extreme and epic', () => {
    const extreme = markProgress(createTrack('extreme'));
    expect(extreme.ticks).toBe(2);
    expect(progressScore(extreme)).toBe(0);

    const extremeTwice = markProgress(extreme);
    expect(extremeTwice.ticks).toBe(TICKS_PER_BOX);
    expect(progressScore(extremeTwice)).toBe(1);

    expect(markProgress(createTrack('epic')).ticks).toBe(1);
  });

  it('clamps at the end of the track', () => {
    const full = { rank: 'troublesome' as const, ticks: MAX_TICKS - 1 };
    const marked = markProgress(full);
    expect(marked.ticks).toBe(MAX_TICKS);
    expect(progressScore(marked)).toBe(10);
  });

  it('rejects a non-positive mark count', () => {
    expect(() => markProgress(createTrack('dangerous'), 0)).toThrow(RangeError);
  });
});

describe('progress roll', () => {
  it('compares filled boxes against two challenge dice', () => {
    const track = { rank: 'dangerous' as const, ticks: 32 }; // 8 boxes
    const result = rollProgress(track, scripted([3, 9]));

    expect(result.actionScore).toBe(8);
    expect(result.trackScore).toBe(8);
    expect(result.actionDie).toBe(0);
    expect(result.outcome).toBe('weak_hit');
  });

  it('is a miss when the track is empty', () => {
    const result = rollProgress(createTrack('epic'), scripted([1, 2]));
    expect(result.actionScore).toBe(0);
    expect(result.outcome).toBe('miss');
  });

  it('floors partial boxes', () => {
    const result = rollProgress({ rank: 'troublesome', ticks: 3 }, scripted([1, 1]));
    expect(result.actionScore).toBe(0);
  });
});
