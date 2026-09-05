import { chromium } from "playwright";
import assert from "node:assert/strict";

let id = 4000;
function makeCard(deckId, rank, suitOrJoker) {
  id += 1;
  if (rank === "Joker") return { id: `D${deckId}-${rank}${suitOrJoker}-${id}`, suit: null, rank: "Joker", jokerType: suitOrJoker };
  return { id: `D${deckId}-${rank}${suitOrJoker}-${id}`, suit: suitOrJoker, rank };
}
const Human = 0, Ai = 1;
function caravanOf(rows) {
  let direction = null, suit = null;
  if (rows.length >= 2) {
    const a = rows[0][0].rank === "A" ? 1 : Number(rows[0][0].rank);
    const b = rows[1][0].rank === "A" ? 1 : Number(rows[1][0].rank);
    direction = b > a ? "asc" : "desc";
  }
  if (rows.length >= 1) suit = rows[0][0].suit;
  return { rows, direction, suit };
}
function mkPlayer(caravans, hand, deck = []) { return { deck, hand, caravans }; }

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
await page.waitForTimeout(600);

const hBoneyard = caravanOf([[makeCard(1, "5", "hearts"), makeCard(1, "Q", "clubs")]]);
const hRedding = caravanOf([[makeCard(1, "7", "hearts"), makeCard(1, "Q", "diamonds")]]);
const hShady = caravanOf([[makeCard(1, "A", "hearts")]]);
const aDayglow = caravanOf([[makeCard(1, "9", "hearts"), makeCard(1, "Q", "spades")]]);
const aNewReno = caravanOf([[makeCard(1, "3", "hearts"), makeCard(1, "Q", "hearts")]]);
const aHub = caravanOf([]);

const humanCaravans = [hBoneyard, hRedding, hShady];
const aiCaravans = [aDayglow, aNewReno, aHub];
const humanHand = [makeCard(1, "2", "clubs"), makeCard(1, "4", "diamonds")];
const aiHand = [makeCard(2, "Joker", "Red"), makeCard(1, "6", "clubs")];

let programmedState = {
  players: [mkPlayer(humanCaravans, humanHand, []), mkPlayer(aiCaravans, aiHand, [])],
  current: Ai, phase: "play", winner: null, log: [], started: true,
};

console.log("Programming 4-queens board: AI will Joker Red on Human Shady Ace, removing 5 rows (4 queens + Ace)");
await page.evaluate((s) => window.__setCaravanState(s), programmedState);
await page.waitForTimeout(500);

console.log("Forcing AI Joker Red on Human Shady Ace via __act...");
await page.evaluate(() => window.__act({ type: "playFaceCard", player: 1, target: { player: 0, caravan: 2, cardIndex: 0 }, handIndex: 0 }));
await page.waitForTimeout(800);

let afterAI = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  const t = window.__caravanStore.transition;
  const ackEl = document.querySelector(".confirm.portal");
  return {
    phase: s.phase,
    current: s.current,
    logLast: s.log[s.log.length - 1],
    transition: t,
    hasAck: !!ackEl,
    impactedLen: t ? t.impacted.length : 0,
    jackRemoveCount: document.querySelectorAll(".confirm.portal").length,
    hBoneyardRows: s.players[0].caravans[0].rows.length,
  };
});
console.log("After AI Joker:", JSON.stringify(afterAI, null, 2));
assert.equal(afterAI.impactedLen, 5, "Joker should impact 5 rows (4 queens + Ace)");
assert.ok(afterAI.hasAck, "should be awaiting human ack via confirm X");

console.log("Log detail:", afterAI.logLast?.detail);
assert.ok(afterAI.logLast?.detail?.length >= 5, "Joker log entry must list removals before ack X is shown");
{
  const detailStr = afterAI.logLast.detail
    .map((d) => (Array.isArray(d) ? d.map((s) => (typeof s === "string" ? s : s.rank + (s.suit ? s.suit : s.jokerType))).join("") : String(d)))
    .join(" | ");
  assert.match(detailStr, /Q/, "log detail should mention queens");
  assert.match(detailStr, /5.*Boneyard/, "Boneyard detail should have 5");
  assert.match(detailStr, /7.*Redding/, "Redding detail should have 7");
}

console.log("Clicking confirm X to acknowledge...");
const ackEl = page.locator(".confirm.portal").first();
assert.ok((await ackEl.count()) > 0, "ack X should be present");
await ackEl.click({ force: true });
await page.waitForTimeout(800);

let afterAck = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  const ackBtn2 = document.querySelector(".confirm.portal");
  return {
    phase: s.phase,
    current: s.current,
    hBoneyardRows: s.players[0].caravans[0].rows.length,
    hReddingRows: s.players[0].caravans[1].rows.length,
    hShadyRows: s.players[0].caravans[2].rows.length,
    aDayglowRows: s.players[1].caravans[0].rows.length,
    aNewRenoRows: s.players[1].caravans[1].rows.length,
    logLen: s.log.length,
    pending: document.querySelectorAll(".card.pending, .card.pending-remove").length,
    hasAck: !!ackBtn2,
  };
});
console.log("After ack:", afterAck);
assert.equal(afterAck.hBoneyardRows, 0, "Boneyard should be empty after Joker removal");
assert.equal(afterAck.hReddingRows, 0, "Redding should be empty after Joker removal");
assert.equal(afterAck.hShadyRows, 0, "Shady (Ace) should be empty after Joker removal");
assert.equal(afterAck.aDayglowRows, 0, "Dayglow should be empty after Joker removal");
assert.equal(afterAck.aNewRenoRows, 0, "New Reno should be empty after Joker removal");
assert.equal(afterAck.hasAck, false, "ack should be gone after confirming");
assert.equal(afterAck.pending, 0, "confirmation visuals cleared after ack (no pending rows)");
assert.equal(afterAck.current, Human, "after ack, should be Human turn");

assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== AI JOKER ACE 4-QUEENS ACK TEST PASSED ===");
console.log("Joker on Ace removed 5 rows including 4 queens, detail includes queens, ack works, turn passes to Human");
await browser.close();
