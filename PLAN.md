# Plan: Caravan Mini-Game UI Reskin + CSS Slot Positioning

## 0. Skills the implementing agent must load

1. **`playwright-cli`** (for the e2e browser tests)
   - This skill is already injected in the session. The agent should drive/validate the browser with its commands and **read `references/playwright-tests.md`** and **`references/running-code.md`** from the skill directory for authoring/running Playwright e2e specs.
   - The existing e2e files are plain Node ESM scripts: `import { chromium } from "playwright";` run via `node e2e/<file>.mjs`. They expect a running server at `BASE_URL` (default `http://localhost:5173`). Start it with `npm run dev` or `npm run preview` before running e2e.
2. **(Optional) Frontend design-taste skill** — only if the agent wants extra design guidance: load `frontend-category-pointer`, then read `/root/.config/opencode/skill-libraries/frontend/high-end-visual-design/SKILL.md` (or `design-taste-frontend`). The concrete visual spec is already in this plan, so this is optional.

---

## 1. Goal

Reskin the existing Fallout: New Vegas **Caravan** web game (`/root/src/caravan`) so its look & layout match the authentic in-game Caravan screen, while keeping all game logic and all existing Playwright e2e tests green. Reproduce the **general layout**; the felt background may be a **simplified SVG** (not a photoreal capture).

## 2. Research summary (look & feel)

- **Layout:** single screen split by a central divider — **opponent's 3 caravans across the top**, **your 3 caravans across the bottom**, **your hand in a tray at the bottom**. Each caravan is a vertical column of overlapping cards with a name + running total. Win = sell 2 of 3 caravans in the 21–26 range and outbid the opponent's matching caravan.
- **Palette (chosen):** muted **olive/khaki felt**, **cream** text, **brass/amber** accent (NOT neon green terminal, which is the current wrong look).
- **Cards:** `public/cards/*.svg` are already ordinary white playing-card SVGs with black suit pips — correct and already pass the e2e "light body" check. **Do not change them.**

## 3. Existing coding standards to preserve (documented decisions)

1. **SVGs as background images** — cards use `background-image:url(/cards/x.svg)`; new felt uses `background-image:url(/felt.svg)`.
2. **Flexbox** — used for overall flow (`.app`, `.board`, `.side`, `.tray`, `.hand`). **Exception (explicitly requested):** cards *inside a caravan* are positioned with **fixed CSS selectors (`:nth-child`)**, not flex, because they overlap.
3. **No `<style>` tags** — all CSS stays in `src/global.css`. Only `style={{ "--count": n }}`-style **CSS custom-property bindings** may appear in JSX (these are not `<style>` tags).
4. **Card-unit / vh system (new, requested):** the whole board is measured in **card-height units derived from `vh`**. No `transform` is used for positioning (explicitly forbidden). Vertical/horizontal offsets are integer multiples of a card unit.

## 4. Positioning model (precise geometry — from user)

- A caravan's `cards[]` array defines the **rows**. Card at array index `k` → **row `k`**.
- **The board center line (the `.mirror` divider) is where row 0 (the first card) sits.**
  - **AI caravans grow UPWARD** from the center → rows anchored at the **bottom** edge of the caravan stack, increasing `bottom` per row.
  - **Human caravans grow DOWNWARD** from the center → rows anchored at the **top** edge, increasing `top` per row.
- **Face cards** (`pc.attachments`) sit in the **same row** as the value card they attach to, **one column to the right** (`col 1`, then `2, 3…` for multiple attachments).
- **All measures are vh/card-unit multiples** (no px, no transform). The sign/direction is expressed by which edge is anchored (`top` for human, `bottom` for AI) — i.e. the per-player "sign" is the anchor choice, satisfying "var negative/positive by player" without `transform`.

### 4.1 Card-unit CSS variables (all vh-derived)
```css
:root{
  --card-h: calc(100vh / 10);
  --card-w: calc(var(--card-h) * 169.075 / 244.64);
  --cu:   calc(var(--card-h) * 0.22);   /* vertical step per row   */
  --cu-x: calc(var(--card-w) * 0.55);   /* horizontal step per col */
  /* palette */
  --c-bg:#15170f; --c-felt:#23271d; --c-panel:#2c3127; --c-panel-2:#343a2e;
  --c-fg:#e6dcc0; --c-accent:#c9a24b; --c-dim:#9a917a; --c-bad:#c8743e; --c-line:#4a4636;
}
```

### 4.2 DOM structure (replaces current `.row`/`.position` wrappers)
```
.caravan__stack                      (position:relative; width:var(--card-w); height in card units)
  .caravan__row                      (one per value card → its row index)
    .placed-wrap  (value card, column 0, left:0)  [keeps data-placed/data-player/data-caravan/data-index]
    .placed-face  (attachment 1, column 1)
    .placed-face  (attachment 2, column 2)
    ...
```

