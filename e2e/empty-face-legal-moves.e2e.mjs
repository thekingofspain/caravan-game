#!/usr/bin/env node
// Rule: no discards or disbands during the opening (the first 6 value
// moves). Face-only hand + unstarted caravan = no legal moves at all;
// the stuck player loses once the turn comes back to them.
import { chromium } from "playwright";
import assert from "node:assert/strict";
let id = 5000;
function makeCard(deckId, rank, suitOrJoker) {
  id++;
  if (rank === "Joker") return { id: `D${deckId}-${rank}${suitOrJoker}-${id}`, suit: null, rank: "Joker", jokerType: suitOrJoker };
  return { id: `D${deckId}-${rank}${suitOrJoker}-${id}`, suit: suitOrJoker, rank };
}
function caravanOf(rows, started = false) {
  let d = null, s = null;
  if (rows.length >= 2) { const a = rows[0][0].rank === "A" ? 1 : Number(rows[0][0].rank); const b = rows[1][0].rank === "A" ? 1 : Number(rows[1][0].rank); d = b > a ? "asc" : "desc"; }
  if (rows.length >= 1) s = rows[0][0].suit;
  return { rows, direction: d, suit: s, started };
}
function mkPlayer(caravans, hand, deck = []) { return { deck, hand, caravans }; }

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", m => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));

await page.goto(process.env.BASE_URL || "http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForSelector(".board");
const btn = page.locator(".start .btn, button:has-text('Start')");
if (await btn.count() > 0) await btn.first().click({ force: true });
await page.waitForSelector(".caravans.human .caravan", { timeout: 5000 });
await page.waitForTimeout(600);

// Opening bind: Boneyard not yet started, face-only hand, shoe stocked.
// Nothing is legal — no value plays, no face plays, no discards, no disbands.
const hBon = caravanOf([]);
const hRed = caravanOf([[makeCard(1, "10", "clubs")]], true);
const hSha = caravanOf([[makeCard(1, "9", "hearts")]], true);
const aDay = caravanOf([[makeCard(1, "7", "clubs")]], true);
const aNew = caravanOf([[makeCard(1, "8", "diamonds")]], true);

const humanHand = [makeCard(1, "K", "clubs"), makeCard(1, "J", "diamonds"), makeCard(1, "Q", "hearts")];
const aiHand = [makeCard(2, "10", "spades")];

let state = {
  players: [mkPlayer([hBon, hRed, hSha], humanHand, [makeCard(1, "2", "clubs")]), mkPlayer([aDay, aNew, caravanOf([])], aiHand, [makeCard(2, "3", "diamonds")])],
  current: 0, phase: "play", winner: null, log: [], started: true
};

console.log("Programming state: Human has empty Boneyard, face-only hand, shoe stocked");
await page.evaluate((s) => window.__setCaravanState(s), state);
await page.waitForTimeout(600);

let legal = await page.evaluate(() => window.__caravanStore.legal);
console.log("legalMoves", legal.map((m) => m.type));
assert.equal(legal.length, 0, "face-only hand with an unstarted caravan has no legal moves (no discards/disbands during the opening)");

// Forcing a discard through the engine must throw.
const discardErr = await page.evaluate(() => {
  try {
    const s = window.__caravanStore.state;
    const idx = s.players[0].hand.findIndex((c) => c.rank === "K");
    window.__act({ type: "discardCard", player: 0, handIndex: idx });
    return null;
  } catch (e) { return String(e && e.message || e); }
});
console.log("forced discard:", discardErr);
assert.ok(discardErr && /must fill empty/.test(discardErr), "discard in the bind must throw");

// Forcing a disband through the engine must throw.
const disbandErr = await page.evaluate(() => {
  try {
    window.__act({ type: "disbandCaravan", player: 0, lane: 1 });
    return null;
  } catch (e) { return String(e && e.message || e); }
});
console.log("forced disband:", disbandErr);
assert.ok(disbandErr && /cannot disband before all caravans started/.test(disbandErr), "disband in the bind must throw");

// Nothing moved: hand intact, still Human turn, game still in play.
const after = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  return { phase: s.phase, current: s.current, handLen: s.players[0].hand.length };
});
assert.equal(after.phase, "play");
assert.equal(after.current, 0);
assert.equal(after.handLen, 3);

assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
await browser.close();
console.log("\n=== EMPTY FACE NO-MOVES BIND TEST PASSED ===");
console.log("Face-only hand + unstarted caravan: no moves offered, discard/disband throw");
