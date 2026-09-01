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
    await slot.click({ force: true, position: { x: 3, y: 3 } });
    await page.waitForTimeout(100);
    const stack = page.locator(".play-row.human .caravan").nth(ci);
    const cls = await stack.getAttribute("class");
    if (/is-selectable/.test(cls || "")) {
      const ph = stack.locator(".empty");
      if (await ph.count() > 0) await ph.first().click({ force: true });
      else await stack.locator(".card").last().click({ force: true });
      await page.waitForTimeout(200);
      return true;
    }
    await page.locator(".slot.selected").first().click({ force: true, position: { x: 3, y: 3 } });
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
const totalPh = await page.locator(".empty").count();
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
  console.log("  SKIP: no Jack in hand this round (could not empty a caravan deterministically)");
} else {
  await handSlots.nth(jackIdx).click({ force: true, position: { x: 3, y: 3 } });
  await page.waitForTimeout(120);
  const humanTargets = page.locator(".play-row.human .caravan .card.target");
  assert.ok((await humanTargets.count()) > 0, "expected at least one human caravan card to be a Jack target");
  // Jack now jacks (attaches, sets value 0, removable) instead of splicing — wraps stay, row becomes jacked with X
  const wrapsBefore = await page.locator(".play-row.human .caravan .card").count();
  const facesBefore = await page.locator(".card").count();
  await humanTargets.first().click({ force: true });
  await page.waitForTimeout(350);

  const wrapsAfter = await page.locator(".play-row.human .caravan .card").count();
  assert.equal(wrapsAfter, wrapsBefore, `Jack should keep value-card count (jacked) (${wrapsBefore} -> ${wrapsAfter})`);
  const facesAfter = await page.locator(".card").count();
  assert.equal(facesAfter, facesBefore + 1, `Jack should render as attachment (${facesBefore} -> ${facesAfter})`);
  const isJacked = await page.locator(".card.jacked").count();
  assert.ok(isJacked > 0, "jacked row should have jacked class");

  const phAfter = await page.locator(".empty").count();
  assert.equal(phAfter, 0, `a jacked caravan must NOT show a default placeholder, got ${phAfter}`);
  console.log("  PASS: a caravan jacked mid-game shows no placeholder and renders Jack");

  // Now test actual emptying via the X (removeJacked) — jacked Ace/face can be removed, still no placeholder when game has started
  const removeBtn = page.locator(".confirm").first();
  if ((await removeBtn.count()) > 0) {
    const wrapsBefore2 = await page.locator(".play-row.human .caravan .card").count();
    await removeBtn.click({ force: true });
    await page.waitForTimeout(350);
    const wrapsAfter2 = await page.locator(".play-row.human .caravan .card").count();
    assert.equal(wrapsAfter2, wrapsBefore2 - 1, `removeJacked should remove exactly one card (${wrapsBefore2} -> ${wrapsAfter2})`);
    const phAfter2 = await page.locator(".empty").count();
    assert.equal(phAfter2, 0, `an emptied caravan mid-game must NOT show a default placeholder after removeJacked, got ${phAfter2}`);
    console.log("  PASS: a caravan emptied via X (removeJacked) shows no placeholder");
  }
}

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log("\n=== PLACEHOLDER-AFTER-START TEST PASSED ===");
await browser.close();
