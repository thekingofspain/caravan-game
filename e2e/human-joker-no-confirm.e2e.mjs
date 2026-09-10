#!/usr/bin/env node
// Repro for: human's Red Joker shows a red confirmation X it should not.
//
// Bug report (moves 21-22):
//   - Move 21: You played Red Joker on AI's The Hub 2S
//       removal of 2S from You Boneyard
//   - Move 22: AI played Black Joker on You's Redding 9S
//       removal(s) elsewhere
// After move 22 the AI Joker correctly awaits human ack (confirmer =
// Human, blinking removal + X on the AI target). But the HUMAN Red Joker
// from move 21 ALSO shows a red confirmation X, even though the human
// played it and it needs no confirmation. Only the pending move's target
// (AI Black Joker on Redding) may carry the X.
import { chromium } from "playwright";
import assert from "node:assert/strict";

let id = 50000;
function makeCard(deckId, rank, suitOrJoker) {
  id += 1;
  if (rank === "Joker")
    return { id: `D${deckId}-${rank}${suitOrJoker}-${id}`, suit: null, rank: "Joker", jokerType: suitOrJoker };
  return { id: `D${deckId}-${rank}${suitOrJoker}-${id}`, suit: suitOrJoker, rank };
}
const Human = 0, Ai = 1;
function caravanOf(rows) {
  let direction = null, suit = null;
  if (rows.length >= 2) {
    const val = (c) => (c.rank === "A" ? 1 : Number(c.rank));
    direction = val(rows[1][0]) > val(rows[0][0]) ? "asc" : "desc";
  }
  if (rows.length >= 1) suit = rows[0][0].suit;
  return { rows, direction, suit };
}
function mkPlayer(caravans, hand, deck = []) { return { deck, hand, caravans }; }

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".board");
const startBtn = page.locator(".start .btn, button:has-text('Start')");
if ((await startBtn.count()) > 0) await startBtn.first().click({ force: true });
await page.waitForSelector(".caravans.human .caravan", { timeout: 5000 });
await page.waitForTimeout(600);

// Setup mirrors the report:
// - Human Boneyard holds a 2S (removed by the human Red Joker).
// - AI The Hub holds a 2S (human Joker target, keeps the Red Joker).
// - Human Redding holds a 9S (AI Joker target, keeps the Black Joker).
// - AI New Reno holds a 9C (removed by the AI Black Joker).
// No other 2s/9s exist, so each Joker removes exactly one row.
const humanCaravans = [
  caravanOf([[makeCard(1, "2", "spades")], [makeCard(1, "7", "clubs")]]),
  caravanOf([[makeCard(1, "9", "spades")]]),
  caravanOf([[makeCard(1, "4", "diamonds")]]),
];
const aiCaravans = [
  caravanOf([[makeCard(2, "8", "spades")]]),
  caravanOf([[makeCard(2, "9", "clubs")]]),
  caravanOf([[makeCard(2, "5", "clubs")], [makeCard(2, "2", "spades")]]),
];
const humanHand = [makeCard(1, "Joker", "Red"), makeCard(1, "3", "clubs")];
const aiHand = [makeCard(2, "Joker", "Black"), makeCard(2, "6", "clubs")];

await page.evaluate(
  (s) => window.__setCaravanState(s),
  {
    players: [mkPlayer(humanCaravans, humanHand), mkPlayer(aiCaravans, aiHand)],
    current: Human, phase: "play", winner: null, log: [], started: true,
  }
);
await page.waitForTimeout(500);

// Move 21 (bug report): human Red Joker on AI Hub 2S.
console.log("Move 21: human Red Joker on AI The Hub 2S...");
await page.evaluate(() => window.__act({
  type: "playOperationCard", player: 0,
  target: { player: 1, lane: 2, cardIndex: 1 }, handIndex: 0,
}));
await page.waitForTimeout(250);

const afterHuman = await page.evaluate(() => ({
  confirmer: window.__caravanStore.transition?.pendingAck?.confirmer ?? null,
  ackX: document.querySelectorAll(".confirm.portal").length,
  pending: document.querySelectorAll(".caravan .card.pending").length,
  current: window.__caravanStore.state.current,
}));
console.log("after human joker:", JSON.stringify(afterHuman));
assert.equal(afterHuman.confirmer, Ai, "human joker confirmer must be AI");
assert.equal(afterHuman.ackX, 0, "human's own Joker shows no X");
assert.equal(afterHuman.pending, 0, "human's own Joker shows no pending blink");
assert.equal(afterHuman.current, Ai, "turn passes to AI after human joker");

// Move 22 (bug report): AI Black Joker on human Redding 9S.
// Applied directly via __act so the AI timer cannot interfere.
console.log("Move 22: AI Black Joker on human Redding 9S...");
await page.evaluate(() => window.__act({
  type: "playOperationCard", player: 1,
  target: { player: 0, lane: 1, cardIndex: 0 }, handIndex: 0,
}));
await page.waitForTimeout(500);

const afterAi = await page.evaluate(() => {
  const t = window.__caravanStore.transition;
  return {
    confirmer: t?.pendingAck?.confirmer ?? null,
    removedLen: t?.pendingAck?.removed?.length ?? 0,
    playedRank: t?.pendingAck?.played?.card?.rank ?? null,
    current: window.__caravanStore.state.current,
    pendingDom: document.querySelectorAll(".caravan .card.pending").length,
    ackX: document.querySelectorAll(".confirm.portal").length,
    ackLabels: Array.from(document.querySelectorAll(".confirm.portal")).map(
      (el) => el.getAttribute("aria-label")
    ),
    jokerDom: Array.from(document.querySelectorAll(".caravan .card .card")).filter(
      (el) => el.className.includes("joker")
    ).length,
  };
});
console.log("after AI joker:", JSON.stringify(afterAi, null, 2));

assert.equal(afterAi.confirmer, Human, "AI joker must await human ack");
assert.equal(afterAi.playedRank, "Joker", "transition carries the AI Joker");
assert.equal(afterAi.removedLen, 1, "AI joker removes exactly the other 9");
assert.equal(afterAi.current, Human, "turn already passed to human, ack blocks action");
assert.equal(afterAi.pendingDom, 1, "exactly one blinking pending removal");
assert.ok(afterAi.jokerDom >= 2, "both jokers displayed (human Red + AI Black)");

// THE BUG: the human Red Joker from move 21 also carries a confirm X.
// Correct: exactly ONE X, pinned to the AI Joker target (Redding 9S).
assert.equal(afterAi.ackX, 1, `BUG: expected exactly 1 confirm X (AI target only), got ${afterAi.ackX}: ${JSON.stringify(afterAi.ackLabels)}`);
assert.ok(
  (afterAi.ackLabels[0] ?? "").includes("9 of spades"),
  `the single X must acknowledge the AI target (9 of spades), got ${JSON.stringify(afterAi.ackLabels)}`
);

assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== HUMAN JOKER NO-CONFIRM TEST PASSED ===");
console.log("AI Joker shows one X on its own target; human Red Joker shows none");
await browser.close();
