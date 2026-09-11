# Felt background options

Follow-up to `suit-on-felt-colors.md`: instead of only lightening the suits,
change the table. Question: which card-table-associated felt color gives the
whole UI palette (body text, four suits, player colors, accents, SOLD stamp)
the most WCAG AA headroom?

Method: same W3C Technique G18 math as the suit doc. Foregrounds tested are
the current repo tokens plus the four proposed suit hexes. Candidate felts are
representative mid-dark shades of real casino-layout colors (exact shade is
tunable — what matters is the luminance band; all ratios below are exact for
the listed hex).

## Result matrix (ratio vs felt; PASS = ≥ 4.5:1 normal text)

| Foreground | Green `#0d5c2e` (current) | Tourney blue `#17456b` | Burgundy `#5e1f1f` | Charcoal `#22252a` | Purple `#472a5e` |
|---|---|---|---|---|---|
| Body `#f5f5dc` | 7.33 PASS | 9.04 PASS | 11.22 PASS | 13.89 PASS | 10.78 PASS |
| Spades `#ffffff` | 8.12 PASS | 10.00 PASS | 12.41 PASS | 15.37 PASS | 11.93 PASS |
| Hearts `#ffb3b3` | 4.77 PASS | 5.88 PASS | 7.30 PASS | 9.04 PASS | 7.01 PASS |
| Diamonds `#a8c6ff` | 4.71 PASS | 5.80 PASS | 7.20 PASS | 8.92 PASS | 6.92 PASS |
| Clubs `#86efac` | 5.78 PASS | 7.12 PASS | 8.84 PASS | 10.95 PASS | 8.49 PASS |
| Human `#8ab4f8` | 3.85 large-only | 4.75 PASS | 5.89 PASS | 7.29 PASS | 5.66 PASS |
| AI `#ff8a8a` | 3.58 large-only | 4.41 large-only | 5.47 PASS | 6.77 PASS | 5.26 PASS |
| Accent gold `#d4af37` | 3.86 large-only | 4.76 PASS | 5.90 PASS | 7.31 PASS | 5.67 PASS |
| Sort `#e9c46a` | 4.86 PASS | 5.99 PASS | 7.43 PASS | 9.20 PASS | 7.14 PASS |
| SOLD `#fb6f52` | 2.90 FAIL | 3.57 large-only | 4.43 large-only | 5.49 PASS | 4.26 large-only |
| Dim `#c8d8c0` | 5.43 PASS | 6.69 PASS | 8.30 PASS | 10.28 PASS | 7.97 PASS |
| Good `#2ecc71` | 3.86 large-only | 4.76 PASS | 5.91 PASS | 7.31 PASS | 5.67 PASS |
| **Full PASS count** | **7/12** | **10/12** | **11/12** | **12/12** | **11/12** |

## Recommendation: tournament blue `#17456b`

- Strongest card-table association after green itself: blue speed-cloth is the
  standard tournament-poker table color, and gold-on-blue is the classic
  casino trim combination (accent `#d4af37` moves from 3.86 to 4.76 PASS).
- Fixes four current large-only tokens to full PASS (human, accent, good,
  plus margin on all four suits — diamonds goes 4.71 → 5.80).
- Remaining gaps, both shippable: AI `#ff8a8a` at 4.41 (2% under; large-text
  OK, or lighten one step) and SOLD `#fb6f52` at 3.57 (large bold stamp text;
  the stamp was already a documented maximin compromise on green).
- No hue collisions: light-blue diamonds on mid-blue felt separate by
  lightness (5.80), unlike green-on-green or red-on-red traps.

## Alternatives

- **Charcoal `#22252a`** — the max-contrast option: 12/12 PASS including SOLD
  (5.49). Weakest table association (black layouts exist in modern poker rooms
  but read "esports", not "card table"). Pick this if legibility outranks theme.
- **Burgundy `#5e1f1f`** — 11/12 and a genuine blackjack-table color, but two
  red-on-red collisions: pink hearts on red felt and the red SOLD stamp on red
  felt (4.43, still failing). Both pass numerically yet lose hue identity.
  Rejected for that reason.
- **Purple `#472a5e`** — 11/12, seen in some poker rooms, but no advantage over
  blue and a less universal table association. Rejected.
- **Stay on green** — costs nothing, but keeps four tokens at large-only and
  the SOLD stamp at an outright 2.90 FAIL, and forces the mint-clubs compromise
  documented in the suit file.

## If blue is adopted

1. `--c-felt: #17456b`; check `--c-panel` (`#0e6b34`, green-tinted) — it will
   need a blue-shifted companion (e.g. `#1d4e7a` range, verify ≥ 3:1 against
   body text for large UI surfaces).
2. `--c-line` (`#1a4a2a`) likewise needs a blue-shifted border tone.
3. Optional: nudge AI `#ff8a8a` one step lighter to clear 4.5 (needs L_fg ≥
   ~0.44 on this felt); everything else passes untouched, including the four
   proposed suit hexes.
