/**
 * Momentum limits and reset values, from the Ironsworn SRD:
 *
 * - default reset +2; one marked debility lowers it to +1; two or more lower it to 0
 * - max momentum starts at +10 and drops by 1 per marked debility
 * - momentum never drops below -6
 *
 * (Rulebook section "Resetting Momentum" / "Max Momentum" / "Minimum Momentum".)
 */
export const DEFAULT_RESET = 2;
export const BASE_MAX_MOMENTUM = 10;
export const MIN_MOMENTUM = -6;

/** Debilities that count against momentum. Unknown markers are ignored by the caller, not here. */
export const DEBILITIES = ['wounded', 'shaken', 'unprepared'] as const;
export type Debility = (typeof DEBILITIES)[number];

export function countDebilities(debilities: readonly string[]): number {
  const unique = new Set(
    debilities.filter((entry) => (DEBILITIES as readonly string[]).includes(entry)),
  );
  return unique.size;
}

export function momentumReset(debilities: readonly string[]): number {
  const count = countDebilities(debilities);
  if (count >= 2) return 0;
  if (count === 1) return 1;
  return DEFAULT_RESET;
}

export function maxMomentum(debilities: readonly string[]): number {
  return BASE_MAX_MOMENTUM - countDebilities(debilities);
}

export function clampMomentum(value: number, debilities: readonly string[]): number {
  return Math.max(MIN_MOMENTUM, Math.min(maxMomentum(debilities), value));
}
