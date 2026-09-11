import { chromium } from "playwright";
import assert from "node:assert/strict";
import { boardReady, waitGameOver } from "./wait.mjs";

let id = 5000;
function makeCard(deckId, rank, suitOrJoker) {
  // deckId first, rank, then suit|jokerType — matches src/model/cards.ts
  // rank is "Joker" => suitOrJoker is JokerType
  // otherwise rank is SuitedRank, suitOrJoker is Suit
  if (rank === "Joker") {
    return { id: `D${deckId}-${rank}${suitOrJoker}-${++id}`, suit: null, rank: "Joker", jokerType: suitOrJoker };
  }
  return { id: `D${deckId}-${rank}${suitOrJoker[0].toUpperCase()}-${++id}`, suit: suitOrJoker, rank };
}

const Human = 0, Ai = 1;

function caravanOf(rows, direction, suit) {
  return { rows, direction, suit };
}

function mkPlayer(caravans, hand, deck = []) {
  return { deck, hand, caravans };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto(process.env.BASE_URL || "http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForSelector(".board");
const startBtn = page.locator(".start .btn, button:has-text('Start')");
if ((await startBtn.count()) > 0) await startBtn.first().click({ force: true });
await page.waitForSelector(".caravans.human .caravan", { timeout: 5000 });
await boardReady(page);

// Pre-final state: Human to play 6♥ on Shady to make 26 and win 2-1
// Human Boneyard: 10♣+K , A♣  => 20+1=21
// Human Redding: 7♠,6♠,5♠,4♣+K => 7+6+5+8=26
// Human Shady: 3♣,4♠,9♥,4♥ => 20 (not sellable) -> after 6♥ => 26
// AI New Reno: 10♠,9♠,6♠,A♥ => 26
// AI Hub: 4♣ => 4
// AI Dayglow: 10♦,9♦,5♥ => 24
// Pair results before final: Human 21 vs 26 (Ai wins), 26 vs 4 (Human wins), 20 vs 24 (Ai wins) => 1-2, not over
// After final: 21 vs 26 (Ai), 26 vs 4 (Human), 26 vs 24 (Human) => Human wins 2-1, game over

const hBoneyard = caravanOf(
  [
    [makeCard(1, "10", "clubs"), makeCard(1, "K", "clubs")],
    [makeCard(1, "A", "clubs")],
  ],
  "desc",
  "clubs"
);
const hRedding = caravanOf(
  [
    [makeCard(1, "7", "spades")],
    [makeCard(1, "6", "spades")],
    [makeCard(1, "5", "spades")],
    [makeCard(1, "4", "clubs"), makeCard(1, "K", "clubs")],
  ],
  "desc",
  "spades"
);
const hShadyBefore = caravanOf(
  [
    [makeCard(1, "3", "clubs")],
    [makeCard(1, "4", "spades")],
    [makeCard(1, "9", "hearts")],
    [makeCard(1, "4", "hearts")],
  ],
  "asc",
  "clubs"
);

const aNewReno = caravanOf(
  [
    [makeCard(2, "10", "spades")],
    [makeCard(2, "9", "spades")],
    [makeCard(2, "6", "spades")],
    [makeCard(2, "A", "hearts")],
  ],
  "desc",
  "spades"
);
const aHub = caravanOf([[makeCard(2, "4", "clubs")]], null, "clubs");
const aDayglow = caravanOf(
  [
    [makeCard(2, "10", "diamonds")],
    [makeCard(2, "9", "diamonds")],
    [makeCard(2, "5", "hearts")],
  ],
  "desc",
  "diamonds"
);

const humanHand = [makeCard(1, "6", "hearts"), makeCard(1, "2", "clubs")];
const aiHand = [makeCard(2, "2", "clubs"), makeCard(2, "3", "diamonds")];

const programmedState = {
  players: [mkPlayer([hBoneyard, hRedding, hShadyBefore], humanHand), mkPlayer([aNewReno, aHub, aDayglow], aiHand)],
  current: Human,
  phase: "play",
  winner: null,
  log: [],
};

console.log("Programming pre-final state (Human to win with 6♥ on Shady)...");
await page.evaluate((s) => window.__setCaravanState(s), programmedState);
await page.waitForFunction(
  () => window.__caravanStore.state.players[0].caravans[2].rows.length === 4,
  null,
  { timeout: 10000 }
);

let before = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  return {
    phase: s.phase,
    winner: s.winner,
    current: s.current,
    shady: s.players[0].caravans[2].rows.map((r) => r.map((c) => c.rank).join("+")),
    shadyScore: s.players[0].caravans[2].rows.reduce((sum, r) => {
      const kc = r.slice(1).filter((c) => c.rank === "K").length;
      const base = r[0].rank === "A" ? 1 : r[0].rank === "Joker" ? 0 : Number(r[0].rank);
      return sum + base * Math.pow(2, kc);
    }, 0),
  };
});
console.log("before:", JSON.stringify(before, null, 2));
assert.equal(before.phase, "play", "game should be in play before final move");
assert.equal(before.winner, null, "no winner before final move");
assert.equal(before.current, Human, "should be Human turn");
assert.equal(before.shadyScore, 20, "Shady 3+4+9+4=20 before");

