#!/usr/bin/env node
// Rule: a player with no legal moves loses once the turn comes back.
// Opening bind: Human Boneyard unstarted, face-only hand, empty shoe.
// AI moves, the turn flips to Human with zero moves, game ends, AI wins.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { boardReady, waitGameOver } from "./wait.mjs";

let id = 6000;
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
function mkPlayer(caravans, hand, shoe = []) { return { shoe, hand, caravans }; }

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
await boardReady(page);

const hBon = caravanOf([]);
const hRed = caravanOf([[makeCard(1, "10", "clubs")]], true);
const hSha = caravanOf([[makeCard(1, "9", "hearts")]], true);
const stuckHuman = mkPlayer([hBon, hRed, hSha], [makeCard(1, "K", "clubs")], []);
const movingAi = mkPlayer(
  [caravanOf([[makeCard(2, "7", "clubs")]], true), caravanOf([[makeCard(2, "8", "diamonds")]], true), caravanOf([[makeCard(2, "9", "hearts")]], true)],
  [makeCard(2, "10", "spades")],
  [makeCard(2, "3", "diamonds")]
);
console.log("Programming state: stuck Human (bind, empty shoe), AI to move");
await page.evaluate((s) => window.__setCaravanState(s), {
  players: [stuckHuman, movingAi], current: 1, phase: "play", winner: null, log: [], started: true
});
await waitGameOver(page);
const end = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  return { phase: s.phase, winner: s.winner, lastLog: s.log[s.log.length - 1]?.text ?? null };
});
console.log("after AI moves into the bind", end);
assert.equal(end.phase, "over", "game ends when the bound player has no moves");
assert.equal(end.winner, 1, "bound player with no moves loses");
assert.ok(end.lastLog && /ran out of moves/.test(end.lastLog), `terminal log should say ran out of moves, got ${end.lastLog}`);

assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== STUCK PLAYER LOSES TEST PASSED ===");
await browser.close();
