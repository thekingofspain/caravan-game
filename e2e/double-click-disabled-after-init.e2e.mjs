#!/usr/bin/env node
// Double-click after game initialization must be disabled.
// Setup: all caravans initialized (started:true, non-empty). AI Jacks the
// human's single-card lane 0, clearing it back to a placeholder. The human
// then double-clicks a value card: nothing must happen (no move, no log
// growth, placeholder stays, hand unchanged). Single-click placement still
// works and is covered by placeholder-after-start.e2e.mjs.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { boardReady } from "./wait.mjs";

let id = 9000;
function makeCard(deckId, rank, suit) {
  id += 1;
  return { id: `D${deckId}-${rank}${suit}-${id}`, suit, rank };
}
const Ai = 1;
function caravanOf(rows) {
  const last = rows.at(-1)?.[0];
  return { rows, direction: null, suit: last ? last.suit : null, started: true };
}
function mkPlayer(caravans, hand, deck = []) {
  return { deck, hand, discard: null, caravans };
}
function isValueCardClass(cls) {
  return !/jack|queen|king|joker/.test(cls || "");
}

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await boardReady(page);
await page.waitForSelector(".caravans.human .caravan", { timeout: 5000 });

// All caravans initialized; human lane 0 holds a single card so an AI Jack
// clears it back to a placeholder. Human holds value cards for the dblclick.
const humanCaravans = [
  caravanOf([[makeCard(1, "5", "diamonds")]]),
  caravanOf([[makeCard(1, "3", "spades")]]),
  caravanOf([[makeCard(1, "7", "clubs")]]),
];
const aiCaravans = [
  caravanOf([[makeCard(2, "9", "clubs")]]),
  caravanOf([[makeCard(2, "4", "hearts")]]),
  caravanOf([[makeCard(2, "2", "spades")]]),
];
const humanHand = [makeCard(1, "2", "clubs"), makeCard(1, "6", "hearts")];
const aiHand = [makeCard(2, "J", "hearts"), makeCard(2, "8", "clubs")];

await page.evaluate((s) => window.__setCaravanState(s), {
  players: [mkPlayer(humanCaravans, humanHand), mkPlayer(aiCaravans, aiHand)],
  current: Ai, phase: "play", winner: null, log: [], started: true,
});
await page.waitForFunction(() => window.__caravanStore?.state?.current === 1, null, { timeout: 5000 });

console.log("AI Jacks human lane 0 (clears it to a placeholder)...");
await page.evaluate(() => window.__act({
  type: "playOperationCard", player: 1,
  target: { player: 0, lane: 0, cardIndex: 0 }, handIndex: 0,
}));
await page.waitForSelector(".confirm.portal", { timeout: 10000 });
console.log("Human acknowledges the removal...");
await page.locator(".confirm.portal").first().click({ force: true });
await page.waitForFunction(() => document.querySelectorAll(".confirm.portal").length === 0, null, { timeout: 10000 });
await page.waitForFunction(
  () => window.__caravanStore?.state?.current === 0 && document.querySelectorAll(".hand.human .slot.selectable").length > 0,
  null, { timeout: 10000 }
);

// Post-ack: human lane 0 is an empty placeholder, but `started` is intact.
const cleared = await page.evaluate(() => ({
  rows: window.__caravanStore.state.players[0].caravans[0].rows.length,
  started: window.__caravanStore.state.players[0].caravans[0].started,
}));
console.log("post-ack lane 0:", JSON.stringify(cleared));
assert.equal(cleared.rows, 0, "AI Jack should clear human lane 0 to empty");
assert.equal(cleared.started, true, "cleared caravan keeps started=true (post-init, not opening)");
assert.equal(await page.locator(".caravans.human .caravan").nth(0).locator(".empty").count(), 1, "cleared caravan shows its placeholder");

console.log("Human double-clicks a value card (must be a no-op after init)...");
const slots = page.locator(".hand.human .slot.selectable");
const n = await slots.count();
let dblSlot = null;
for (let i = 0; i < n; i++) {
  const cls = await slots.nth(i).locator(".card").getAttribute("class");
  if (isValueCardClass(cls)) { dblSlot = slots.nth(i); break; }
}
assert.ok(dblSlot, "need a selectable value card to double-click");

const before = await page.evaluate(() => ({
  log: window.__caravanStore.state.log.length,
  hand: window.__caravanStore.state.players[0].hand.length,
  lane0: window.__caravanStore.state.players[0].caravans[0].rows.length,
}));
await dblSlot.dblclick({ force: true });
await page.waitForTimeout(800);
const after = await page.evaluate(() => ({
  log: window.__caravanStore.state.log.length,
  hand: window.__caravanStore.state.players[0].hand.length,
  lane0: window.__caravanStore.state.players[0].caravans[0].rows.length,
  current: window.__caravanStore.state.current,
}));
console.log("before:", JSON.stringify(before), "after:", JSON.stringify(after));
assert.equal(after.log, before.log, "BUG: double-click played a card after game initialization");
assert.equal(after.lane0, 0, "cleared caravan must stay empty after the double-click");
assert.equal(after.hand, before.hand, "hand must be unchanged after the double-click");
assert.equal(await page.locator(".caravans.human .caravan").nth(0).locator(".empty").count(), 1, "placeholder must remain after the double-click");

assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== DOUBLE-CLICK-DISABLED-AFTER-INIT TEST PASSED ===");
await browser.close();
