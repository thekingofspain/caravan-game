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
  await page.waitForSelector(".hand-zone--human .hand__slot.is-selectable", { timeout: 8000 });
}

async function valueSlots() {
  const slots = page.locator(".hand-zone--human .hand__slot.is-selectable");
  const n = await slots.count();
  const out = [];
  for (let i = 0; i < n; i++) {
    const cls = await slots.nth(i).locator(".card").getAttribute("class");
    if (!/card--jack|card--queen|card--king|card--joker/.test(cls || "")) out.push(slots.nth(i));
  }
  return out;
}

async function placeOnCaravan(ci) {
  const stack = page.locator(".caravan-col__stack--human").nth(ci);
  const ph = stack.locator(".caravan__placeholder");
  if (await ph.count() > 0) {
    await ph.first().click({ force: true });
  } else {
    const wraps = stack.locator(".placed-wrap");
    await wraps.last().click({ force: true });
  }
  await page.waitForTimeout(200);
}

// Fill the 3 starting placeholders so caravans have cards to hover.
console.log("Filling the 3 starting placeholders...");
for (let ci = 0; ci < 3; ci++) {
  await waitHumanTurn();
  const slots = await valueSlots();
  assert.ok(slots.length > 0, "no value card to fill a placeholder");
  await slots[0].click({ force: true, position: { x: 3, y: 3 } });
  await page.waitForTimeout(120);
  await placeOnCaravan(ci);
}
await waitHumanTurn();

function isFaceClass(cls) {
  return /card--jack|card--queen|card--king|card--joker/.test(cls || "");
}

// ── LEGAL move -> green temporary placeholder ──
console.log("TEST: hovering a caravan card with a legal value card shows a green placeholder");
const vSlots = await valueSlots();
assert.ok(vSlots.length > 0, "no value card selectable");
await vSlots[0].click({ force: true, position: { x: 3, y: 3 } });
await page.waitForTimeout(120);

const selectableStack = page.locator(".caravan-col__stack--human.is-selectable").first();
assert.ok((await selectableStack.count()) > 0, "expected a selectable human caravan for the chosen value card");
const legalWrap = selectableStack.locator(".placed-wrap").last();
await legalWrap.hover();
await page.waitForTimeout(150);
const legalColor = await legalWrap.evaluate((el) => getComputedStyle(el).outlineColor);
assert.ok(/46, 204, 113/.test(legalColor), `legal hover outline should be green, got: ${legalColor}`);
console.log("  PASS: legal hover is green");

// ── ILLEGAL move -> red temporary placeholder ──
console.log("TEST: hovering an opponent caravan card with a value card shows a red placeholder");
// value cards cannot be played on the opponent's caravans -> always illegal
const aiWrap = page.locator(".caravan-col__stack--ai .placed-wrap").first();
assert.ok((await aiWrap.count()) > 0, "expected an AI caravan card to hover (opponent must have played)");
await aiWrap.hover();
await page.waitForTimeout(150);
const illegalColor = await aiWrap.evaluate((el) => getComputedStyle(el).outlineColor);
assert.ok(/192, 57, 43/.test(illegalColor), `illegal hover outline should be red, got: ${illegalColor}`);
console.log("  PASS: illegal hover is red");

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log("\n=== ALL HOVER PLACEHOLDER TESTS PASSED ===");
await browser.close();
