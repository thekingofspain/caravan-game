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

function faceType(cls) {
  if (/card--jack/.test(cls)) return "jack";
  if (/card--queen/.test(cls)) return "queen";
  if (/card--king/.test(cls)) return "king";
  if (/card--joker/.test(cls)) return "joker";
  return null;
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

// Fill the 3 starting placeholders so caravans have cards to target with face cards.
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

// ── Find a face card with at least one valid target ──
console.log("TEST: face card placement and rendering");
const handSlots = page.locator(".hand-zone--human .hand__slot.is-selectable");
const handCount = await handSlots.count();
let chosen = -1;
let chosenType = null;
for (let i = 0; i < handCount; i++) {
  const cls = await handSlots.nth(i).locator(".card").getAttribute("class");
  const t = faceType(cls);
  if (!t) continue;
  await handSlots.nth(i).click({ force: true, position: { x: 3, y: 3 } });
  await page.waitForTimeout(100);
  const targets = await page.locator(".placed-wrap.is-target").count();
  if (targets > 0) {
    chosen = i;
    chosenType = t;
    break;
  }
  // not this one; deselect
  await page.locator(".hand__slot.is-selected").first().click({ force: true, position: { x: 3, y: 3 } });
  await page.waitForTimeout(60);
}
assert.ok(chosen >= 0, "no face card in hand has a valid target to play");
console.log(`  selected a ${chosenType} with valid targets`);

const wrapsBefore = await page.locator(".placed-wrap").count();
const facesBefore = await page.locator(".placed-face").count();

const target = page.locator(".placed-wrap.is-target").first();
await target.click({ force: true });
await page.waitForTimeout(250);

const wrapsAfter = await page.locator(".placed-wrap").count();
const facesAfter = await page.locator(".placed-face").count();

if (chosenType === "jack") {
  // Jack jacks the targeted value card -> wraps unchanged, one more attachment, row becomes is-jacked with removable X
  assert.equal(wrapsAfter, wrapsBefore, `Jack should keep value-card count (jacked, not removed) (${wrapsBefore} -> ${wrapsAfter})`);
  assert.equal(facesAfter, facesBefore + 1, `Jack should render as 1 attachment (${facesBefore} -> ${facesAfter})`);
  const jackedRows = await page.locator(".caravan__row.is-jacked").count();
  assert.ok(jackedRows > 0, "jacked row should have is-jacked class");
  const jackedFace = await page.locator(".caravan__row.is-jacked .placed-face .card--jack").count();
  assert.ok(jackedFace > 0, "jacked attachment should render as Jack face");
  console.log("  PASS: Jack jacked the targeted card (removable, dimmed, with X)");
} else {
  // Queen / King / Joker attach -> one more rendered face card, card count unchanged
  assert.equal(wrapsAfter, wrapsBefore, `face card should not change value-card count (${wrapsBefore} -> ${wrapsAfter})`);
  assert.equal(facesAfter, facesBefore + 1, `face card should render as 1 attachment (${facesBefore} -> ${facesAfter})`);
  console.log(`  PASS: ${chosenType} rendered as an attachment on the caravan`);
}

// No card rendered as a back/blank after the play.
const backs = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll(".caravan-col__stack .card")) {
    const bg = getComputedStyle(el).backgroundImage;
    if (el.className.includes("card--back") || bg.includes("back.svg")) out.push(el.className);
  }
  return out;
});
assert.equal(backs.length, 0, `a caravan card rendered as a back/blank: ${JSON.stringify(backs)}`);
console.log("  PASS: every caravan card renders as a real card (no backs/blanks)");

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log("\n=== FACE CARD PLACEMENT & RENDERING TEST PASSED ===");
await browser.close();
