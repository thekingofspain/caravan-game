# Suit-on-felt text colors

Research question: what text colors for the four card suits stay legible on the
dark-green casino-felt background (`#0d5c2e`), meet WCAG AA for normal text,
and keep their card-table color associations?

Scope: suit glyphs rendered as colored text on the felt — caravan headers and
the activity log, via the `.card-name` classes in `src/view/global.css`
(the caravan header renders `<span class="suit card-name …">` in
`src/view/Board.tsx`; the log renders `CardName` in
`src/view/Sidebar/CardName.tsx`). Card faces themselves are white-stock SVG
assets and are out of scope. No code is changed by this document.

## Method (primary source: W3C)

- WCAG 2.1 Success Criterion 1.4.3 Contrast (Minimum) requires text contrast
  of at least **4.5:1**, except large-scale text (≥18pt, or ≥14pt bold),
  which requires at least **3:1**
  ([WCAG 2.1 §1.4.3](https://www.w3.org/TR/WCAG21/#contrast-minimum);
  [Understanding SC 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)).
- Relative luminance and contrast ratio are computed per
  [W3C Technique G18](https://www.w3.org/WAI/WCAG21/Techniques/general/G18):
  `L = 0.2126·R + 0.7152·G + 0.0722·B` with sRGB channels linearized as
  `c/12.92` when `c ≤ 0.04045`, else `((c + 0.055)/1.055)^2.4`, where
  `c = channel₈bit/255`; contrast is `(L1 + 0.05)/(L2 + 0.05)` with L1 the
  lighter luminance. Computed ratios must not be rounded when compared to the
  threshold (4.499:1 fails 4.5:1)
  ([Understanding SC 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)).
- Felt background `#0d5c2e` (the `--c-felt` token in `src/view/global.css`):
  rgb(13, 92, 46) → linearized (0.0040, 0.1070, 0.0273) →
  **L_felt = 0.07937**.

## 1. The problem: current palette on felt

Current mapping in `src/view/global.css` (`.card-name.hearts` → `#b3261e`;
`.card-name.spades` → `#1a1a1a`; `.card-name.diamonds` → CSS keyword `blue`;
`.card-name.clubs` → CSS keyword `green`). Per the normative
[CSS Color 3 keyword table](https://www.w3.org/TR/css-color-3/#svg-color),
`blue` = `#0000FF` and `green` = `#008000` (the dark green, not `lime`).

| Suit | Current color | Linearized RGB | L_fg | Ratio vs `#0d5c2e` | AA normal (4.5) | AA large (3.0) |
|---|---|---|---|---|---|---|
| Hearts | `#b3261e` | (0.4508, 0.0194, 0.0130) | 0.11064 | **1.24:1** | FAIL | FAIL |
| Spades | `#1a1a1a` | (0.0103, 0.0103, 0.0103) | 0.01033 | **2.14:1** | FAIL | FAIL |
| Diamonds | `blue` = `#0000FF` | (0.0000, 0.0000, 1.0000) | 0.07220 | **1.06:1** | FAIL | FAIL |
| Clubs | `green` = `#008000` | (0.0000, 0.2159, 0.0000) | 0.15438 | **1.58:1** | FAIL | FAIL |

Every current suit color fails — not just AA normal, but even the relaxed
3:1 large-text threshold
([WCAG 2.1 §1.4.3](https://www.w3.org/TR/WCAG21/#contrast-minimum)).
Spades (`#1a1a1a`, ratio 2.14) is dark-on-dark and near-invisible, as
reported; diamonds (`blue`, ratio 1.06) is effectively equiluminant with the
felt and the worst of the four.

## 2. Sources for candidate palettes

- **Four-color deck convention.** A four-color deck gives each suit its own
  color for at-a-glance readability on screen; "typically … hearts remain red
  and spades remain black, while clubs are made green and diamonds blue,"
  and most online poker sites offer it as an option
  ([PokerNews, "Four-Color Deck"](https://www.pokernews.com/pokerterms/four-color-deck.htm)).
  Poker operator Americas Cardroom gives the same purpose (visibility, less
  confusion) with the traditional base noted as "hearts and diamonds are red,
  while spades and clubs are black"
  ([Americas Cardroom, "What is a Four-Color Deck?"](https://www.americascardroom.eu/how-to/poker-terms/four-color-deck/)).
  This repo already follows the PokerNews mapping (diamonds = blue,
  clubs = green), so candidates keep it.
- **Traditional suits.** The modern French suits — trèfles (clubs), carreaux
  (diamonds), coeurs (hearts), piques (spades) — date to ~1500, and experimental
  extra suits (e.g. green eagles, blue crowns in the 1930s) never caught on,
  so hue loyalty matters for recognition
  ([PokerStars Learn, "Origin of playing card suits"](https://www.pokerstars.com/poker/learn/news/origin-of-playing-card-suits-and-the-symbols/)).
- **Casino felt.** Green felt layouts are the professional-table standard
  (e.g. Casino Supply's "Classic Holdem Layout" professional felt, sold
  primarily in green)
  ([Casino Supply](https://www.casinosupply.com/products/classic-holdem-layout)).
  Gold `#d4af37` is already this app's table accent (`--c-accent` in
  `src/view/global.css`), matching gold-trim table dressing — so gold was
  considered but rejected for suits (see below).
- **Thresholds.** 4.5:1 normal / 3:1 large, unrounded comparison, per
  [WCAG 2.1 §1.4.3](https://www.w3.org/TR/WCAG21/#contrast-minimum) and
  [Understanding SC 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html).
  Clearing 4.5:1 on this felt needs foreground **L ≥ 0.53217**.

## 3. Recommendation: one hex per suit

Each pick is the deepest (most saturated, most suit-loyal) color tested in
its hue family that still clears 4.5:1 with margin. All ratios unrounded.

| Suit | Hex | L_fg | Ratio vs `#0d5c2e` | AA normal | Card-table association |
|---|---|---|---|---|---|
| Spades ♠ | `#ffffff` | 1.00000 | **8.12:1** | PASS | Pip ink-in-reverse: black-suit pips print white on dark felt, matching white card-stock faces |
| Hearts ♥ | `#ffb3b3` | 0.56755 | **4.77:1** | PASS | Lightened four-color-deck red; keeps the red hue of hearts ([PokerNews](https://www.pokernews.com/pokerterms/four-color-deck.htm)) |
| Diamonds ♦ | `#a8c6ff` | 0.55933 | **4.71:1** | PASS | Poker-client four-color-deck blue, lightened for felt ([Americas Cardroom](https://www.americascardroom.eu/how-to/poker-terms/four-color-deck/)) |
| Clubs ♣ | `#86efac` ⚠️ | 0.69780 | **5.78:1** | PASS | ⚠️ **Flagged tradeoff** (see below): a mint/light green, not felt green |

Math inputs (linearized RGB → L), all vs L_felt = 0.07937:

- `#ffffff`: (1.0000, 1.0000, 1.0000) → 1.00000 → 1.05/0.12937 = 8.12.
- `#ffb3b3`: rgb(255, 179, 179) → (1.0000, 0.4508, 0.4508) → 0.56755 →
  0.61755/0.12937 = 4.77.
- `#a8c6ff`: rgb(168, 198, 255) → (0.3916, 0.5647, 1.0000) → 0.55933 →
  0.60933/0.12937 = 4.71.
- `#86efac`: rgb(134, 239, 172) → (0.2384, 0.8632, 0.4125) → 0.69780 →
  0.74780/0.12937 = 5.78.

### ⚠️ Clubs tradeoff (explicit exception to classic hue)

A classic saturated green **cannot** clear 4.5:1 on green felt: any mid-green
sits near the felt's own luminance (L_felt = 0.07937; required L ≥ 0.53217),
so hue contrast without lightness contrast is capped — the current `green`
manages only 1.58:1, and even the vivid emerald `#2ecc71` reaches just 3.86:1
(passes large-text 3:1 only). `#86efac` is therefore the nearest compliant
alternative: it keeps the four-color-deck green identity
([PokerNews](https://www.pokernews.com/pokerterms/four-color-deck.htm)) but
reads as mint-on-felt rather than felt-on-felt. Accept the lighter tint; do
not darken it toward "real" green, which re-fails.

## 4. Rejected alternatives (one-line reasons)

| Candidate | Ratio | Reason rejected |
|---|---|---|
| `#1a1a1a` (current spades) | 2.14 | Dark-on-dark; fails even 3:1 large text |
| `#b3261e` (current hearts) | 1.24 | Fails; red too dark for green felt |
| `blue` / `#0000FF` (current diamonds) | 1.06 | Near-equiluminant with felt; worst of the four |
| `green` / `#008000` (current clubs) | 1.58 | Same-hue-as-felt luminance trap |
| `#ff8a8a` (repo `--c-ai`) | 3.58 | Passes large-text only; fails 4.5:1 |
| `#8ab4f8` (repo `--c-human`) | 3.85 | Passes large-text only; fails 4.5:1 |
| `#2ecc71` (repo `--c-good`) | 3.86 | Strongest classic green tested, still fails 4.5:1 |
| `#d4af37` (repo `--c-accent` gold) | 3.86 | Fails 4.5:1 and collides with the existing gold accent/sort language |
| `#e9c46a` (repo `--c-sort`) | 4.86 | Passes, but gold already means "sorted" in this UI; wrong hue for any suit |
| `#ffabab` (paler red) | 4.51 | Passes but with only 0.01 margin — too fragile; `#ffb3b3` keeps more red with real margin |
| `#7dffa8` (neon mint) | 6.47 | Passes easily but neon harsh; `#86efac` is softer against felt with ample margin |
