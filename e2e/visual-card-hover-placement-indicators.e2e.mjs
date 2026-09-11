import { chromium } from "playwright";
import assert from "node:assert/strict";
import { boardReady, logLength, waitLogGrowth, waitNoPendingAck, waitTurn } from "./wait.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await boardReady(page);

async function waitHumanTurn() {
  await waitTurn(page, 0);
  await page.waitForSelector(".hand.human .slot.selectable", { timeout: 8000 });
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
  const before = await logLength(page);
  const stack = page.locator(".caravans.human .caravan").nth(ci);
  const ph = stack.locator(".empty");
  if (await ph.count() > 0) {
    await ph.first().click({ force: true });
  } else {
    const wraps = stack.locator(".card");
    await wraps.last().click({ force: true });
  }
  // The click commits the human move (logged in the store); wait for the log
  // entry rather than a fixed sleep, then for any ack to clear.
  await waitLogGrowth(page, before);
  await waitNoPendingAck(page);
}

// Fill the 3 starting placeholders so caravans have cards to hover.
console.log("Filling the 3 starting placeholders...");
for (let ci = 0; ci < 3; ci++) {
  await waitHumanTurn();
  const slots = await valueSlots();
  assert.ok(slots.length > 0, "no value card to fill a placeholder");
  await slots[0].dispatchEvent("click");
  await page.waitForSelector(".hand.human .slot.selected", { timeout: 8000 });
  await placeOnCaravan(ci);
}
await waitHumanTurn();

function isFaceClass(cls) {
  return /jack|queen|king|joker/.test(cls || "");
}

// ── LEGAL move -> green temporary placeholder ──
console.log("TEST: hovering a caravan card with a legal value card shows a green placeholder");
const vSlots = await valueSlots();
assert.ok(vSlots.length > 0, "no value card selectable");
await vSlots[0].dispatchEvent("click");
await page.waitForSelector(".hand.human .slot.selected", { timeout: 8000 });

const selectableTrack = page.locator(".caravans.human .caravan .track.selectable").first();
assert.ok((await selectableTrack.count()) > 0, "expected a selectable human caravan for the chosen value card");
const legalWrap = selectableTrack.locator("button.card[data-index]").last();
await legalWrap.hover();
// Hover styles apply on the next frame; poll the computed outline until the
// legal (green) color lands instead of sleeping a fixed delay.
await page.waitForFunction(
  (el) => /46, 204, 113/.test(getComputedStyle(el).outlineColor),
  await legalWrap.elementHandle(),
  { timeout: 5000 }
);
const legalColor = await legalWrap.evaluate((el) => getComputedStyle(el).outlineColor);
assert.ok(/46, 204, 113/.test(legalColor), `legal hover outline should be green, got: ${legalColor}`);
console.log("  PASS: legal hover is green");

// ── ILLEGAL move -> red temporary placeholder ──
console.log("TEST: hovering an opponent caravan card with a value card shows a red placeholder");
// value cards cannot be played on the opponent's caravans -> always illegal
// Hover the topmost (last) row so the point actually lands on it — stacked cards cover each other.
const aiWrap = page.locator(".caravans.ai .caravan button.card[data-index]").last();
assert.ok((await aiWrap.count()) > 0, "expected an AI caravan card to hover (opponent must have played)");
await aiWrap.hover();
// Same as above for the illegal (red) hover color.
await page.waitForFunction(
  (el) => /192, 57, 43/.test(getComputedStyle(el).outlineColor),
  await aiWrap.elementHandle(),
  { timeout: 5000 }
);
const illegalColor = await aiWrap.evaluate((el) => getComputedStyle(el).outlineColor);
assert.ok(/192, 57, 43/.test(illegalColor), `illegal hover outline should be red, got: ${illegalColor}`);
console.log("  PASS: illegal hover is red");

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log("\n=== ALL HOVER PLACEHOLDER TESTS PASSED ===");
await browser.close();
