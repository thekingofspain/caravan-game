#!/usr/bin/env node
// AI Joker on OWN caravan: AI plays Black Joker on its own Dayglow 9C,
// removing Human's Shady Sands 9D. The Joker must persist on the AI host
// row (like K/Q) and be shown there; the human must ack via X.
// Regression: attachJoker used to discard the played Joker (never pushed
// onto the target row), so post-ack the host row lost it.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { boardReady } from "./wait.mjs";

let id = 7000;
function makeCard(deckId, rank, suitOrJoker) {
  id += 1;
  if (rank === "Joker")
    return { id: `D${deckId}-${rank}${suitOrJoker}-${id}`, suit: null, rank: "Joker", jokerType: suitOrJoker };
  return { id: `D${deckId}-${rank}${suitOrJoker}-${id}`, suit: suitOrJoker, rank };
}
const Human = 0, Ai = 1;
function caravanOf(rows) {
  const last = rows.at(-1)?.[0];
  return { rows, direction: null, suit: last ? last.suit : null, started: true };
}
function mkPlayer(caravans, hand, shoe = []) { return { shoe, hand, caravans }; }

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await boardReady(page);
const startBtn = page.locator(".start .btn, button:has-text('Start')");
if ((await startBtn.count()) > 0) await startBtn.first().click({ force: true });
await page.waitForSelector(".caravans.human .caravan", { timeout: 5000 });

// Shady Sands holds [6D, 9D]; Dayglow holds [7C, 9C] (Joker target, index 1).
const humanCaravans = [
  caravanOf([[makeCard(1, "7", "diamonds")]]),
  caravanOf([[makeCard(1, "3", "spades")]]),
  caravanOf([[makeCard(1, "6", "diamonds")], [makeCard(1, "9", "diamonds")]]),
];
const aiCaravans = [
  caravanOf([[makeCard(1, "7", "clubs")], [makeCard(1, "9", "clubs")]]),
  caravanOf([[makeCard(1, "7", "hearts")]]),
  caravanOf([[makeCard(1, "2", "hearts")]]),
];
const humanHand = [makeCard(1, "2", "clubs"), makeCard(1, "4", "diamonds")];
const aiHand = [makeCard(2, "Joker", "Black"), makeCard(1, "6", "clubs")];

await page.evaluate((s) => window.__setCaravanState(s), {
  players: [mkPlayer(humanCaravans, humanHand), mkPlayer(aiCaravans, aiHand)],
  current: Ai, phase: "play", winner: null, log: [], started: true,
});
await page.waitForFunction(() => window.__caravanStore?.state?.current === 1, null, { timeout: 5000 });

console.log("AI plays Black Joker on its OWN Dayglow 9C...");
await page.evaluate(() => window.__act({
  type: "playOperationCard", player: 1,
  target: { player: 1, lane: 0, cardIndex: 1 }, handIndex: 0,
}));
await page.waitForFunction(() => window.__caravanStore?.transition?.pendingAck && document.querySelector(".confirm.portal"), null, { timeout: 5000 });

