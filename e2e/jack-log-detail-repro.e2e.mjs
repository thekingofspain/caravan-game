import { chromium } from "playwright";
import assert from "node:assert/strict";

let id = 9000;
function makeCard(deckId, rank, suitOrJoker) {
  id += 1;
  if (rank === "Joker") return { id: `D${deckId}-${rank}${suitOrJoker}-${id}`, suit: null, rank: "Joker", jokerType: suitOrJoker };
  return { id: `D${deckId}-${rank}${suitOrJoker}-${id}`, suit: suitOrJoker, rank };
}
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
const OWNER_NAME = [["Boneyard","Redding","Shady Sands"],["Dayglow","New Reno","The Hub"]];
function flatSeg(s) {
  if (typeof s === "string") return s;
  if (s.type === "actor") {
    const who = s.player === 0 ? "You" : "AI";
    return s.form === "subject" ? who : `${who}'s `;
  }
  if (s.type === "caravan") return OWNER_NAME[s.player][s.caravan];
  return s.rank + (s.suit ? s.suit : s.jokerType);
}
function flatDetail(detail) {
  return detail.map((d) => (Array.isArray(d) ? d : [d]).map(flatSeg).join(""));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto(process.env.BASE_URL || "http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForSelector(".board");
await page.waitForSelector(".board .caravans.human", { timeout: 5000 });
await page.waitForTimeout(600);

await page.evaluate((s) => window.__setCaravanState(s), {
  players: [
    mkPlayer(
      [caravanOf([[makeCard(1, "5", "hearts")]]), caravanOf([[makeCard(1, "7", "clubs")]]), caravanOf([[makeCard(1, "5", "diamonds")]])],
      [makeCard(1, "J", "spades"), makeCard(1, "2", "clubs")],
      []
    ),
    mkPlayer(
      [caravanOf([[makeCard(1, "10", "spades"), makeCard(1, "K", "hearts")]]), caravanOf([[makeCard(1, "5", "spades")]]), caravanOf([[makeCard(1, "4", "diamonds")]])],
      [makeCard(2, "2", "hearts"), makeCard(2, "3", "hearts")],
      []
    ),
  ],
  current: 0, phase: "play", winner: null, log: [], started: true,
});
// --- Jack: line 1 is the play line, then one removal line per card ---
await page.evaluate(() => window.__caravanDispatch({ type: "playOperationCard", player: 0, target: { player: 1, caravan: 0, cardIndex: 0 }, handIndex: 0 }));
await page.waitForTimeout(300);

const jack = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  return { logLast: s.log[s.log.length - 1], rows: s.players[1].caravans[0].rows.length };
});
console.log("After Jack:", JSON.stringify(jack.logLast));
assert.equal(jack.rows, 0, "Jack should remove the targeted row");
assert.ok(!/resulting in:/.test(jack.logLast.text), "no 'resulting in:' in Jack line 1");
const jackLines = flatDetail(jack.logLast.detail);
assert.equal(jackLines.length, 2, "Jack should list one line per removed card (10 + K)");
for (const l of jackLines) assert.match(l, /^removal of /, "each Jack detail line starts 'removal of'");
assert.match(jackLines[0], /10.*from AI's Dayglow/, "first Jack line: 10 from AI Dayglow");
assert.match(jackLines[1], /K.*from AI's Dayglow/, "second Jack line: King from AI Dayglow");
assert.ok(!jackLines.some((l) => /your/i.test(l)), "no 'your' word in Jack lines");

// --- Joker on 5s: AI C2 first, then Human C1, C3 ---
await page.evaluate(() => {
  const s = window.__caravanStore.state;
  s.players[1].hand.push({ id: "D2-JokerRed-x", suit: null, rank: "Joker", jokerType: "Red" });
  s.current = 1;
  window.__setCaravanState(structuredClone(s));
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  const s = window.__caravanStore.state;
  const hi = s.players[1].hand.findIndex((c) => c.rank === "Joker");
  window.__caravanDispatch({ type: "playOperationCard", player: 1, target: { player: 1, caravan: 1, cardIndex: 0 }, handIndex: hi });
});
await page.waitForTimeout(300);

const joker = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  return { logLast: s.log[s.log.length - 1] };
});
console.log("After Joker:", JSON.stringify(joker.logLast));
assert.ok(!/resulting in:/.test(joker.logLast.text), "no 'resulting in:' in Joker line 1");
const jokerLines = flatDetail(joker.logLast.detail);
assert.equal(jokerLines.length, 3, "Joker should list one line per removed 5");
for (const l of jokerLines) assert.match(l, /^removal of 5.* from /, "each Joker detail line is a 5 removal");
assert.match(jokerLines[0], /from AI's New Reno/, "AI caravan first");
assert.match(jokerLines[1], /from You Boneyard/, "then Human C1 (icon token, no 'your')");
assert.ok(!jokerLines.some((l) => /your/i.test(l)), "no 'your' word in Joker lines");

// --- Face card on own caravan: owner renders as icon token, no "your" ---
await page.evaluate(() => {
  const s = window.__caravanStore.state;
  s.players[0].hand.push({ id: "D1-Qhearts-x", suit: "hearts", rank: "Q" });
  s.current = 0;
  window.__setCaravanState(structuredClone(s));
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  const s = window.__caravanStore.state;
  const hi = s.players[0].hand.findIndex((c) => c.rank === "Q");
  window.__caravanDispatch({ type: "playOperationCard", player: 0, target: { player: 0, caravan: 1, cardIndex: 0 }, handIndex: hi });
});
await page.waitForTimeout(300);
const queen = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  return { logLast: s.log[s.log.length - 1] };
});
assert.match(queen.logLast.text, /on You's Redding/, "own-caravan play uses icon token, no 'your'");
assert.ok(!/your/i.test(queen.logLast.text), "no 'your' word in own-caravan line");
assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);

