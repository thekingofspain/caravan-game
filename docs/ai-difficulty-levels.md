# AI difficulty levels: current map, defects, and proposal

## 1. Current-level map

Levels are defined in `src/model/types.ts:AiLevel` (`"normal" | "hard" | "expert"`),
dispatched in `src/model/ai.ts:determineBestMove` (opts parsing `ai.ts:453-459`),
wired through `src/viewmodel/useGame.ts` (`AI_LEVEL_KEY`, `loadAiLevel`, `determineBestMove(state, Ai, { level: aiLevel })` at `useGame.ts:110`)
and selected in `src/view/Board.tsx:740-753` (Normal first, default; `determineBestMove` also defaults to `"normal"` at `ai.ts:454`).
Intended ordering is normal < hard < expert (list order, naming, and search effort).

| Level | Entry point | Eval | Search | Randomness / mistakes |
|---|---|---|---|---|
| normal | `determineBestMove` `ai.ts:461-481` | `evaluateBoard` + `calculateCaravanAdvantage` (`ai.ts:43-76`; weights `EVAL_SOLD_WEIGHT=100`, `EVAL_BUST_WEIGHT=80`, `EVAL_TIE_WEIGHT=20`) | greedy 1-ply over `nonLosingMoves`, `discardCard` −0.5 | none by design: `rng` only breaks exact-score ties (`ai.ts:481`) |
| hard | `determineTacticalBestMove` (`ai.ts:346-366`) | `evaluateTacticalBoard` (`ai.ts:150-197`) + `tacticalMoveBonus` (`ai.ts:212-327`) | greedy 1-ply, immediate-win shortcut (`ai.ts:355`) | tie-break only (`ai.ts:365`) |
| expert | `determineExpertBestMove` (`ai.ts:370-446`) | same tactical eval + `bonus` carried into `final = minReply + bonus` (`ai.ts:435`) | 1-ply order, top-K `EXPERT_BREADTH = 12` (`ai.ts:30,393`), 2-ply opponent-reply min (`ai.ts:404-434`) | tie-break only (`ai.ts:445`) |

Hard's tactical eval on top of the lane base (`laneBase`, `ai.ts:93-107`) adds:
match urgency `15 * (mySellers − oppSellers)`, `−50` at two opponent sellers, `+25` at two own sellers;
mobility `min(countPlaceablePairs, 8)` (`countPlaceablePairs`, `ai.ts:111-124`, via `canPlaceCard` from `src/model/rules/caravanCardRules.ts`)
minus `6` per dead lane (`isLaneDead`, `ai.ts:126-146`); minus `10` per own sold lane while the
opponent holds a Jack (`ai.ts:185-194`). All three levels share the `nonLosingMoves` guardrail (`ai.ts:335-344`).

## 2. Defect diagnoses

### (a) Difficulty ordering is not what the labels promise

- **Correction (2026-09-12, verified by probe): `calculateCaravanAdvantage` is NOT inverted.**
  `calcLaneScoreboard(human, ai)` (`scoring.ts:69-81`) returns `seller` positionally: `Human` = first arg wins,
  `Ai` = second arg wins (`isPlayerTheSeller`, `scoring.ts:83-85`). `calculateCaravanAdvantage(current, opposing)`
  (`ai.ts:43-63`) always passes the acting player first (`evaluateBoard`, `ai.ts:65-76`), so `seller === Human`
  means "acting player sells" (+100) and `seller === Ai` means "opponent sells" (−100) — correct for both seats.
  Probe with real fixtures (`sold21Lane`/`smallLane`): `evaluateBoard(state, Ai)` = **+100 when AI sells,
  −105 when Human sells**. The old claim below (seat-absolute inversion) is wrong; the `Human`/`Ai` labels
  in that function are positional, as the `ai.ts:44` comment says. True absolute-seat callers
  (`caravanSeller`, `scoring.ts:93-98`; `getCaravanScores`, `scoring.ts:120-145`) pass `(Human, Ai)` in order.
- **Diminishing returns on won lanes (by design).** Own sale pays `100 + (myPoints − 21)` (`ai.ts:52` positional),
  so padding a won 21 → 22 earns +1 while winning a new lane earns +100. The AI therefore deprioritizes
  already-won lanes — the intuition in the margin note is correct, but the −100 is opponent-selling, not own-won.
