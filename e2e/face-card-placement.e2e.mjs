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

function faceType(cls) {
  if (/jack/.test(cls)) return "jack";
  if (/queen/.test(cls)) return "queen";
  if (/king/.test(cls)) return "king";
  if (/joker/.test(cls)) return "joker";
  return null;
}

async function valueSlots() {
  const slots = page.locator(".hand.human .slot.selectable");
  const n = await slots.count();
  const out = [];
  for (let i = 0; i < n; i++) {
    const cls = await slots.nth(i).locator(".card").getAttribute("class");
    if (!/jack|queen|king|joker/.test(cls || "")) out.push(slots.nth(i));
  }
  return out;
}

async function placeOnCaravan(ci) {
  const stack = page.locator(".caravans.human .caravan").nth(ci);
  const ph = stack.locator(".empty");
  if (await ph.count() > 0) {
    await ph.first().click({ force: true });
  } else {
    const wraps = stack.locator(".card");
    await wraps.last().click({ force: true });
  }
  await page.waitForTimeout(200);
}

// Fill the 3 starting placeholders so caravans have cards to target with face cards.
console.log("Filling the 3 starting placeholders...");
for (let ci = 0; ci < 3; ci++) {
  await waitHumanTurn();
  const slots = await valueSlots();
  assert.ok(slots.length > 0, "no value card to fill a placeholder");
  await slots[0].dispatchEvent("click");
  await page.waitForTimeout(120);
  await placeOnCaravan(ci);
}
await waitHumanTurn();

// Guarantee a face card to place: the dealt hands may hold none.
await page.evaluate(() => {
  const s = window.__caravanStore.state;
  const hasFace = s.players[0].hand.some((c) => ["J", "Q", "K"].includes(c.rank) || c.rank === "Joker");
  if (!hasFace) {
    s.players[0].hand[0] = { id: `e2e-face-K-${Date.now()}`, rank: "K", suit: "hearts" };
    window.__setCaravanState({ ...s });
  }
});
await page.waitForTimeout(400);

// ── Find a face card with at least one valid target ──
console.log("TEST: face card placement and rendering");
const handSlots = page.locator(".hand.human .slot.selectable");
const handCount = await handSlots.count();
let chosen = -1;
let chosenType = null;
for (let i = 0; i < handCount; i++) {
  const cls = await handSlots.nth(i).locator(".card").getAttribute("class");
  const t = faceType(cls);
  if (!t) continue;
  await handSlots.nth(i).dispatchEvent("click");
  await page.waitForTimeout(100);
  const targets = await page.locator(".card.target").count();
  if (targets > 0) {
    chosen = i;
    chosenType = t;
    break;
  }
  // not this one; deselect
  await page.locator(".slot.selected").first().dispatchEvent("click");
  await page.waitForTimeout(60);
}
assert.ok(chosen >= 0, "no face card in hand has a valid target to play");
console.log(`  selected a ${chosenType} with valid targets`);

// Value rows are `button.card[data-index]`; face attachments render as `.card` divs inside them.
const rowsLoc = page.locator(".caravan button.card[data-index]");
const attLoc = page.locator(".caravan button.card[data-index] .card");
const rowsBefore = await rowsLoc.count();
const attBefore = await attLoc.count();

const target = page.locator(".card.target").first();
await target.click({ force: true });
await page.waitForTimeout(250);

const rowsAfter = await rowsLoc.count();
const attAfter = await attLoc.count();

if (chosenType === "jack") {
  // Jack removes the targeted row immediately (state + visuals; own-actor Jack needs no ack).
  assert.equal(rowsAfter, rowsBefore - 1, `Jack should remove the targeted row (${rowsBefore} -> ${rowsAfter})`);
  assert.equal(attAfter, attBefore, `Jack attaches nothing (${attBefore} -> ${attAfter})`);
  console.log("  PASS: Jack removed the targeted row");
} else if (chosenType === "joker") {
  // Joker removes every row matching the target (at least the target itself).
  assert.ok(rowsAfter < rowsBefore, `Joker should remove at least the targeted row (${rowsBefore} -> ${rowsAfter})`);
  console.log("  PASS: Joker removed the matching rows");
} else {
  // Queen / King attach -> one more rendered attachment, row count unchanged
  assert.equal(rowsAfter, rowsBefore, `face card should not change row count (${rowsBefore} -> ${rowsAfter})`);
  assert.equal(attAfter, attBefore + 1, `face card should render as 1 attachment (${attBefore} -> ${attAfter})`);
  console.log(`  PASS: ${chosenType} rendered as an attachment on the caravan`);
}

// No card rendered as a back/blank after the play.
const backs = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll(".caravan .card")) {
    const bg = getComputedStyle(el).backgroundImage;
    if (el.className.includes("back") || bg.includes("back.svg")) out.push(el.className);
  }
  return out;
});
assert.equal(backs.length, 0, `a caravan card rendered as a back/blank: ${JSON.stringify(backs)}`);
console.log("  PASS: every caravan card renders as a real card (no backs/blanks)");

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log("\n=== FACE CARD PLACEMENT & RENDERING TEST PASSED ===");
await browser.close();
