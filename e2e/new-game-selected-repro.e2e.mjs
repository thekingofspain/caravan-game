import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto(`${BASE}?seed=123`, { waitUntil: "networkidle" });
await page.waitForSelector(".board");
await page.waitForTimeout(300);
await page.waitForSelector(".hand-zone--human .hand__slot.is-selectable", {timeout: 5000});
const beforeSel = await page.evaluate(() => window.__caravanStore?.state.players[0].hand.map(c=>c.id));
console.log("before hand ids", beforeSel.slice(0,3));
const selectable = page.locator(".hand-zone--human .hand__slot.is-selectable").first();
await selectable.click({ force: true });
await page.waitForTimeout(200);
let selCount = await page.locator(".hand-zone--human .hand__slot.is-selected").count();
console.log("selected count after click", selCount);
assert.equal(selCount, 1, "should have 1 selected before reset");

// Also open deck and activity to test they get closed on reset
await page.evaluate(() => {
  const aiDeck = document.querySelector(".deck-pile--ai");
  if (aiDeck) aiDeck.click();
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  const actBtn = Array.from(document.querySelectorAll(".btn")).find(b=>b.textContent.includes("Activity"));
  if (actBtn) actBtn.click();
});
await page.waitForTimeout(300);

// Click New game via evaluate to bypass overlay intercept
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll(".btn")).find(b=>b.textContent.includes("New game"));
  if (btn) btn.click();
});
await page.waitForTimeout(600);

const after = await page.evaluate(() => {
  const s = window.__caravanStore?.state;
  const store = window.__caravanStore;
  return {
    hand: s.players[0].hand.map(c=>c.id),
    deckLen: s.players[0].deck.length,
    selDom: document.querySelectorAll(".hand-zone--human .hand__slot.is-selected").length,
    selAria: document.querySelectorAll(".hand-zone--human .hand__slot[aria-pressed='true']").length,
    toast: document.querySelector(".toast")?.textContent || null,
    pendingRemove: document.querySelectorAll(".is-pending-remove, .is-remove-src").length,
    viewDeckOpen: document.querySelectorAll(".deck-overlay").length,
    activityOpen: document.querySelectorAll(".activity-flyout").length,
    previous: store.previous,
    transition: store.transition,
    lastMove: store.lastMove,
    thinking: store.thinking,
    winner: s.winner,
    phase: s.phase,
    logLen: s.log.length,
    caravansEmpty: s.players.every(p=>p.caravans.every(c=>c.rows.length===0)),
  };
});
console.log("after reset", after);

let failures = [];
if (after.selDom !== 0) failures.push(`DOM still has ${after.selDom} is-selected after reset`);
if (after.selAria !== 0) failures.push(`DOM still has ${after.selAria} aria-pressed after reset`);
if (after.hand.join(",") === beforeSel.join(",")) failures.push("hand ids unchanged after reset");
if (after.viewDeckOpen !== 0) failures.push("deck overlay still open after reset");
if (after.activityOpen !== 0) failures.push("activity flyout still open after reset");
if (after.toast !== null) failures.push(`toast not cleared: ${after.toast}`);
if (after.pendingRemove !== 0) failures.push(`pendingRemove not cleared: ${after.pendingRemove}`);
if (after.previous !== null) failures.push(`previous not null`);
if (after.transition !== null) failures.push(`transition not null`);
if (after.thinking !== false) failures.push(`thinking not false`);
if (after.winner !== null) failures.push(`winner not null`);
if (after.phase !== "play") failures.push(`phase not play`);
if (after.logLen !== 0) failures.push(`log not empty`);
if (!after.caravansEmpty) failures.push(`caravans not empty`);

await browser.close();
if (failures.length) { console.error("FAIL:", failures); process.exit(1); } else { console.log("PASS: all state vars reset on new game"); }
