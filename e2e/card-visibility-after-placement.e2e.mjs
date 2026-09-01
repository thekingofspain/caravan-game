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

async function stackSelectable(ci) {
  const stack = page.locator(".play-row.human .caravan").nth(ci);
  const cls = await stack.getAttribute("class");
  return /is-selectable/.test(cls || "");
}

// Place one value card (if legal) onto human caravan `ci`. Returns true if placed.
async function addValueCardTo(ci) {
  await waitHumanTurn();
  const slots = await valueSlots();
  for (const slot of slots) {
    await slot.click({ force: true, position: { x: 3, y: 3 } });
    await page.waitForTimeout(100);
    if (await stackSelectable(ci)) {
      const stack = page.locator(".play-row.human .caravan").nth(ci);
      const ph = stack.locator(".empty");
      if (await ph.count() > 0) await ph.first().click({ force: true });
      else await stack.locator(".card").last().click({ force: true });
      await page.waitForTimeout(200);
      return true;
    }
    // not legal here; deselect and try the next value card
    await page.locator(".slot.selected").first().click({ force: true, position: { x: 3, y: 3 } });
    await page.waitForTimeout(60);
  }
  return false;
}

// Fill the 3 starting placeholders.
console.log("Filling the 3 starting placeholders...");
for (let ci = 0; ci < 3; ci++) {
  await addValueCardTo(ci);
}
await waitHumanTurn();

// ── Caravans holding a card must never show the default placeholder ──
const phWithCards = await page.locator(".empty").count();
assert.equal(phWithCards, 0, `caravans holding 1 card must show no placeholder, got ${phWithCards}`);
console.log("  PASS: no default placeholder on caravans holding 1 card");

// ── Place additional cards on caravan 1 and verify none disappear ──
console.log("TEST: every placed card remains visible after further placements");
const ci = 1;
const before = await page.locator(".play-row.human .caravan").nth(ci).locator(".card").count();
assert.equal(before, 1, `caravan ${ci + 1} should start with 1 card, got ${before}`);

let added = 0;
for (let step = 0; step < 2; step++) {
  if (await addValueCardTo(ci)) {
    added++;
    const stack = page.locator(".play-row.human .caravan").nth(ci);
    const cardsNow = await stack.locator(".card").count();
    const phNow = await stack.locator(".empty").count();
    assert.equal(phNow, 0, `caravan holding ${cardsNow} cards must show no placeholder, got ${phNow}`);
  }
  else break;
}
console.log("  PASS: no default placeholder on caravans holding multiple cards");
const after = await page.locator(".play-row.human .caravan").nth(ci).locator(".card").count();
assert.equal(after, before + added, `expected ${before + added} visible cards, got ${after}`);
console.log(`  placed ${added} more card(s); caravan now shows ${after} cards`);

// Every placed card in this caravan must be visible (non-zero box) and not a back/blank.
const wraps = page.locator(".play-row.human .caravan").nth(ci).locator(".card");
const n = await wraps.count();
for (let i = 0; i < n; i++) {
  const box = await wraps.nth(i).boundingBox();
  assert.ok(box && box.width > 1 && box.height > 1, `card ${i} in caravan ${ci + 1} is not visible`);
  const isBack = await wraps.nth(i).evaluate((el) => {
    const c = el.querySelector(".card");
    if (!c) return true;
    const bg = getComputedStyle(c).backgroundImage;
    return c.className.includes("back") || bg.includes("back.svg");
  });
  assert.ok(!isBack, `card ${i} in caravan ${ci + 1} rendered as a back/blank`);
}
console.log(`  PASS: all ${n} cards in caravan ${ci + 1} are visible and properly rendered`);

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log("\n=== CARD VISIBILITY AFTER PLACEMENT TEST PASSED ===");
await browser.close();