- **No level has a mistake/randomness mechanism**, so "easiest" cannot come from tuned fallibility:
  all three are greedy argmax with `rng` used solely for exact ties
  (`ai.ts:365,445,481`). Normal's weakness is therefore accidental (wrong objective + ties),
  not designed, and its visible behavior — parking its own lanes just under sellable (the −100
  cliff at `ai.ts:54` punishes completing a sale), never removing (`Jack` removal of a human row
  lowers nothing it values), occasionally gifting Kings onto human rows — reads as erratic
  rather than easy. Meanwhile hard/expert self-weaken by firing removals for near-zero value
  (see (c)), so they can feel *easier* than normal. Net effect: perceived order flattens or
  inverts versus the intended normal < hard < expert.
- Test evidence of the split: hard Jacks/Queens an opponent seller (`ai-levels.test.ts:97-113`)
  while normal "ignores the scoreless Queen play and builds instead" (`ai-levels.test.ts:116-122`) —
  consistent with normal maximizing the wrong objective rather than playing weakly on purpose.

### (b) "Do not commit suicide" clauses: located, with gaps

Located:

- `nonLosingMoves` (`ai.ts:335-344`): filters out any move after which `isWinningState(applyMove(state, a), opp)`
  (`isWinningState`, `ai.ts:329-331`, via `gameWinner` from `src/model/scoring.ts`), falling back to
  all moves when every move loses. Covers all levels; tested in `ai-levels.test.ts:227-307`
  (normal disbands instead of selling into a loss; hard/expert avoid the losing sale; all-moves-lose still moves).
- Tactical/expert immediate-win takes (`ai.ts:355`, `ai.ts:379-388`).
- Expert reply filter (`ai.ts:409-433`): drops opponent replies that hand the AI an immediate win
  (`suicide`), treats replies that win the opponent the game as `−Infinity` (`kill`).

Gaps:

- **1-ply horizon (normal/hard).** The guardrail blocks only a move that loses *on the spot*.
  Setting up a forced loss two plies out (e.g. selling lane 2 while the opponent already holds
  the other two sellers-in-waiting) passes the filter; only expert's reply search (`ai.ts:404-434`) sees it.
- **Lane-level suicide is not suicide by this definition.** Busting or disbanding one's own sold lane,
  or King-gifting the opponent into a sale, never triggers `nonLosingMoves` unless the *game* ends.
  Worse, normal's inverted eval (`ai.ts:52-54`) can actively *prefer* gifting the opponent a sale.
- **Fallback and asymmetry.** When all replies `suicide`, expert plays into one anyway
  (`ai.ts:420-421`); when all moves lose, any level plays a losing move (`ai.ts:343`).
  The normal path checks only `gameWinner(next)` (`ai.ts:469`) while tactical/expert check the
  fuller `isWinningState` (phase/winner included) — a latent inconsistency for exotic terminal states.
- **No pioneer protection.** Nothing prices "my only playable lane" — discarding a playable value card
  costs just −4 / −0.2 (`ai.ts:305-313`) and expert's `minReply` sees only one reply ply, so slow
  self-strangulation (Queen own dead lane is +8 at `ai.ts:267-269`, but creating the dead lane is unpriced).

### (c) Removal cards fire at the first chance, with no value check (Jack; Joker partly)

- `tacticalMoveBonus` prices **any** Jack on an opponent lane at `+10` even when it breaks nothing
  (`ai.ts:228-232`: `before[lane] === -1 ? 60 : 10`). A sold-lane break pays 60, everything else 10 —
  but building a value card typically nets only ~1–3 eval points (`(myPoints/21)*5` slope in `laneBase`),
  so the +10 fires the Jack immediately on turn one against a 5-point lane. There is **no check of
  the removed row's points**, no hand-size/urgency scaling, and no conservation across the game.
- Target enumeration makes this worse: `operationCardTargets` (`src/model/engine.ts:461-493`)
  emits one legal move **per row** (`cardIndex`), so a Jack always has a trigger available, and
  selection is pure argmax (+ tie-break), shared by `determineTacticalBestMove` (`ai.ts:346-366`)
  and expert's 1-ply ordering (`ai.ts:376-390`).
- Joker is half-fixed: its bonus sums actually-removed opponent points, capped at 40, plus 50 for
  breaking a sale (`ai.ts:274-295`) — a real value check. But it ignores **self-damage**: `jokerRemovals`
  (`src/model/engine.ts:129-160`) matches rows on *both* sides (`for (const player of PLAYERS)`),
  while the bonus loop tallies only the opponent's delta (`ai.ts:277-283`). A Joker that also wipes
  the AI's own seller still scores up to +60.
- Normal avoids all of this only by accident (inverted eval, see (a)), not by conservation logic.

### (d) No concept of *which* row to remove; repeats on the same caravan