### 4.3 CSS — fixed selectors, no inline row/col, no transform
```css
.caravan__stack{
  position:relative; width:var(--card-w);
  height: calc(var(--card-h) + (var(--max-rows,16) - 1) * var(--cu));
}
.caravan__row{ position:absolute; left:0; width:var(--card-w); }
.placed-wrap{ position:absolute; left:0; top:0; }      /* value card = column 0 */
.placed-face{ position:absolute; top:0; }               /* column set by nth-child below */

/* ---- vertical slots: human grows DOWN (top), AI grows UP (bottom) ---- */
.side--human .caravan__stack > .caravan__row:nth-child(1){ top: calc(0 * var(--cu)); }
.side--human .caravan__stack > .caravan__row:nth-child(2){ top: calc(1 * var(--cu)); }
.side--human .caravan__stack > .caravan__row:nth-child(3){ top: calc(2 * var(--cu)); }
/* …generate up to ~16… */

.side--ai .caravan__stack > .caravan__row:nth-child(1){ bottom: calc(0 * var(--cu)); }
.side--ai .caravan__stack > .caravan__row:nth-child(2){ bottom: calc(1 * var(--cu)); }
.side--ai .caravan__stack > .caravan__row:nth-child(3){ bottom: calc(2 * var(--cu)); }
/* …generate up to ~16… */

/* ---- horizontal slots for face cards within a row (value card = child 1) ---- */
.caravan__row > .placed-face:nth-child(2){ left: calc(1 * var(--cu-x)); }
.caravan__row > .placed-face:nth-child(3){ left: calc(2 * var(--cu-x)); }
.caravan__row > .placed-face:nth-child(4){ left: calc(3 * var(--cu-x)); }
/* …generate up to ~6… */
```
Notes: rows are bounded (cap ~16), face columns bounded (~6). `.caravan__stack` `overflow: visible` so face cards sticking out to the right remain visible.

## 5. Files to change

### `src/global.css`
- Add the `:root` card-unit + palette vars above (replace the neon-green `--c-accent:#39ff14` / `font-mono:Courier` theme).
- `.app`: felt background + stitched frame:
  ```css
  .app{ background: url(/felt.svg) center/cover, radial-gradient(circle at 50% 0%, rgba(201,162,75,.06), transparent 60%), var(--c-bg); }
  ```
- Reskin `.mirror` (dashed center divider), `.side`/`.side--human`/`.side--ai`, `.caravan`, `.caravan--sold`, `.btn`, `.log`, `.modal`, `.start`, `.tray`, `.hand`, `.card.is-selectable` etc. to cream-on-olive + brass. Keep all existing **class names**.
- Replace the current `.placed-wrap`/`.caravan__stack` positioning block (which uses `--k`/`--overlap-v`) with the §4.3 rules. Remove `.row`/`.position { display:contents }` blocks (no longer used).
- Convert `.caravans` container if desired to flex (keep 3 equal columns); otherwise leave as grid — not a card-overlap concern.

### `src/ui/Board.tsx`
- For each `car.cards` entry `pc` at index `k`, render a `.caravan__row` containing:
  - `.placed-wrap` (value card via `<CardView>`, plus the existing king-multiplier badge) with `data-placed data-player data-caravan data-index={k}` and `onMouseEnter/Leave` hover handlers (keep current hover/legal logic unchanged).
  - for each `pc.attachments[j]` a `.placed-face` (via `<CardView>`) — display-only, **no** click target.
- Remove the existing `.row`/`.position` wrapper divs.
- Keep `--count` on `.caravan__stack` only if needed for min-height; otherwise drop the inline `--k`. (No per-card `--row`/`--col` inline styles — position is pure CSS per §4.3.)
- Preserve every class the e2e tests rely on (see §7).

### `src/ui/CardView.tsx`
- `PlacedCardView`: render value card + king badge (unchanged), and render `placed.attachments` as `.placed-face` `<CardView>` elements.

### `public/felt.svg` (new)
- Simple SVG: olive radial vignette + faint diagonal hatch / stitched border. **Simplified**, not a photoreal felt capture (per user instruction).

### `package.json`
- Add script: `"test:e2e": "node e2e/cards.e2e.mjs && node e2e/hand-cards.e2e.mjs && node e2e/opponent-stacking.e2e.mjs && node e2e/win-game.e2e.mjs"`.

### `e2e/win-game.e2e.mjs` (new)
- Mirrors `opponent-stacking.e2e.mjs` auto-play loop: repeatedly click `.hand__slot.is-selectable`, then a `.side--human .caravan.is-selectable` or `.placed-wrap.is-target`, else `.btn` "Discard selected", until `.controls__hint` shows win/lose. Assert no blank/back cards and zero console errors. (Optional: assert final phase text.)

## 6. Things to keep working (verification contract)
- Card height ≈ `100vh/10`; value cards `left:0`; caravan cards stack **vertically only** (no diagonal) — keeps `opponent-stacking.e2e.mjs` assertions (`left === "0px"`, stack width ≈ card width).
- `.placed-wrap` count still equals number of value cards (one per `car.cards` entry).
- No card renders blank/back; no console errors.
- All class names used by e2e must remain: `.start`, `.start .btn`, `.board`, `.tray .hand .card`, `.side--human`, `.side--ai`, `.caravan--1/2/3`, `.caravan.is-selectable`, `.caravan__stack`, `.placed-wrap`, `.hand__slot`, `.hand__slot.is-selectable`, `.controls__hint`, `.card--back`, `.mirror`.

## 7. Validation loop (commands)
```
cd /root/src/caravan
npm run typecheck
npm test                      # vitest unit tests
npm run build                # tsc --noEmit + vite build
npm run preview &            # or npm run dev
node e2e/cards.e2e.mjs && node e2e/hand-cards.e2e.mjs && node e2e/opponent-stacking.e2e.mjs && node e2e/win-game.e2e.mjs
```
Then use `playwright-cli screenshot` (or the e2e `page.screenshot`) to capture the redesigned board and **show it for review**; iterate on palette/spacing if needed.

## 8. Assumptions
- Brass/olive palette (confirmed).
- Card sizing stays `100vh/10` (required by e2e height assertion).
- `.caravans` container may stay `grid` (3 columns) — not a card-overlap issue; converting to flex is optional.
- Row/column counts are bounded for `:nth-child` generation (16 rows / 6 face cols is ample for normal play).
