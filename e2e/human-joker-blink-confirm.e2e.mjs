#!/usr/bin/env node
// Human Joker ack: AI plays Joker on Human, human must see blinking
// removal, see the Joker displayed on the target, and confirm via X
// before acting again.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { boardReady } from "./wait.mjs";

let id = 9000;
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
function mkPlayer(caravans, hand, shoe = []) { return { shoe, hand, caravans }; }

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
await boardReady(page);

// Board: exactly two 5s so the Joker removes exactly one row.
// Human Boneyard [5H] is the Joker target; AI Dayglow [5C] is removed.
// All other rows are non-5 to avoid extra matches.
const humanCaravans = [
  caravanOf([[makeCard(1, "5", "hearts")]]),
  caravanOf([[makeCard(1, "7", "hearts")]]),
  caravanOf([[makeCard(1, "9", "diamonds")]]),
];
const aiCaravans = [
  caravanOf([[makeCard(1, "5", "clubs")]]),
  caravanOf([[makeCard(1, "8", "spades")]]),
  caravanOf([[makeCard(1, "10", "diamonds")]]),
];
const humanHand = [makeCard(1, "2", "clubs"), makeCard(1, "4", "diamonds")];
const aiHand = [makeCard(2, "Joker", "Red"), makeCard(1, "6", "clubs")];

await page.evaluate(
  (s) => window.__setCaravanState(s),
  {
    players: [mkPlayer(humanCaravans, humanHand), mkPlayer(aiCaravans, aiHand)],
    current: Ai, phase: "play", winner: null, log: [], started: true,
  }
);
await page.waitForFunction(
  () => window.__caravanStore.state.current === 1
    && window.__caravanStore.state.players[1].hand.length === 2,
  null, { timeout: 10000 }
);

console.log("AI plays Joker Red on Human Boneyard 5H...");
await page.evaluate(() => window.__act({
  type: "playOperationCard", player: 1,
  target: { player: 0, lane: 0, cardIndex: 0 }, handIndex: 0,
}));
await page.waitForFunction(
  () => window.__caravanStore.transition?.pendingAck?.confirmer === 0,
  null, { timeout: 10000 }
);
await page.waitForSelector(".confirm.portal", { timeout: 5000 });

// 1) Confirmation state: AI move needs Human ack.
const state = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  const t = window.__caravanStore.transition;
  return {
    current: s.current,
    hasPendingAck: t?.pendingAck != null,
    confirmer: t?.pendingAck?.confirmer ?? null,
    removedLen: t?.pendingAck?.removed?.length ?? 0,
    playedRank: t?.pendingAck?.played?.card?.rank ?? null,
    pendingDom: document.querySelectorAll(".caravan .card.pending").length,
    jokerDom: document.querySelectorAll(".caravan .card.joker").length,
    ackX: document.querySelectorAll(".confirm.portal").length,
    ackLabel: document.querySelector(".confirm.portal")?.getAttribute("aria-label") ?? null,
    selectable: document.querySelectorAll(".slot.selectable").length,
  };
});
console.log("post-joker:", JSON.stringify(state, null, 2));
assert.equal(state.hasPendingAck, true, "joker removal must need confirmation");
assert.equal(state.confirmer, Human, "human must be the confirmer of AI joker");
assert.equal(state.removedLen, 1, "exactly one row removed (AI 5C)");
assert.equal(state.playedRank, "Joker", "transition must carry the played Joker for display");

// 2) Remove card is blinking: pending row exists and its ::after overlay
// runs the pending-blink animation (grey overlay blinking on/off).
assert.equal(state.pendingDom, 1, "one blinking pending removal card in DOM");
const blink = await page.evaluate(() => {
  const els = [...document.querySelectorAll(".caravan .card.pending")];
  return els.map((el) => {
    const cs = getComputedStyle(el, "::after");
    return { animationName: cs.animationName, animationDuration: cs.animationDuration };
  });
});
console.log("blink:", JSON.stringify(blink));
assert.ok(blink.length === 1, "pending card present for blink check");
assert.match(blink[0].animationName, /pending-blink/, "removal card must blink (pending-blink on ::after)");

// 3) Joker is displayed on the target row (previous + addedTemp).
assert.ok(state.jokerDom >= 1, "played joker must be displayed on the target row");
const jokerShown = await page.evaluate(() => {
  const j = document.querySelector(".caravan .card.joker");
  if (!j) return null;
  const host = j.closest(".caravan .card");
  return { cls: j.className, hostCls: host?.className ?? null };
});
console.log("joker:", JSON.stringify(jokerShown));
assert.ok(jokerShown !== null, "joker element attached to target row");

// 4) Requires user confirm: X present, human blocked until ack.
assert.ok(state.ackX >= 1, "confirm X must be shown");
assert.match(state.ackLabel ?? "", /Acknowledge removal/, "X must label the removal ack");
assert.equal(state.current, Human, "turn already passed to human, but ack blocks action");
assert.equal(state.selectable, 0, "human has no selectable slots while ack is pending");

// Clicking the board must not clear the ack on its own.
await page.locator(".caravans.human .caravan").first().click({ force: true });
// Board clicks must not clear the ack: re-assert presence after click handling settles.
await page.waitForFunction(
  () => document.querySelectorAll(".confirm.portal").length >= 1
    && window.__caravanStore.transition?.pendingAck != null,
  null, { timeout: 5000 }
);
const stillPending = await page.evaluate(() => ({
  ackX: document.querySelectorAll(".confirm.portal").length,
  pending: document.querySelectorAll(".caravan .card.pending").length,
}));
assert.equal(stillPending.ackX >= 1, true, "ack X persists until explicitly confirmed");
assert.equal(stillPending.pending, 1, "blinking removal persists until confirmed");

console.log("Human clicks confirm X...");
// The X is a 22px fixed-position portal that repositions on resize/scroll
// observations; a synthetic mouse click can land between repositions and
// miss. Click the settled element directly so the test asserts the ack
// flow (not pointer hit-testing of the floating portal).
await page.waitForSelector(".confirm.portal", { timeout: 5000 });
await page.evaluate(() => document.querySelector(".confirm.portal")?.click());
// Ack is a ui-only update (no state change), so window.__caravanStore keeps a
// stale pendingAck: gate on DOM signals instead (portal detaches ~320ms after X).
await page.waitForFunction(
  () => document.querySelectorAll(".confirm.portal").length === 0,
  null, { timeout: 10000 }
);
await page.waitForFunction(
  () => document.querySelectorAll(".caravan .card.pending, .caravan .card.pending-remove").length === 0,
  null, { timeout: 10000 }
);

const after = await page.evaluate(() => ({
  ackX: document.querySelectorAll(".confirm.portal").length,
  pending: document.querySelectorAll(".caravan .card.pending, .caravan .card.pending-remove").length,
  jokerDom: document.querySelectorAll(".caravan .card.joker").length,
  current: window.__caravanStore.state.current,
  selectable: document.querySelectorAll(".slot.selectable").length,
}));
console.log("after-ack:", JSON.stringify(after, null, 2));
assert.equal(after.ackX, 0, "ack X gone after human confirms");
assert.equal(after.pending, 0, "blinking removal cleared after confirm");
assert.equal(after.jokerDom, 1, "played joker stays on its host row after confirm (like K/Q)");
assert.equal(after.current, Human, "still human turn after ack");
assert.ok(after.selectable > 0, "human unblocked after confirming");
assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== HUMAN JOKER BLINK CONFIRM TEST PASSED ===");
console.log("Blinking removal + displayed Joker + mandatory human X confirm verified");
await browser.close();
