# Issue — Caravan Activity 2026-09-01T09:23:43.966Z

**Seed:** (random) | **Phase:** play | **Current:** AI | **Winner:** none

## State Snapshot
- **Human** hand:8 deck:15 | hand: 6♥, 3♠, Black Joker, 4♥, 4♠, 5♣, K♦, A♠
  - Boneyard: 2 (unsellable) — rows:1 dir:- suit:diamonds
  - Redding: 16 (unsellable) — rows:2 dir:desc suit:hearts
  - Shady Sands: 26 (sellable) — rows:4 dir:desc suit:clubs
- **AI** hand:8 deck:16 | hand: 4♦, Q♥, A♣, 4♥, 3♦, 3♣, J♦, 8♣
  - Dayglow: 7 (unsellable) — rows:1 dir:- suit:clubs
  - New Reno: 18 (unsellable) — rows:1 dir:- suit:diamonds
  - The Hub: 25 (sellable) — rows:2 dir:desc suit:hearts

## Activity Log
- You played {9♣} to Shady Sands
- AI played {7♣} to Dayglow
- You played {9♥} to Redding
- AI played {9♦} to New Reno
- You played {2♦} to Boneyard
- AI played {10♥} to The Hub
- You played {7♦} to Redding
- AI played {K♠} on AI's The Hub {10♥}
- You played {8♠} to Shady Sands
- AI played {5♣} to The Hub
- You played {7♠} to Shady Sands
- AI played {K♥} on AI's New Reno {9♦}
- You played {2♥} to Shady Sands

## Reported Bugs
1. **Visual stacking:** `You played {2♥} to Shady Sands — the 9 and Jack should be under the 2`. Current rendering placed 9♣+J at top (y≈548) and 2♥ at bottom (y≈656), so 9 was *above* 2 in Y, not under. Expected 9/J below 2 (y larger) with 2 on top covering them. Root cause: human caravan `.track` used `flex-direction: column` (top→bottom) while AI used `column-reverse` (bottom→top). Human newest card appeared at bottom, not top.

2. **Activity log red X:** `the activity log should not have red x entry at all`. The Activity dialog header used `×` (close) and pending removal portal could be mistaken for log entry. Additionally, `Sidebar` used `key={entry.id}` which duplicated on `__setCaravanState` (logId counter desync) causing React console errors and spurious duplicate rendering that looked like extra “×” entries. Fix: header changed to `Close` text, Sidebar keys made unique with index, and duplicate handling.

## Reproduction
- E2E `e2e/shady-2heart-stacking.e2e.mjs` programs Shady with `[9♣+J, 8♠, 7♠]` then plays `2♥`, asserts `nineY > twoY` and `z(2) > z(9)`. Fails before fix (nineY 547 < 655), passes after (716 > 608).
- E2E `e2e/activity-no-redx.e2e.mjs` replays full log sequence, opens Activity, asserts no `.log .confirm` and no `×` in log lines, header uses `Close`. Fails before fix due to duplicate keys and header `×`, passes after.

## Fixes
- `src/view/global.css`: human `.track` now `column-reverse` with `padding-bottom` and `margin-bottom` stacking, matching AI, so newest card on top.
- `src/view/Board.tsx`: Activity and deck overlay close buttons changed from `×` to `Close` to remove spurious × in dialog text.
- `src/view/Sidebar.tsx`: keys changed to `${entry.id}-${idx}` to avoid duplicate-key warnings when logId desyncs via `__setCaravanState`.

## Verification
- `node e2e/shady-2heart-stacking.e2e.mjs` → PASS (nineY 716.8 > 608.8)
- `node e2e/activity-no-redx.e2e.mjs` → PASS (14 lines, 0 × in log, 0 .confirm)
- `npm run test` → 54/54 unit tests pass
