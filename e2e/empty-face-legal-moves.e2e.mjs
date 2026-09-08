import { chromium } from "playwright";
import assert from "node:assert/strict";

let id = 5000;
function makeCard(deckId, rank, suitOrJoker) {
  id++;
  if (rank === "Joker") return { id: `D${deckId}-${rank}${suitOrJoker}-${id}`, suit: null, rank: "Joker", jokerType: suitOrJoker };
  return { id: `D${deckId}-${rank}${suitOrJoker}-${id}`, suit: suitOrJoker, rank };
}
function caravanOf(rows) {
  let d = null, s = null;
  if (rows.length >= 2) { const a = rows[0][0].rank === "A" ? 1 : Number(rows[0][0].rank); const b = rows[1][0].rank === "A" ? 1 : Number(rows[1][0].rank); d = b > a ? "asc" : "desc"; }
  if (rows.length >= 1) s = rows[0][0].suit;
  return { rows, direction: d, suit: s };
}
function mkPlayer(caravans, hand, deck = []) { return { deck, hand, caravans }; }

const browser = await chromium.launch();
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

// Opening bind: empty Boneyard, face-only hand, cards in the shoe.
// Only discards are legal — no face plays, no disbands.
const hBon = caravanOf([]);
const hRed = caravanOf([[makeCard(1, "10", "clubs")]]);
const hSha = caravanOf([[makeCard(1, "9", "hearts")]]);
const aDay = caravanOf([[makeCard(1, "7", "clubs")]]);
const aNew = caravanOf([[makeCard(1, "8", "diamonds")]]);

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
assert.ok(legal.length > 0, "should have discard moves");
assert.ok(legal.every((m) => m.type === "discardCard"), "only discards legal while empties unfillable");
assert.ok(!legal.some((m) => m.type === "playOperationCard"), "face plays locked while an empty remains");

// Discard one through the real engine path: pile shows it, turn passes.
await page.evaluate(() => {
  const s = window.__caravanStore.state;
  const idx = s.players[0].hand.findIndex((c) => c.rank === "K");
  window.__act({ type: "discardCard", player: 0, handIndex: idx });
});
await page.waitForTimeout(600);
let after = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  return { phase: s.phase, current: s.current, pile: s.players[0].discard, handLen: s.players[0].hand.length };
});
console.log("after discard", after);
assert.equal(after.phase, "play");
assert.equal(after.pile.rank, "K", "discard pile tracks the discarded card");
assert.equal(after.handLen, 3, "drew a replacement from the shoe");

// Empty shoe + unfillable empties + turn passes to Human: Human loses.
console.log("Programming state: same bind, shoe empty, AI to move");
const stuckHuman = mkPlayer([hBon, hRed, hSha], [makeCard(1, "K", "clubs")], []);
const movingAi = mkPlayer(
  [caravanOf([[makeCard(2, "7", "clubs")]]), caravanOf([[makeCard(2, "8", "diamonds")]]), caravanOf([[makeCard(2, "9", "hearts")]])],
  [makeCard(2, "10", "spades")],
  [makeCard(2, "3", "diamonds")]
);
await page.evaluate((s) => window.__setCaravanState(s), {
  players: [stuckHuman, movingAi], current: 1, phase: "play", winner: null, log: [], started: true
});
await page.waitForTimeout(2500);
let end = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  return { phase: s.phase, winner: s.winner, humanLegal: window.__caravanStore.state.current === 0 ? "human-turn" : "ai-turn" };
});
console.log("after AI moves into the bind", end);
assert.equal(end.phase, "over", "game ends when the bound player has no moves");
assert.equal(end.winner, 1, "bound player with empty shoe loses");

assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== EMPTY FACE OPENING-BIND TEST PASSED ===");
await browser.close();