- **Jack targeting is value-blind.** All rows in the chosen lane score identically (+60 / +10 at
  `ai.ts:228-232`); `cardIndex`, row points (`calculateRowPoints`, `src/model/scoring.ts:20-26`),
  and attached Kings (doubled rows) are never read. Removing a 10+K row and a lone Ace pay the same,
  so the pick among equal-best moves is pure `rng` tie-break (`ai.ts:365,445`).
- **No cooldown, no memory.** The AI is stateless — `determineBestMove(state, acting, rng)` takes no
  history and never reads `GameState.log` (`LogEntry` with `player`/`action`/`target` exists at
  `src/model/types.ts:219-229`, but `src/model/ai.ts` references no log field). After Jacking one row,
  the same lane offers the same +10/+60 next turn (remaining rows are still enumerated by
  `operationCardTargets`), so it fires again "for no reason". Joker repeats the same way whenever
  its removable-sum beats building.
- Queen strangling (`+12` onto an opponent seller, `ai.ts:265`) has the same one-shot shape, but
  Queens attach only to the last row (`engine.ts:481`) and are less repeatable, so the visible
  repeat offender is Jack/Joker removal.

## 3. Proposed 3-level design (minimal, no new abstractions)

Grounding: everything below uses existing symbols — `legalMoves`/`applyMove` (`src/model/engine.ts:452,522`),
`calculatePoints`/`calculateRowPoints`/`isSellablePoints`/`MIN_SELLABLE`/`MAX_SELLABLE` (`src/model/scoring.ts`),
`laneSeller`/`laneBase`/`sellersOf`/`countPlaceablePairs`/`isLaneDead`/`tacticalMoveBonus`/`nonLosingMoves`/`EXPERT_BREADTH`
(`src/model/ai.ts`), `canPlaceCard` (`caravanCardRules.ts`), `GameState.log`/`TargetRef` (`src/model/types.ts:191-229`).

- **Normal (a6 behavior, restored).** Pure greedy `evaluateBoard` + `nonLosingMoves` guardrail, no
  epsilon-random detour, immediate-win take via `gameWinner`. Weakness is accidental (wrong
  objective + ties), not designed fallibility.
- **Middle = `hard` label (conservation).** Status: implemented (shared `tacticalMoveBonus`). Jack:
  `saleBreak ? 60 : min(removedRowPoints × distanceWeight, 20)` — measured row delta
  (`calculateRowPoints`), full weight within one play of selling, decaying beyond, so second hits on a
  degraded lane lose to building/rotating with no log read. Joker: net both-sides delta, pays only if
  `net > 0` and (sale-break or `net ≥ JOKER_MIN_VALUE = 8`), capped as before. Keep 1-ply.
- **Expert + Master (value targeting + win awareness).** Status: implemented (`tacticalMoveBonus` `level`
  param; expert/master pass their level, hard defaults). Value targeting and distance-weighted Jack live in
  the shared bonus (all levels above normal benefit). Ship-count is expert/master-only: 1→2 sellers +30,
  letting opp reach 2 −40 on `playValueCard`. Master adds `masterMoveBonus` (reward + risk) on the 2-ply shape.
  Anti-repeat falls out of the same net-change (no flat penalty, no log read needed). Value a removal by the
  lane's distance-to-sellable (`MIN_SELLABLE − oppPoints`, `scoring.ts:15`): the first hit on a 19 (one move
  from selling) denies a near-win and scores ~removedRowPoints at full weight; the same lane at 11 is ~10
  points / ~2-3 moves from sellable, so a second hit scores the same row points against a lane that is
  already dead — relatively worth less than building or rotating to a live 19 elsewhere. If the opponent
  rebuilds the lane to 19 ("touched"), the weight restores automatically. Bonus scaling: full removed-points
  value when `oppPoints` was within one play of sellable, decaying as the gap grows — implemented inline in
  `tacticalMoveBonus` from `prev` lane totals, no `log` scan, no new fields.