// --- AI Joker needing confirmation: logged BEFORE the red X shows ---
await page.evaluate((s) => window.__setCaravanState(s), {
  players: [
    mkPlayer(
      [caravanOf([[makeCard(1, "5", "hearts")]]), caravanOf([[makeCard(1, "7", "clubs")]]), caravanOf([[makeCard(1, "9", "diamonds")]])],
      [makeCard(1, "2", "clubs"), makeCard(1, "4", "diamonds")],
      []
    ),
    mkPlayer(
      [caravanOf([[makeCard(1, "9", "spades")]]), caravanOf([[makeCard(1, "5", "spades")]]), caravanOf([[makeCard(1, "4", "diamonds")]])],
      [makeCard(2, "Joker", "Red"), makeCard(2, "6", "clubs")],
      []
    ),
  ],
  current: 1, phase: "play", winner: null, log: [], started: true,
});
await page.waitForTimeout(300);
await page.evaluate(() => window.__act({ type: "playOperationCard", player: 1, target: { player: 0, caravan: 0, cardIndex: 0 }, handIndex: 0 }));
await page.waitForTimeout(500);
const staged = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  const t = window.__caravanStore.transition;
  return {
    logLast: s.log[s.log.length - 1],
    hasAck: !!document.querySelector(".confirm.portal"),
    needsConfirm: !!t?.needsConfirmation,
  };
});
console.log("Staged AI Joker:", JSON.stringify(staged.logLast?.text), "ack:", staged.hasAck);
assert.ok(staged.logLast && /Joker/.test(staged.logLast.text), "AI Joker is logged before ack X is clicked");
assert.ok(staged.logLast.detail && staged.logLast.detail.length >= 2, "removal detail logged before ack X");
assert.ok(staged.hasAck && staged.needsConfirm, "red X still shows for confirmation");
await page.locator(".confirm.portal").first().click({ force: true });
await page.waitForTimeout(800);
const cleared = await page.evaluate(() => {
  const s = window.__caravanStore.state;
  return { current: s.current, pending: document.querySelectorAll(".card.pending, .card.pending-remove").length, ackLeft: document.querySelectorAll(".confirm.portal").length };
});
assert.equal(cleared.pending, 0, "ack clears confirmation visuals (no pending rows)");
assert.equal(cleared.ackLeft, 0, "no red X remains");
assert.equal(cleared.current, 0, "turn passes to Human after ack");
assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("PASS: jack+joker log format");
await browser.close();
