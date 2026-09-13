#!/usr/bin/env node
// Repro: disbanding a caravan uses legacy window.confirm instead of a
// modern in-app confirmation. Clicking Disband must stage an in-app
// alertdialog naming the consequence — and must NOT call window.confirm.
import { chromium } from "playwright";
import { logLength, waitLogGrowth } from "./wait.mjs";
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
  const prevLen = await logLength(page);
  await page.locator(".hand.human .slot.selectable").nth(slots[0]).dispatchEvent("click");
  await page.waitForSelector(".hand.human .slot.selected", { timeout: 8000 });
  const track = page.locator(".caravans.human .caravan").nth(ci).locator(".track.selectable");
  const ph = track.locator(".empty");
  if ((await ph.count()) > 0) await ph.first().click({ force: true });
  else await track.locator(".card").last().click({ force: true });
  await waitLogGrowth(page, prevLen);
}

// Start the game: fill the 3 human starting caravans so Disband appears.
for (let ci = 0; ci < 3; ci++) {
  await waitHumanTurn();
  await addValueCardTo(ci);
}
await waitHumanTurn();

const disbandBtn = page.locator(".caravans.human .caravan .disband").first();
assert.equal(await disbandBtn.count(), 1, "a Disband button should be offered after the opening");

// Trap legacy window.confirm two ways: the Board binds window.confirm at
// render, so a post-render override cannot catch it — but a native dialog
// listener observes the real blocking confirm call. Either firing = legacy.
let nativeDialogFired = false;
page.on("dialog", async (d) => {
  nativeDialogFired = true;
  await d.dismiss();
});
await page.evaluate(() => {
  window.__legacyConfirmCalled = false;
  window.confirm = () => {
    window.__legacyConfirmCalled = true;
    return false;
  };
});

await disbandBtn.click({ force: true });
await page.waitForSelector('.disband-confirm[role="alertdialog"]', { timeout: 8000 });

const legacyCalled =
  nativeDialogFired || (await page.evaluate(() => window.__legacyConfirmCalled === true));
const dialogCount = await page.locator('[role="alertdialog"][aria-label*="isband"]').count();

console.log(`legacy window.confirm called: ${legacyCalled} (native dialog: ${nativeDialogFired})`);
console.log(`modern in-app disband dialog: ${dialogCount}`);

assert.equal(legacyCalled, false, "disband must NOT use legacy window.confirm");
assert.equal(dialogCount, 1, "disband must stage a modern in-app confirmation dialog");

// Cancel path: Keep caravan closes the dialog and changes nothing.
const dialog = page.locator('.disband-confirm[role="alertdialog"]');
assert.match(
  (await dialog.locator("h2").textContent()) ?? "",
  /Disband your/,
  "dialog asks to confirm the disband"
);
assert.equal(await dialog.locator("p").count(), 0, "dialog carries no detail text");
await dialog.getByRole("button", { name: "Keep caravan" }).click();
await page.waitForSelector('.disband-confirm[role="alertdialog"]', { state: "detached", timeout: 8000 });
assert.equal(
  await page.locator('.disband-confirm[role="alertdialog"]').count(),
  0,
  "cancel closes the dialog"
);
assert.equal(
  await page.locator(".caravans.human .caravan").nth(0).locator(".empty").count(),
  0,
  "cancel leaves the caravan intact"
);

// Confirm path: Disband empties the caravan and closes the dialog.
await page.locator(".caravans.human .caravan .disband").first().click({ force: true });
await page.waitForSelector('.disband-confirm[role="alertdialog"]', { timeout: 8000 });
await page
  .locator('.disband-confirm[role="alertdialog"]')
  .getByRole("button", { name: /^Disband/ })
  .click();
await page.waitForSelector('.disband-confirm[role="alertdialog"]', { state: "detached", timeout: 8000 });
assert.equal(
  await page.locator('.disband-confirm[role="alertdialog"]').count(),
  0,
  "confirm closes the dialog"
);
assert.equal(
  await page.locator(".caravans.human .caravan").nth(0).locator(".empty").count(),
  1,
  "confirmed disband empties the caravan"
);

await browser.close();
console.log("\n=== DISBAND MODERN CONFIRM REPRO PASSED ===");
