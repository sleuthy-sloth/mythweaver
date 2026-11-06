import { describe, expect, it } from 'vitest';
import {
  BASE_MAX_MOMENTUM,
  MIN_MOMENTUM,
  clampMomentum,
  countDebilities,
  maxMomentum,
  momentumReset,
} from '../src/momentum';

describe('momentum reset', () => {
  it('is +2 with no debilities', () => {
    expect(momentumReset([])).toBe(2);
  });

  it('drops to +1 with one marked debility', () => {
    expect(momentumReset(['wounded'])).toBe(1);
  });

  it('drops to 0 with two or more debilities', () => {
    expect(momentumReset(['wounded', 'shaken'])).toBe(0);
    expect(momentumReset(['wounded', 'shaken', 'unprepared'])).toBe(0);
  });

  it('counts a duplicated marker once', () => {
    expect(countDebilities(['wounded', 'wounded'])).toBe(1);
    expect(momentumReset(['wounded', 'wounded'])).toBe(1);
  });

  it('ignores markers that are not debilities', () => {
    expect(countDebilities(['blessed'])).toBe(0);
    expect(momentumReset(['blessed'])).toBe(2);
  });
});

describe('momentum limits', () => {
  it('starts at a maximum of +10 and loses one per debility', () => {
    expect(maxMomentum([])).toBe(BASE_MAX_MOMENTUM);
    expect(maxMomentum(['wounded'])).toBe(9);
    expect(maxMomentum(['wounded', 'shaken', 'unprepared'])).toBe(7);
  });

  it('never clamps below -6', () => {
    expect(clampMomentum(-20, [])).toBe(MIN_MOMENTUM);
    expect(clampMomentum(-6, [])).toBe(-6);
  });

  it('never clamps above the current maximum', () => {
    expect(clampMomentum(10, [])).toBe(10);
    expect(clampMomentum(10, ['wounded'])).toBe(9);
  });
});
