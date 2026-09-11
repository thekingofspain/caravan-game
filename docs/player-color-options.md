# Player Color Options (Human vs AI)

Tournament-blue felt `#17456b` (panel `#1d4e7a`). Gold accent `#d4af37` and
sort highlight `#e9c46a` are fixed and out of scope, as are felt/suits.

## 1. Baselines (current colors, WCAG G18 math)

Contrast math per W3C WCAG 2.x Technique G18
(<https://www.w3.org/TR/WCAG20-TECHS/G18>): for each sRGB channel
`C`, linearize (`C/12.92` if `C <= 0.04045`, else `((C+0.055)/1.055)^2.4`),
then `L = 0.2126·R + 0.7152·G + 0.0722·B`, and
`ratio = (L_lighter + 0.05) / (L_darker + 0.05)`.
AA threshold for normal text is 4.5:1
(<https://www.w3.org/TR/WCAG21/#contrast-minimum>).
Felt `#17456b` → `L = 0.0550`.

| Side | Hex | L | Ratio vs felt | Verdict |
| ---- | --- | --- | --- | --- |
| Human (light blue) | `#8ab4f8` | 0.4482 | **4.75:1** | passes, thin margin |
| AI (salmon) | `#ff8a8a` | 0.4127 | **4.41:1** | **marginal fail** (< 4.5) |

Secondary problem: human `#8ab4f8` (hue ~217°) sits almost on top of the
diamonds suit `#a8c6ff` (hue ~219°, both pale unsaturated blues), so the
"you" color is confusable with a card suit. AI salmon `#ff8a8a` (hue 0°)
sits in the crowded pink/red band with hearts `#ffb3b3` and the
sold/error `#fb6f52`.

## 2. Precedents (primary sources)

### (a) Baccarat: blue = Player side, red = Banker side, green = Tie

Michael Shackleford's baccarat scoreboard survey documents a real casino
display (Venetian, with staff help and photos): on the bead plate
"wins are recorded as follows: Blue = Player win, Red = Banker win,
Green = Tie win", and the Big Road likewise "marking Player wins in
blue, and Banker wins in red" (there as circle outlines). Source:
<https://wizardofodds.com/games/baccarat/history/>. Caveat worth knowing:
the derived roads (Big Eye Boy / Small Road / Cockroach Pig) re-use red
and blue with a *different* meaning (red = repetition, blue = choppiness),
so red-vs-blue in baccarat means "the two sides" only on the bead plate
and Big Road. Takeaway for us: **cool-blue vs warm-red is the established
two-sided casino-display idiom** — but literal red fails contrast on our
felt (bad red `#c0392b` = 1.84:1), so any red side must be warmed/lightened
toward orange/vermilion (see §4, pair B).

### (b) Fighting games: 1P/2P = blue corner vs red corner

Capcom's official Street Fighter seminar (Shadaloo C.R.I.) states:
"Player 1 is the character on the left, while player 2 is the character
on the right… It's kind of like the red and blue corners in boxing."
and "Player sides are predetermined at the beginning of the fight, and do
not change until the match is over." The same article notes health gauges
are green and distinct from side identity. Source:
<https://game.capcom.com/cfn/sfv/column-130281?lang=en>. Takeaway: the
dominant head-to-head video-game idiom is also **blue-vs-red corners**,
reinforcing (a). Same adaptation applies: shift red → orange for contrast
and red-green-CVD safety.

### (c) Chess and Go: light-vs-dark / Black-vs-White sides

- Chess (FIDE Laws of Chess, in force 1 Jan 2023): "The player with the
  light-coloured pieces (White) makes the first move", White has "16
  light-coloured pieces", Black "16 dark-coloured pieces", on a board of
  squares "alternately light (the 'white' squares) and dark (the 'black'
  squares)". Source: <https://handbook.fide.com/chapter/e012023>
  (Articles 1.2, 2.1, 2.2).
- Go (AGA Concise Rules of Go): "The two sides, known as Black and White",
  "The players alternate in moving, with Black playing first."
  Source: <https://www.cs.cmu.edu/~wjh/go/rules/AGA.concise.html>
  (Rules 1–2, for the American Go Association).

Takeaway: the abstract-strategy tradition is **light side vs dark side**,
with the human/first player usually light. Literal white/black is
unusable here (white `#ffffff` is a suit color; black fails contrast on
dark felt), but the *principle* — sides differ primarily in lightness
family AND hue, and the human is the lighter/cooler side — supports
keeping Human on the light-cool color in every pair below.

### (d) Televised/broadcast poker heads-up color

No fixed two-color convention found. Broadcast distributors (PokerGO/WSOP,
PGT event coverage) assign per-player graphics packages, not permanent
side colors, so there is no citable precedent to adopt. Skipped
deliberately; the casino-display (a) and fighting-game (b) precedents
agree with each other and suffice.

### CVD-safety references used

- Masataka Okabe & Kei Ito, "Color Universal Design" (primary):
  <https://jfly.uni-koeln.de/color/>. Applied principles: never encode
  only in red-vs-green (red-green CVD affects ~8% of Caucasian males);
  pair "warm" with "cool" colors; "use vermilion … instead of pure dark
  red"; keep brightness/saturation differences, not hue alone; and use
  **redundant coding** (shape/label/position alongside color) — our side
  badges already carry labels and fixed left/right positions, so color is
  never the sole channel.
- Standard Okabe–Ito hex reference (secondary, for exact-hex checks):
  <https://easystats.github.io/see/reference/palette_okabeito.html>
  (sky blue `#56B4E9`, orange `#E69F00`, vermilion `#D55E00`, yellow
  `#F0E442`, blue `#0072B2`, bluish green `#009E73`, reddish purple
  `#CC79A7`).

## 3. Hard-constraint check method

Every candidate below was computed with the §1 formula against felt
`L = 0.0550`. Reserved hues checked against: suits white `#ffffff`,
pink `#ffb3b3`, light blue `#a8c6ff`, mint `#86efac`; accents gold
`#d4af37` / sort `#e9c46a`; error states bad red `#c0392b` /
sold `#fb6f52`; success `#2ecc71`. Note the exact Okabe–Ito sky blue
(`#56B4E9`, 4.33:1) and orange (`#E69F00`, 4.44:1) both *just fail* on
this felt (dark blue background demands `L ≥ 0.4225`), so all pairs use
slightly lightened Okabe–Ito-hue derivatives — same hue axis, passing
lightness.

## 4. Candidate pairs (ranked)

| # | Pair | Hexes | Ratio vs felt (each) | Mutual separation + CVD note | Precedent | Suit/accent collision check |
| - | ---- | ----- | -------------------- | ---------------------------- | --------- | --------------------------- |
| A ★ | Sky vs Sandy Orange | Human `#4CC9F0`, AI `#F4A261` | 5.20:1 / 4.85:1 — both pass with margin | Hue gap ~168° (194° vs 27°), near-complementary. Blue-vs-orange is the canonical protan/deutan-safe axis (warm+cool per Okabe–Ito); protan red-darkening does not apply to either endpoint. Side identity is redundantly coded by label + fixed position. | Baccarat bead-plate blue-vs-warm + Capcom blue/red corners, red warmed to orange for contrast | Human: same blue family as diamonds `#a8c6ff` (219°) but clearly separated — saturated azure (L 0.496) vs pale periwinkle (L 0.559), ~25° hue gap; **largely fixes** the current near-collision. AI: orange 27° sits ~19° off gold 46°/sort 43° and ~17° off sold coral 10° — maximally equidistant in the crowded warm band; lightness matches gold but hue differs (orange-vs-yellow is an Okabe–Ito-distinguishable pairing). No touch on hearts pink, mint, or success green. |
| B | Deep Sky vs Light Vermilion | Human `#38BDF8`, AI `#FF9E5E` | 4.67:1 / 4.91:1 — both pass | Hue gap ~175° (198° vs 24°). Lightened vermilion follows Okabe–Ito literally ("use vermilion instead of pure dark red"); safe under red-green CVD via the blue channel + lightness difference. | Most precedent-faithful: closest to baccarat blue-vs-red and boxing corners with minimal warming | Human keeps the current blue family (least visual change, weakest diamonds fix of the three — still improves via higher saturation). AI vermilion 24° is clearly off hearts pink (0°) and sold coral (10°), ~22° from gold; no mint/green contact. |
| C | Violet vs Amber | Human `#C3B2FF`, AI `#FFB020` | 5.30:1 / 5.47:1 — highest margins | Hue gap ~215° (253° vs 39°) — largest separation. Blue-family vs yellow-family is red-green-CVD-safe; residual note: yellow-vs-violet is nearer the (very rare, ~0.001% per Okabe–Ito) tritan confusion line, acceptable given margins + redundant coding. | Chess/Go light-vs-dark principle (max lightness-family contrast); warm/cool alternation per Okabe–Ito | **Best diamonds fix**: violet 253° reads clearly purple against diamonds blue 219°. Caveat: amber 39° is the closest approach to gold 46°/sort 43° of the three (~4–6° hue gap, distinguished mainly by lightness L 0.524 vs 0.449/0.578); prefer A or B if the sort highlight and AI badge ever sit adjacent. No pink/mint/red contact. |

All three pairs keep Human = cool side (continuity with "you are blue"
and the chess/Go lighter-side-first principle) and move AI off the
failing salmon into the orange family (contrast-passing, off the
pink/red error band).

## 5. Recommendation

**Adopt pair A: Human `#4CC9F0` / AI `#F4A261`.**
Both colors clear AA with real margin (5.20 / 4.85, vs today's 4.75 /
4.41-fail), the hues are near-complementary and safe under the common
red-green deficiencies by construction (Okabe–Ito warm/cool axis), the
diamonds near-collision is substantially fixed, and the warm endpoint is
positioned as far as the gamut allows from both gold/sort and coral/sold.
It is also the most idiomatic choice: baccarat blue-vs-warm and the
fighting-game blue corner agree on it.

## 6. Rejected options (one line each)

- Exact Okabe–Ito `#56B4E9` / `#E69F00`: right hues, but 4.33 / 4.44 —
  both fail AA on this felt.
- Pure white human (`#ffffff`): perfect chess homage, but white is a suit
  color — direct collision.
- Literal baccarat red (`#c0392b`, 1.84) or sold coral (`#fb6f52`, 3.57):
  fail AA and collide with the error palette.
- Current salmon `#ff8a8a` (4.41): fails AA and crowds hearts pink.
- Okabe–Ito yellow `#F0E442` (7.56): passes hugely but collides with sort
  `#e9c46a` (both yellows, ~13° apart).
- Teal/aqua band (e.g. `#4FD1C5`, 5.36): passes but crowds suit mint
  `#86efac` and risks deutan confusion (green-cyan axis).
- Dark Okabe–Ito endpoints `#0072B2` (1.93), `#009E73` (2.92),
  `#D55E00` (2.59), `#CC79A7` (3.27): all fail AA on dark-blue felt.
- Pink/magenta AI options: collide with hearts `#ffb3b3` and read as
  error-adjacent next to sold `#fb6f52`.
