import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:5173/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const domNestingErrors = [];
page.on("console", (m) => {
  if (m.type() === "error" && /validateDOMNesting/.test(m.text())) domNestingErrors.push(m.text());
});
page.on("pageerror", (e) => domNestingErrors.push("PAGEERROR: " + e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".board");

async function waitHumanTurn() {
  await page.waitForSelector(".player-human .hand-zone .hand__slot.is-selectable", { timeout: 8000 });
}

async function clearSelection() {
  const sel = page.locator(".hand__slot.is-selected");
  if (await sel.count() > 0) {
    await sel.first().click({ force: true, position: { x: 3, y: 3 } });
    await page.waitForTimeout(60);
  }
}

function isValueCardClass(cls) {
  return !/card--jack|card--queen|card--king|card--joker/.test(cls || "");
}

async function valueSlots() {
  const slots = page.locator(".player-human .hand-zone .hand__slot.is-selectable");
  const n = await slots.count();
  const out = [];
  for (let i = 0; i < n; i++) {
    const cls = await slots.nth(i).locator(".card").getAttribute("class");
    if (isValueCardClass(cls)) out.push(slots.nth(i));
  }
  return out;
}

// Place a value card on the human caravan column `ci` (real user click).
async function placeOnCaravan(ci) {
  const stack = page.locator(".player-human .caravan").nth(ci);
  const ph = stack.locator(".caravan__empty");
  if (await ph.count() > 0) {
    await ph.first().click({ force: true });
  } else {
    const wraps = stack.locator(".card");
    await wraps.last().click({ force: true });
  }
  await page.waitForTimeout(200);
}

// ── Fill the 3 starting placeholders (one value card per caravan) ──
console.log("Filling the 3 starting placeholders...");
for (let ci = 0; ci < 3; ci++) {
  await waitHumanTurn();
  const slots = await valueSlots();
  assert.ok(slots.length > 0, "no value card available to fill a placeholder");
  await slots[0].click({ force: true, position: { x: 3, y: 3 } });
  await page.waitForTimeout(120);
  await placeOnCaravan(ci);
}

// Each caravan should now hold exactly one card.
for (let ci = 0; ci < 3; ci++) {
  const n = await page.locator(".player-human .caravan").nth(ci).locator(".card").count();
  assert.equal(n, 1, `caravan ${ci + 1} should have 1 card after filling its placeholder, got ${n}`);
}
console.log("  all 3 placeholders filled (1 card each)");

// ── Bug: after placeholders are filled, a real click must still place a card ──
console.log("Attempting to place a value card on a filled caravan...");
await waitHumanTurn();

const candidates = await valueSlots();
assert.ok(candidates.length > 0, "no value card selectable to place on a filled caravan");

let placed = false;
let tried = 0;
for (const slot of candidates) {
  await clearSelection();
  await slot.click({ force: true, position: { x: 3, y: 3 } });
  await page.waitForTimeout(100);

  const stacks = page.locator(".player-human .caravan");
  const stackCount = await stacks.count();
  let targetCi = -1;
  for (let ci = 0; ci < stackCount; ci++) {
    const c = await stacks.nth(ci).getAttribute("class");
    if (/is-selectable/.test(c || "")) {
      targetCi = ci;
      break;
    }
  }
  if (targetCi < 0) continue;

  tried += 1;
  const before = await stacks.nth(targetCi).locator(".card").count();
  const wraps = stacks.nth(targetCi).locator(".card");
  await wraps.last().click({ force: true });
  await page.waitForTimeout(200);
  const after = await stacks.nth(targetCi).locator(".card").count();
  if (after === before + 1) {
    placed = true;
    break;
  }
}

assert.ok(tried > 0, "could not find any legal (value card, caravan) pair to attempt");
assert.ok(placed, "BUG: human cannot place a value card on a filled caravan after the 3 placeholders are filled");
assert.ok(domNestingErrors.length === 0, `DOM nesting error after fix: ${domNestingErrors.join(" | ")}`);

console.log("PASS: human can place cards on filled caravans after the placeholders are filled");
await browser.close();