const pre = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  const t = window.__caravanStore.transition;
  const jokers = [...document.querySelectorAll(".caravan .card.joker")].map((j) => {
    const hostBtn = j.parentElement?.closest("button.card");
    const side = j.closest(".caravans.human") ? "human" : j.closest(".caravans.ai") ? "ai" : "?";
    const sideEl = j.closest(".caravans.human, .caravans.ai");
    const caravanEl = j.closest(".caravan");
    const idx = [...sideEl.querySelectorAll(".caravan")].indexOf(caravanEl);
    return { side, caravanIdx: idx, hostIndex: hostBtn?.getAttribute("data-index"), hostCls: hostBtn?.className ?? null };
  });
  const pendings = [...document.querySelectorAll(".caravan .card.pending, .caravan .card.pending-remove")].map((c) => ({
    side: c.closest(".caravans.human") ? "human" : c.closest(".caravans.ai") ? "ai" : "?",
  }));
  return {
    pendingAck: t?.pendingAck ? { confirmer: t.pendingAck.confirmer, removed: t.pendingAck.removed, played: t.pendingAck.played ? { rank: t.pendingAck.played.card.rank, at: t.pendingAck.played.at } : null } : null,
    stateShady: s.players[0].caravans[2].rows.map((r) => r.map((c) => c.rank)),
    stateDayglow: s.players[1].caravans[0].rows.map((r) => r.map((c) => c.rank)),
    jokers, pendings,
    ackX: document.querySelectorAll(".confirm.portal").length,
    ackLabel: document.querySelector(".confirm.portal")?.getAttribute("aria-label") ?? null,
    selectable: document.querySelectorAll(".slot.selectable").length,
  };
});
console.log("pre-ack:", JSON.stringify(pre, null, 2));
assert.equal(pre.pendingAck !== null, true, "own-side joker removal must need human confirmation");
assert.equal(pre.pendingAck.confirmer, Human, "human confirms AI joker even when aimed at AI's own row");
assert.deepEqual(pre.pendingAck.removed, [{ player: 0, lane: 2, cardIndex: 1 }], "only the human 9D row is removed");
assert.deepEqual(pre.pendingAck.played, { rank: "Joker", at: { player: 1, lane: 0, cardIndex: 1 } }, "transition carries the Joker at the AI host row");
assert.deepEqual(pre.stateShady, [["6"]], "removal is committed in state while human reviews");
assert.deepEqual(pre.stateDayglow, [["7"], ["9", "Joker"]], "Joker persists on the AI host row in state (like K/Q)");
assert.equal(pre.jokers.length, 1, "exactly one Joker shown");
assert.deepEqual(
  pre.jokers[0],
  { side: "ai", caravanIdx: 0, hostIndex: "1", hostCls: pre.jokers[0].hostCls },
  "Joker is rendered on the AI Dayglow host row"
);
assert.ok(pre.jokers[0].hostCls.includes("nine"), "Joker rides on the 9C host card");
assert.equal(pre.pendings.length, 1, "one blinking pending removal");
assert.equal(pre.pendings[0].side, "human", "pending removal blinks on the human side");
assert.ok(pre.ackX >= 1, "confirm X must be shown");
assert.match(pre.ackLabel ?? "", /Acknowledge removal/, "X must label the removal ack");
assert.equal(pre.selectable, 0, "human blocked until ack");

console.log("Human clicks confirm X...");
await page.waitForSelector(".confirm.portal", { timeout: 5000 });
await page.evaluate(() => document.querySelector(".confirm.portal")?.click());
// NOTE: window.__caravanStore.transition goes stale on the ack path (the app
// clears it via setUi without re-publishing hooks), so wait on the user-visible
// signal — the confirm X unmounting — rather than waitNoPendingAck.
await page.waitForFunction(() => document.querySelectorAll(".confirm.portal").length === 0, null, { timeout: 5000 });

const post = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  const j = document.querySelector(".caravan .card.joker");
  const hostBtn = j?.parentElement?.closest("button.card");
  const side = j?.closest(".caravans.human") ? "human" : j?.closest(".caravans.ai") ? "ai" : "?";
  return {
    dayglow: s.players[1].caravans[0].rows.map((r) => r.map((c) => c.rank + (c.jokerType ?? ""))),
    shady: s.players[0].caravans[2].rows.map((r) => r.map((c) => c.rank)),
    jokerDom: document.querySelectorAll(".caravan .card.joker").length,
    jokerSide: j ? side : null,
    hostIndex: hostBtn?.getAttribute("data-index") ?? null,
    ackX: document.querySelectorAll(".confirm.portal").length,
    pending: document.querySelectorAll(".caravan .card.pending, .caravan .card.pending-remove").length,
    current: s.current,
    phase: s.phase,
    selectable: document.querySelectorAll(".slot.selectable").length,
  };
});
console.log("post-ack:", JSON.stringify(post, null, 2));
assert.deepEqual(post.dayglow, [["7"], ["9", "JokerBlack"]], "Black Joker still on the Dayglow host after ack");
assert.deepEqual(post.shady, [["6"]], "human 9D stays removed after ack");
assert.equal(post.jokerDom, 1, "Joker still displayed after ack");
assert.equal(post.jokerSide, "ai", "Joker displayed on the AI side");
assert.equal(post.hostIndex, "1", "Joker still on the 9C host row");
assert.equal(post.ackX, 0, "ack X gone after confirm");
assert.equal(post.pending, 0, "blinking removal cleared after confirm");
assert.equal(post.phase, "play", "game continues after ack");
assert.equal(post.current, Human, "still human turn after ack");
assert.ok(post.selectable > 0, "human unblocked after confirming");
assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== AI JOKER ON OWN CARAVAN TEST PASSED ===");
await browser.close();
