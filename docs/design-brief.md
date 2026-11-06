# Mythweaver — UI design brief (for Google Stitch / a human designer)

Paste the block below into Stitch as the first prompt of a new project, then generate screens one at
a time. The brief is written against the app as built: the field names, states and copy are real, so
mockups map onto working code instead of inventing flows we cannot implement.

---

## PRODUCT

Mythweaver is a self-hosted app for playing solo tabletop RPGs, starting with Ironsworn. One person
signs in on their own server, keeps a character, rolls moves, and records what happened. There is no
multiplayer, no social feed, no AI narrator, no ads, no upsell. It is a quiet tool for one player at
a table by themselves.

The tone is a field journal kept by someone who has been out in the wilds: personal, worn,
deliberate. Not a video game HUD. Not a SaaS dashboard.

## WHO IS USING IT AND WHERE

A solo player, often on a phone, often in the evening, often one-handed while holding a notebook.
Sessions are short (10–40 minutes) and frequent. They roll dozens of times per session, and they
adjust health, spirit, supply and momentum constantly. Reading must be effortless in low light, and
every tap target must work with a thumb.

Secondarily: on a laptop, they review roll history and rename or archive campaigns.

## HARD CONSTRAINTS

- Mobile-first: design at 390 × 844 first; a desktop layout at 1280 wide is secondary (two columns).
- Light and dark themes, following the system setting. Both must be first-class, not an afterthought.
- WCAG 2.2 AA: body text 4.5:1, large text 3:1, visible focus rings, 44 × 44 px minimum targets,
  labels for every input, errors placed next to the field they belong to.
- Never rely on colour alone: an outcome must be readable as a word ("Strong hit", "Weak hit",
  "Miss"), not just green/amber/red.
- Keep it implementable in React + Tailwind with CSS variables. Inline SVG only — no icon fonts, no
  external images, no illustration files, no stock photography.
- If you propose a display typeface, choose one available on Google Fonts and name it; we will
  self-host the woff2.

## ART DIRECTION — "field journal"

Primary direction: warm paper, ink, hairline rules, and the feeling of a printed character sheet that
has been carried around. Details should come from typography, rules and spacing rather than from
gradients or shadows.

- Light: paper #F4EDE1, card #FFFAF2, ink #221C14, muted #6B5F4D, rule #D9CBB4, accent copper
  #8A5A1F, success #2F6B45, warning #7A5314, danger #9A2F2F.
- Dark: ground #14110E, card #1D1915, ink #F0E7D8, muted #B6A892, rule #38312A, accent #E0B877,
  success #86C9A2, warning #E0B877, danger #E58A8A.
- Typography: a serif for names, numbers and headings (something with a little bite — Cormorant,
  Spectral or similar); a plain UI sans for labels; tabular figures for every stat, die and total so
  numbers do not jitter.
- Numerals matter more than decoration: stats, meters and dice should feel like figures on a
  ledger — aligned, calm, legible at a glance.
- Texture: at most a faint paper grain or a 1px double rule. No drop-shadow blobs, no glass, no
  blurred colour glows behind cards.
- Dice should read as physical objects: small, square, distinct from buttons, with the challenge dice
  visibly paired and the beaten ones marked by more than colour.

Alternate direction to try as a variation: "night watch" — the same layout, but the dark theme leads,
with the accent used sparingly like lamplight on a page.

## AVOID

Purple/indigo gradients, glassmorphism, neon glows, floating rounded rectangles with big soft
shadows, generic line-icon sets, emoji as interface, stock fantasy art, banners, badges shouting
"new", dashboard KPI tiles, and anything that looks like a generic AI-generated SaaS landing page.
No skeuomorphic parchment scrolls or dragons either — the reference is a working journal, not a
fantasy poster.

## SCREENS (generate in this order)

**1. Sign in.** Centred card, app name, one line explaining what this is ("A quiet table for solo
play. Your campaigns stay on your server."). Email, password, primary "Sign in". A secondary tab for
"Create account". Error state: message directly above the button, plain language, no red banner
across the page.

**2. Campaigns.** The list of the player's campaigns. Each row: campaign name in the serif, a
one-line meta beneath it (ruleset · active/archived · role), chevron. A compact "new campaign"
affordance — one name field and a Create button, not a modal wizard. Empty state should feel like an
invitation, not an error.

**3. Play screen — the most important screen.** Two jobs: see the sheet, roll.

- Character identity: name, "Momentum reset +2 · max +10" as quiet meta.
- Five stats in a row (Edge, Heart, Iron, Shadow, Wits) with large tabular numerals.
- Four adjustable meters (Health, Spirit, Supply, Momentum) with − and + controls. Health/Spirit/
  Supply run 0–5; Momentum runs −6 to +10 and is the one that moves most.
- Debilities: three toggle chips (Wounded, Shaken, Unprepared).
- Roll panel: stat picker, a small "adds" number, a "burn momentum" toggle (disabled with an
  explanation when momentum is 0 or less), and a primary Roll button.
- Roll result: outcome as a word, the three dice, the total, and a one-line note ("Momentum burned:
  6 → 2" or "Momentum unchanged").
- Roll history beneath: one line per roll — outcome word, stat, dice, total, match marker.

On a phone these stack; the Roll control must be reachable without hunting. On desktop they sit side
by side, sheet left, roll right.

**4. States to design explicitly:** loading, empty (no campaigns / no character / no rolls), field
error, wrong password, session expired, and a "momentum is 0, cannot burn" disabled control.

## COMPONENT INVENTORY

Stat cell, meter stepper (value between two 44 px buttons), debility chip (on/off), stat picker chip
(selected/unselected), die (normal / beaten / cancelled), outcome badge (strong hit / weak hit /
miss), campaign row, roll history row, text field with label + hint + error, primary and secondary
buttons, section card, empty state.

## REAL DATA TO USE IN MOCKUPS

Campaign: "The Iron Vow" · ironsworn · active · owner.
Character: Sabine · Edge 2, Heart 1, Iron 3, Shadow 2, Wits 1 · Health 5, Spirit 5, Supply 5,
Momentum 6 · no debilities.
Rolls: "Weak hit · Iron +1 · 4 vs 3/8 = 7"; "Strong hit · Wits · 6 vs 2/1 = 9 · match";
"Miss · Shadow +2 · 3 vs 7/9 = 5".

## COPY VOICE

Second person, plain, quiet. No exclamation marks, no "Awesome!", no "Let's get started", no emoji.
Button labels are verbs ("Roll Iron", "Create campaign", "Sign out"). Short sentences. If a thing is
disabled, say why in a few words.

## DELIVERABLE

Three mobile screens (sign in, campaigns, play) plus a desktop variant of the play screen, each with
light and dark. Prefer strong hierarchy and restraint over decoration; if a screen needs a new
element, justify it in one line rather than adding ornament.
