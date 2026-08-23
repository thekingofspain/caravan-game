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
  await page.waitForSelector(".hand-zone--human .hand__slot.is-selectable", { timeout: 4000 });
}

async function doHumanAction() {
  const slot = page.locator(".hand-zone--human .hand__slot.is-selectable").first();
  await slot.click({ force: true });
  await page.waitForTimeout(100);
  const tgt = page.locator(".placed-wrap.is-target").first();
  if (await tgt.count() > 0) {
    await tgt.click({ force: true });
  } else {
    const ownCount = await page.locator(".caravan-col__stack--human.is-selectable").count();
    if (ownCount > 0) {
      await page.evaluate(() => {
        const btn = document.querySelector(".caravan-col__stack--human.is-selectable");
        if (btn) btn.click();
      });
    } else {
      const d = page.locator(".btn", { hasText: "Discard" });
      if (await d.isEnabled()) await d.click();
    }
  }
}

async function backCards() {
  return await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll(".card")) {
      const bg = getComputedStyle(el).backgroundImage;
      if (el.className.includes("card--back") || bg === "none" || bg.includes("back.svg")) {
        out.push({ cls: el.className, bg });
      }
    }
    return out;
  });
}

// 1) Card height ~ vh / 8.
const vh = 900;
const cardH = await page.locator(".hand-zone--human .card").first().evaluate((el) => el.getBoundingClientRect().height);
assert.ok(Math.abs(cardH - vh / 8) < vh / 8 * 0.2, `card height ${cardH} not ~vh/8`);
console.log("card height OK:", Math.round(cardH));

// 2) Playing on own caravan must work.
await waitHumanTurn();
const humanBefore = await page.locator(".caravan-col__stack--human .placed-wrap").count();
const slot = page.locator(".hand-zone--human .hand__slot.is-selectable").first();
await slot.click({ force: true, position: { x: 3, y: 3 } });
await page.waitForTimeout(100);
const ownCount = await page.locator(".caravan-col__stack--human.is-selectable").count();
const targetCount = await page.locator(".placed-wrap.is-target").count();
if (targetCount > 0) {
  await page.locator(".placed-wrap.is-target").first().click({ force: true });
} else if (ownCount > 0) {
  await page.evaluate(() => {
    const btn = document.querySelector(".caravan-col__stack--human.is-selectable");
    if (btn) btn.click();
  });
}
await page.waitForTimeout(150);
const totalHumanWraps = await page.locator(".caravan-col__stack--human .placed-wrap").count();
assert.ok(totalHumanWraps > humanBefore, "playing on own caravan should add a card");
console.log("own caravan play OK");

// 3) Vertical-only stacking: a placed card has NO horizontal offset (left: 0).
const placed = page.locator(".caravan-col__stack--human .placed-wrap").first();
const leftCss = await placed.evaluate((el) => getComputedStyle(el).left);
assert.equal(leftCss, "0px", `placed card must have no horizontal offset, got ${leftCss}`);
console.log("vertical-only stacking OK (left:", leftCss, ")");

// 4) Short auto-played game: ensure no card ever renders as a back/blank.
let backs = [];
for (let move = 0; move < 14; move++) {
  try { await waitHumanTurn(); } catch { break; }
  await doHumanAction();
  await page.waitForTimeout(100);
  const b = await backCards();
  if (b.length) { backs = b; break; }
}
assert.equal(backs.length, 0, `a card rendered as a back/blank during play: ${JSON.stringify(backs)}`);

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log("PASS: vh/8 sizing, own play, vertical-only stacking, no back/blank cards.");
await browser.close();
