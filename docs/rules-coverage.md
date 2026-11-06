# Ironsworn rules coverage

What the engine actually implements, what it deliberately does not, and how each rule is pinned by
a test. Nothing here is claimed as complete.

Source checked: the Ironsworn System Reference Document (CC BY 4.0, Shawn Tomkin), specifically
the sections on action rolls, momentum, and progress tracks. No rule text, table or artwork is
reproduced in the repository; this is a record of mechanics implemented as code.

## Implemented and tested

| Mechanic               | Rule as implemented                                                                                         | Test                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Action roll comparison | d6 + stat + adds vs two d10; strong hit beats both, weak beats one, miss beats none                         | `dice.test.ts`                                   |
| Ties                   | A die equal to the score is **not** beaten ("over both")                                                    | `dice.test.ts`                                   |
| Match                  | Both challenge dice equal, reported independently of the outcome                                            | `dice.test.ts`, `action-roll.test.ts`            |
| Negative momentum      | Momentum below zero cancels the action die when its **magnitude** equals the die; score becomes stat + adds | `action-roll.test.ts`                            |
| Burning momentum       | Cancels each challenge die strictly below momentum; both cancelled = strong hit, one = weak hit             | `action-roll.test.ts`                            |
| Burn eligibility       | Only with momentum above zero                                                                               | `action-roll.test.ts`, `rolls.test.ts` (API 400) |
| Momentum reset         | +2 default, +1 with one debility, 0 with two or more; applied after burning                                 | `momentum.test.ts`, `rolls.test.ts`              |
| Max momentum           | 10 minus marked debilities                                                                                  | `momentum.test.ts`                               |
| Min momentum           | −6, clamped                                                                                                 | `momentum.test.ts`                               |
| Debility counting      | Duplicated or unknown markers do not stack                                                                  | `momentum.test.ts`                               |
| Progress marks         | Troublesome 3 boxes, dangerous 2, formidable 1, extreme 2 ticks, epic 1 tick                                | `progress.test.ts`                               |
| Ticks and boxes        | 4 ticks per box, 10 boxes, 40 ticks; partial boxes do not count                                             | `progress.test.ts`                               |
| Progress roll          | Filled boxes vs two d10, no action die; same strong/weak/miss comparison                                    | `progress.test.ts`                               |
| Track overflow         | Marks clamp at the end of the track instead of throwing                                                     | `progress.test.ts`                               |

## Implemented, not yet exposed

- Progress tracks exist as a pure function but are not persisted. Vows, journeys, combats and bonds
  need a `progress_tracks` table and endpoints — Phase 3b.
- Moves are modelled (`MoveDefinition`) but no catalogue ships. Move text must arrive with
  provenance; the engine only knows "roll this stat, apply these adds".

## Not implemented

- Move triggers, fiction, and outcome text (content, not mechanics).
- Assets, companions, and their stat adds and abilities.
- Oracles and random tables of any kind.
- Experience and progression (the sheet stores `xp`, no spend rules).
- Applying move outcomes to health/spirit/supply/momentum. The server records the roll and
  applies **only** a momentum reset when burning; every other consequence is the player's edit.
  That is deliberate: inventing a "+1 momentum on strong hit" would be wrong for most moves.
- Combat, delve, scene challenges, bonds.
- Character build legality (the +3/+2/+2/+1/+1 assignment). Defaults are a starting point and
  every stat is editable; nothing rejects an illegal spread beyond the 0..5 range.

## Randomness

Online rolls use `crypto.randomInt` server-side and the dice are stored with the result, so any
roll can be re-derived. There is no seed input: a player-chosen seed would let someone compute
favourable rolls in advance, which weakens trust rather than adding verifiability.

Offline rolls (Phase 3b) will use `crypto.getRandomValues` in the browser and carry the dice in the
operation payload, so the server can verify the comparison without re-rolling.

## How to extend

1. Add the mechanic to `packages/rules-ironsworn` as a pure function taking an `Rng` or explicit
   dice values — never `Math.random`, never the clock.
2. Pin it with a scripted-dice test, including the boundary case (ties, zero, maximum).
3. Add the row to the table above with the SRD section you checked.
4. Only then wire it into the API and persistence.
