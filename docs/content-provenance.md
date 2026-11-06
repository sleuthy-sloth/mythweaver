# Content provenance and licensing

Application code is MIT (`LICENSE`). Game content is **not** covered by that license and is
tracked here, file by file, before it enters the repository.

## Rules for adding content

1. Record source, author, license, attribution string and the date checked, in the table below.
2. Keep the machine-readable manifest (`packages/rules-ironsworn/content/manifest.json`, Phase 3)
   in sync with this file. A test compares the two.
3. Never import a whole rulebook because part of it is open. Licenses differ per product line.
4. If the license is unclear, ship a mechanic plus a user-editable placeholder and mark the gap.
5. Attribution must be visible in the app, not only in the repository.

## Verified so far

| Source                  | Terms                                                                                       | Checked    | Notes                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ironsworn SRD (classic) | CC BY 4.0                                                                                   | 2026-11-05 | Tomkin Press: the SRD contents, plus the **text of the Ironsworn asset cards and oracle tables**, are available under CC BY 4.0. <https://tomkinpress.com/pages/licensing> |
| Ironsworn: Delve        | Separate terms — verify before use                                                          | —          | Not covered by the statement above.                                                                                                                                        |
| Ironsworn: Starforged   | Split: complete text CC BY-NC-SA 4.0 (non-commercial), Starforged Reference Guide CC BY 4.0 | 2026-11-05 | Out of scope for v1; do not mix files.                                                                                                                                     |
| Sundered Isles          | Separate terms — verify before use                                                          | —          | Out of scope.                                                                                                                                                              |

Required attribution for CC BY 4.0 material, once included:

> This product includes material from the Ironsworn System Reference Document, © 2018 Shawn
> Tomkin, licensed under CC BY 4.0. Ironsworn is available at <https://www.ironswornrpg.com>.
> Mythweaver is an independent product and is not affiliated with or endorsed by Shawn Tomkin.

CC BY 4.0 forbids implying endorsement and requires indicating changes. If we alter text, say so
in the manifest entry.

## Bundled assets

| Asset                                                     | Terms                                                     | Location                                         |
| --------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| Spectral (Latin + Latin Extended, weights 500/600, woff2) | SIL Open Font License 1.1, © The Spectral Project Authors | `apps/web/public/fonts/`, licence text alongside |

The font ships inside the image and is served from our own origin. No request goes to Google at
runtime.

## What is in the repository today

Nothing from any game. Phase 1 ships no rules text, tables, names from oracle tables, or art. The
UI copy is original.

## No affiliation

Mythweaver is independent software. Solesworn is referenced only as a pointer to broad feature
categories; no source code, UI, text, art, data or branding was copied, and the project claims no
affiliation with it or with Tomkin Press.

This file is an engineering record, not legal advice. A human review is required before any public
release.