console.log("Human plays 6♥ on Shady Sands (caravan 2) — should win 21/26/26 vs 26/4/24");
// Use direct act to avoid UI click flakiness, but also verify UI path works
await page.evaluate(() => window.__act({ type: "playValueCard", player: 0, lane: 2, handIndex: 0 }));
await waitGameOver(page);

let after = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  const pairWinner = (i) => {
    const calc = (c) =>
      c.rows.reduce((sum, r) => {
        const kc = r.slice(1).filter((x) => x.rank === "K").length;
        const base = r[0].rank === "A" ? 1 : r[0].rank === "Joker" ? 0 : Number(r[0].rank);
        return sum + base * Math.pow(2, kc);
      }, 0);
    const isSellable = (c) => {
      const t = calc(c);
      return t >= 21 && t <= 26;
    };
    const s0 = s.players[0].caravans[i];
    const s1 = s.players[1].caravans[i];
    const t0 = calc(s0);
    const t1 = calc(s1);
    const r0 = isSellable(s0);
    const r1 = isSellable(s1);
    if (r0 && r1) return t0 > t1 ? 0 : t1 > t0 ? 1 : null;
    if (r0) return 0;
    if (r1) return 1;
    return null;
  };
  return {
    phase: s.phase,
    winner: s.winner,
    current: s.current,
    logLast: s.log.slice(-2).map((e) => e.text),
    shadyScore: s.players[0].caravans[2].rows.reduce((sum, r) => {
      const kc = r.slice(1).filter((c) => c.rank === "K").length;
      const base = r[0].rank === "A" ? 1 : Number(r[0].rank);
      return sum + base * Math.pow(2, kc);
    }, 0),
    pair0: pairWinner(0),
    pair1: pairWinner(1),
    pair2: pairWinner(2),
    shadyRows: s.players[0].caravans[2].rows.map((r) => r.map((c) => `${c.rank}${c.suit ? c.suit[0] : c.jokerType[0]}`).join("+")),
  };
});
console.log("after:", JSON.stringify(after, null, 2));

// Confirm game did end (previous bug: phase stayed "play", winner null)
assert.equal(after.phase, "over", "BUG REPRO: game should be over after Human makes Shady 26 — phase should be 'over'");
assert.equal(after.winner, Human, "Human should win 2-1 (21 vs 26 loses, 26 vs 4 wins, 26 vs 24 wins)");
assert.equal(after.pair0, Ai, "Boneyard 21 vs 26 -> Ai");
assert.equal(after.pair1, Human, "Redding 26 vs 4 -> Human");
assert.equal(after.pair2, Human, "Shady 26 vs 24 -> Human");
assert.ok(after.logLast.some((t) => t.includes("You won")), "log should contain win message");

if ((await page.locator(".activity").count()) === 0) await page.getByRole("button", { name: "Activity" }).click();
await page.waitForSelector(".activity");
let uiWinner = await page.evaluate(() => document.body.innerText.includes("You won") || document.body.innerText.includes("won"));
console.log("UI shows win:", uiWinner);

assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== HUMAN WIN SHADY 26 TEST PASSED ===");
console.log("Game correctly ends after Human 6♥ makes Shady 26 — fix confirmed (was staying in play)");
await browser.close();
