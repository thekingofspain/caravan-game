#!/usr/bin/env node
// After the opening, a caravan with no rows (disbanded or emptied)
// shows its placeholder again — and the placeholder accepts cards.
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
    if (!isFaceClass(cls)) out.push(i);
  }
  return out;
}

async function addValueCardTo(ci) {
  const slots = await valueSlots();
  assert.ok(slots.length > 0, "no value card to place");
  await page.locator(".hand.human .slot.selectable").nth(slots[0]).dispatchEvent("click");
  await page.waitForTimeout(120);
  const track = page.locator(".caravans.human .caravan").nth(ci).locator(".track.selectable");
  const ph = track.locator(".empty");
  if ((await ph.count()) > 0) await ph.first().click({ force: true });
  else await track.locator(".card").last().click({ force: true });
  await page.waitForTimeout(250);
}

// Start the game: fill the 3 human starting caravans.
console.log("Starting the game by filling the 3 starting caravans...");
for (let ci = 0; ci < 3; ci++) {
  await waitHumanTurn();
  await addValueCardTo(ci);
}
await waitHumanTurn();

// ── No placeholder by default once the game is played ──
console.log("TEST: no placeholder shown by default once the game has started");
assert.equal(await page.locator(".caravan .empty").count(), 0, "played game should show no placeholders");
console.log("  PASS: 0 placeholders on the board after the game starts");

// ── Disbanded caravan shows its placeholder again ──
console.log("TEST: disbanded caravan shows its placeholder");
await page.evaluate(() => window.__act({ type: "disbandCaravan", player: 0, caravan: 0 }));
await page.waitForTimeout(400);
const disbanded = page.locator(".caravans.human .caravan").nth(0);
assert.equal(await disbanded.locator(".empty").count(), 1, "disbanded caravan should show its placeholder");
const box = await disbanded.locator(".empty").first().boundingBox();
assert.ok(box && box.width > 10 && box.height > 10, "disbanded placeholder should be visible");
console.log("  PASS: placeholder shown on disbanded caravan");

// ── Placeholder accepts a fresh value card ──
console.log("TEST: placeholder accepts a new value card");
await waitHumanTurn();
const slots = await valueSlots();
if (slots.length === 0) {
  console.log("  SKIP: no value card in hand to replay into the placeholder");
} else {
  await page.locator(".hand.human .slot.selectable").nth(slots[0]).dispatchEvent("click");
  await page.waitForTimeout(120);
  await disbanded.locator(".empty").first().click({ force: true });
  await page.waitForTimeout(400);
  assert.equal(await disbanded.locator(".empty").count(), 0, "placeholder gone after card placed");
  assert.ok((await disbanded.locator("button.card[data-index]").count()) > 0, "card placed via placeholder");
  console.log("  PASS: card placed through the placeholder");
}

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log("\n=== PLACEHOLDER-AFTER-START TEST PASSED ===");
await browser.close();
