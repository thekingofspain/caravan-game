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
  const stack = page.locator(".play-row.human .caravan").nth(ci);
  const ph = stack.locator(".empty");
  if (await ph.count() > 0) {
    await ph.first().click({ force: true });
  } else {
    const wraps = stack.locator(".card");
    await wraps.last().click({ force: true });
  }
  await page.waitForTimeout(200);
}

// ── Empty caravans show a placeholder ──
console.log("TEST: empty caravans show a placeholder");
const placeholdersAtStart = await page.locator(".play-row.human .empty").count();
assert.equal(placeholdersAtStart, 3, `expected 3 human placeholders at start, got ${placeholdersAtStart}`);
console.log("  PASS: 3 placeholders visible for the 3 empty human caravans");

// ── Filling a caravan removes its placeholder ──
console.log("TEST: filling a caravan hides its initial placeholder");
await waitHumanTurn();
const slots = await valueSlots();
assert.ok(slots.length > 0, "no value card to fill a placeholder");
await slots[0].click({ force: true, position: { x: 3, y: 3 } });
await page.waitForTimeout(120);
await placeOnCaravan(0);

const afterOne = await page.locator(".play-row.human .empty").count();
assert.equal(afterOne, 2, `after filling 1 caravan, expected 2 placeholders, got ${afterOne}`);

const stack0Ph = await page.locator(".play-row.human .caravan").nth(0).locator(".empty").count();
const stack0Wraps = await page.locator(".play-row.human .caravan").nth(0).locator(".card").count();
assert.equal(stack0Ph, 0, "filled caravan 1 should no longer show a placeholder");
assert.equal(stack0Wraps, 1, "filled caravan 1 should show 1 placed card");
console.log("  PASS: caravan 1 hides its placeholder and shows the placed card");

// ── Filling all caravans removes every placeholder ──
console.log("TEST: all caravans filled -> no placeholders remain");
for (let ci = 1; ci < 3; ci++) {
  await waitHumanTurn();
  const s = await valueSlots();
  assert.ok(s.length > 0, "no value card to fill a placeholder");
  await s[0].click({ force: true, position: { x: 3, y: 3 } });
  await page.waitForTimeout(120);
  await placeOnCaravan(ci);
}
// Wait for the AI to finish placing its starters so the game is fully started.
await waitHumanTurn();
const finalPh = await page.locator(".play-row.human .empty").count();
assert.equal(finalPh, 0, `after filling all caravans, expected 0 human placeholders, got ${finalPh}`);

// Once the game has started, no placeholder is shown by default on ANY caravan.
const totalPh = await page.locator(".empty").count();
assert.equal(totalPh, 0, `after the game starts, no placeholders should be shown anywhere, got ${totalPh}`);
console.log("  PASS: all placeholders hidden once every caravan has a card (no default placeholder in played games)");

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log("\n=== ALL PLACEHOLDER VISIBILITY TESTS PASSED ===");
await browser.close();