- **Master (new 4th label, expert + risk-vs-reward).** Status: implemented (`masterMoveBonus` +
  `determineMasterBestMove`, `src/model/ai.ts`; `AiLevel` in `types.ts`; selector in `Board.tsx`;
  persistence in `useGame.ts`; tests in `test/ai-levels.test.ts`). Keep the expert 2-ply shape (`EXPERT_BREADTH`, `ai.ts:370-446`)
  and all hard/expert net-change scorings above, and add two move-level terms in `tacticalMoveBonus`
  (both computed from `prev`/`next` lane totals with existing symbols — no new state, no deeper search):
  (a) **Reward — getting closer to selling.** `reward = Σ max(0, myDistBefore − myDistAfter)` over lanes,
  where `myDist = max(0, MIN_SELLABLE − myPoints)` for unsellable lanes (`scoring.ts:15,28`), scaled ~+2/pt
  (cap ~+16/move) so steady progress beats stalling but never outranks a sale-break (60). Seller transitions
  keep the Item-5 bonuses (1→2 sellers +30). Busts score via existing `laneBase` (`−80`), untouched.
  (b) **Risk — minimal opponent plays to win.** Assume the best case for the opponent (any value card closes
  up to 10/turn; precedent for reading the opponent hand: `oppHoldsJack`, `ai.ts:185`). Per lane:
  `oppPlies = 0` if opp sells (`sellersOf === −1`); `1` if one legal hand placement (`canPlaceCard`,
  `caravanCardRules.ts`) reaches sellable — check the ~15 (lane × hand) hypotheticals directly; else
  `ceil((MIN_SELLABLE − oppPoints) / 10)` (0/negative→0, busted→∞). Game level: `oppGamePlies` = sum of the
  two smallest lane plies (two lanes win the game; `gameWinner`, `scoring.ts:163-171`). Move bonus:
  `+30 × (oppGamePliesAfter − oppGamePliesBefore)` — moves that push the opponent's win further out score,
  moves that let it shrink go negative; capped so blocking an immediate (`1 → 2+`) outranks any build.
  Acceptance: in a fixture with opp at (sold + 19-one-away) vs own buildable lane, master blocks/closes
  instead of padding; with opp far (gamePlies ≥ 3) it plays the best progress move (reward term only).

What is deliberately *not* proposed: deeper search, opponent-hand modeling, transposition tables,
new eval abstractions, difficulty-specific weights beyond the three constants above.

## 4. Tuning knobs (all in `src/model/ai.ts`)

| Knob | Applies to | Suggested default | Effect of turning it |
|---|---|---|---|
| Normal | a6 greedy + guardrail | no fallibility knob (pure argmax, ties by rng) |
| `JACK_SALE_BREAK` (inline) | hard, expert | 60 | sale-breaks outrank any row snipe |
| Jack/Joker row value | hard, expert | measured delta, cap ~20 / net ≥ ~8 emerges | no constant: below ~7 building wins naturally |
| distance-to-sellable weight (inline in `tacticalMoveBonus`) | expert (opt. hard) | full ≤1 move away, decay beyond | second hit on degraded lane loses to rotation/building |
| reward scale (inline) | master | +2/pt, cap +16 | higher = greedier progress; sale-break still wins |
| risk scale (inline) | master | +30/ply of `oppGamePlies` pushed out | higher = more defensive; 1→2+ block outranks builds |
| seller-count move bonus/penalty (inline) | expert | +30 / −40 | scales win-awareness vs raw points |
| `EXPERT_BREADTH` (exists, `ai.ts:30`) | expert | 12 (unchanged) | raise only if profiling allows; not a difficulty lever per se |

## 5. Acceptance checks per level

Write as unit tests reusing the existing fixtures in `test/ai-levels.test.ts`
(`jackSituation`, `queenSituation`, `losingSaleSituation`, `mkGame`/`mkPlayer`, `mulberry32`):

- **Easy**: (1) acting-relative sanity — in `jackSituation`, easy's argmax over `evaluateBoard`
  ranks building above gifting the opponent (fails today: opponent sale ≈ +100);
  (2) fallibility — over N seeded runs (`mulberry32`), easy picks a non-argmax legal move at least once
  (fails today: pure argmax + tie-break); (3) still legal every ply (mirror the hard/expert legality loops).
- **Normal**: (1) Jacks the opponent seller in `jackSituation` (already passes; keep);
  (2) NEW: with the opponent seller removed from the fixture (all lanes unsold, small rows < `JACK_MIN_VALUE`),
  normal plays a value card instead of the immediate Jack (fails today: +10 fires);
  (3) Joker with net self-damage scores ≤ building (fails today: own-side loss uncounted).
- **Expert**: (1) takes the immediate win (already passes, `ai-levels.test.ts:186-224`; keep);
  (2) NEW: given two Jackable rows (fat King-doubled row vs lone Ace), expert targets the fatter row
  deterministically across seeds (fails today: value-blind tie-break);
  (3) NEW: after a logged AI Jack on lane L (prepend a `LogEntry` with `action: "playOperationCard"`,
  `target: { player: Human, lane: L, … }` to `state.log`), expert prefers an equal-value removal in
  another lane or building (fails today: no log read, repeats);
  (4) avoids the `losingSaleSituation` sale (already passes; keep) and prefers the 1→2-sellers
  value play when offered.
- **Global**: intended order normal < hard < expert is asserted as removal discipline
  (easy ≈ never removes deliberately; normal removes only sales/fat rows; expert removes with
  value targeting and no immediate repeats) rather than by win-rate, which is seed-noisy.
