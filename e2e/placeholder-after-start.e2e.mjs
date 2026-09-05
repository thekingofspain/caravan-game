import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:5173/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".board");

async function waitHumanTurn() {
  await page.waitForSelector(".hand.human .slot.selectable", { timeout: 8000 });
}

function isFaceClass(cls) {
  return /jack|queen|king|joker/.test(cls || "");
}

async function valueSlots() {
  const slots = page.locator(".hand.human .slot.selectable");
  const n = await slots.count();
  const out = [];
  for (let i = 0; i < n; i++) {
    const cls = await slots.nth(i).locator(".card").getAttribute("class");
    if (!isFaceClass(cls)) out.push(slots.nth(i));
  }
  return out;
}

async function addValueCardTo(ci) {
  await waitHumanTurn();
  const slots = await valueSlots();
  for (const slot of slots) {
    // dispatchEvent: the fanned hand overlaps, so coordinate clicks can land on a neighbor.
    await slot.dispatchEvent("click");
    await page.waitForTimeout(100);
    const stack = page.locator(".caravans.human .caravan").nth(ci);
    if ((await stack.locator(".track.selectable").count()) > 0) {
      const ph = stack.locator(".empty");
      if (await ph.count() > 0) await ph.first().click({ force: true });
      else await stack.locator(".card").last().click({ force: true });
      await page.waitForTimeout(200);
      return true;
    }
    await page.locator(".slot.selected").first().dispatchEvent("click");
    await page.waitForTimeout(60);
  }
  return false;
}

// Start the game: fill the 3 human starting caravans (AI fills its own in response).
console.log("Starting the game by filling the 3 starting caravans...");
for (let ci = 0; ci < 3; ci++) await addValueCardTo(ci);
await waitHumanTurn();

// ── No placeholder by default once the game is played ──
console.log("TEST: no placeholder shown by default once the game has started");
const totalPh = await page.locator(".caravan .empty").count();
assert.equal(totalPh, 0, `played game should show no placeholders, got ${totalPh}`);
console.log("  PASS: 0 placeholders on the board after the game starts");

// ── Emptying a caravan mid-game must NOT bring back a placeholder ──
console.log("TEST: an emptied caravan shows no default placeholder");
const handSlots = page.locator(".hand.human .slot.selectable");
const handCount = await handSlots.count();
let jackIdx = -1;
for (let i = 0; i < handCount; i++) {
  const cls = await handSlots.nth(i).locator(".card").getAttribute("class");
  if (/jack/.test(cls || "")) {
    jackIdx = i;
    break;
  }
}

if (jackIdx < 0) {
  console.log("  SKIP: no Jack in hand this round (could not remove a row deterministically)");
} else {
  // Jack removes the targeted row immediately in state. Give one caravan a second
  // row first so the removal never empties it (an emptied caravan correctly shows `.empty`).
  let twoRowCi = -1;
  for (let ci = 0; ci < 3; ci++) {
    if (await addValueCardTo(ci)) {
      const n = await page.locator(".caravans.human .caravan").nth(ci).locator("button.card[data-index]").count();
      if (n >= 2) { twoRowCi = ci; break; }
    }
  }
  assert.ok(twoRowCi >= 0, "could not build a 2-row caravan to Jack");
  await waitHumanTurn();
  const handSlots2 = page.locator(".hand.human .slot.selectable");
  const handCount2 = await handSlots2.count();
  let jackIdx2 = -1;
  for (let i = 0; i < handCount2; i++) {
    const cls = await handSlots2.nth(i).locator(".card").getAttribute("class");
    if (/jack/.test(cls || "")) { jackIdx2 = i; break; }
  }
  assert.ok(jackIdx2 >= 0, "Jack left the hand while building the 2-row caravan");
  await handSlots2.nth(jackIdx2).dispatchEvent("click");
  await page.waitForTimeout(120);
  const caravanTargets = page.locator(".caravans.human .caravan").nth(twoRowCi).locator(".card.target");
  assert.ok((await caravanTargets.count()) > 0, "expected the 2-row caravan's cards to be Jack targets");
  const rowsLoc = page.locator(".caravans.human .caravan button.card[data-index]");
  const rowsBefore = await rowsLoc.count();
  await caravanTargets.first().click({ force: true });
  await page.waitForTimeout(350);
  // Removal is immediate in state and (own-actor Jack needs no ack) in visuals too.
  const stateRows = await page.evaluate(() => window.__caravanStore.state.players[0].caravans.reduce((n, c) => n + c.rows.length, 0));
  assert.equal(stateRows, rowsBefore - 1, `Jack should remove exactly one row in state (${rowsBefore} -> ${stateRows})`);
  const rowsAfter = await rowsLoc.count();
  assert.equal(rowsAfter, rowsBefore - 1, `Jack should remove exactly one rendered row (${rowsBefore} -> ${rowsAfter})`);

  const jackedPh = await page.locator(".caravans.human .caravan").nth(twoRowCi).locator(".empty").count();
  assert.equal(jackedPh, 0, `the jacked caravan still holds cards so it must NOT show a placeholder, got ${jackedPh}`);
  console.log("  PASS: a row removed mid-game shows no placeholder while its caravan still holds cards");
}

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log("\n=== PLACEHOLDER-AFTER-START TEST PASSED ===");
await browser.close();
