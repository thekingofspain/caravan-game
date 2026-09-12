import { chromium } from "playwright";
import assert from "node:assert/strict";
import { boardReady } from "./wait.mjs";
import { logInfo } from "./log.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto(`${BASE}?seed=123`, { waitUntil: "networkidle" });
await boardReady(page);
await page.waitForSelector(".hand.human .slot.selectable", {timeout: 5000});
const beforeSel = await page.evaluate(() => window.__caravanStore?.state.players[0].hand.map(c=>c.id));
logInfo("before hand ids", beforeSel.slice(0,3));
const selectable = page.locator(".hand.human .slot.selectable").first();
// dispatchEvent: the fanned hand overlaps, so coordinate clicks can land on a neighbor.
await selectable.dispatchEvent("click");
await page.waitForSelector(".hand.human .slot.selected");
let selCount = await page.locator(".hand.human .slot.selected").count();
logInfo("selected count after click", selCount);
assert.equal(selCount, 1, "should have 1 selected before reset");

// Also open shoe and activity to test they get closed on reset.
// NOTE: without ?peekShoe the AI shoe has no onClick, so this click is a
// no-op in this config and guards nothing observable — no wait needed here.
await page.evaluate(() => {
  const aiShoe = document.querySelector(".shoe.ai");
  if (aiShoe) aiShoe.click();
});
// Semantic locator (role + accessible name) instead of .btn textContent scan.
if ((await page.locator(".activity").count()) === 0) {
  await page.getByRole("button", { name: "Activity" }).dispatchEvent("click");
}
// Resolves immediately on wide viewports where the activity panel is persistent
// chrome; lenient elsewhere, where the post-reset assertion is the real check.
await page.waitForSelector(".activity", { timeout: 5000 }).catch(() => {
  // Narrow viewport with no Activity panel pre-reset — nothing to wait for.
});

// Click New game via dispatchEvent to bypass overlay intercept; then wait for the
// reset's observable effects (the Board reset effect clears UI state in a
// setTimeout(0), so the selection/overlay disappearing IS the reset landing).
await page.getByRole("button", { name: "New game" }).dispatchEvent("click");
await page.waitForFunction(
  () => document.querySelectorAll(".hand.human .slot.selected").length === 0 &&
        document.querySelectorAll(".overlay").length === 0
);

const after = await page.evaluate(() => {
  const s = window.__caravanStore?.state;
  const store = window.__caravanStore;
  return {
    hand: s.players[0].hand.map(c=>c.id),
    shoeLen: s.players[0].shoe.length,
    selDom: document.querySelectorAll(".hand.human .slot.selected").length,
    selAria: document.querySelectorAll(".hand.human .slot[aria-pressed='true']").length,
    toast: document.querySelector(".toast")?.textContent || null,
    pendingRemove: document.querySelectorAll(".pending-remove, .is-remove-src").length,
    viewShoeOpen: document.querySelectorAll(".overlay").length,
    activityOpen: document.querySelectorAll(".activity").length,
    previous: store.previous,
    transition: store.transition,
    lastMove: store.lastMove,
    winner: s.winner,
    phase: s.phase,
    logLen: s.log.length,
    caravansEmpty: s.players.every(p=>p.caravans.every(c=>c.rows.length===0)),
  };
});
logInfo("after reset", after);
let failures = [];
// Persistent panel: stays open across resets on viewports wide enough to dock it.
const wideActivityExpected = await page.evaluate(() => window.matchMedia("(min-width: 70rem)").matches ? 1 : 0);
if (after.selDom !== 0) failures.push(`DOM still has ${after.selDom} is-selected after reset`);
if (after.selAria !== 0) failures.push(`DOM still has ${after.selAria} aria-pressed after reset`);
if (after.hand.join(",") === beforeSel.join(",")) failures.push("hand ids unchanged after reset");
if (after.viewShoeOpen !== 0) failures.push("shoe overlay still open after reset");
if (after.activityOpen !== wideActivityExpected) failures.push(`activity open=${after.activityOpen}, expected ${wideActivityExpected} (persistent chrome on wide viewports)`);
if (after.toast !== null) failures.push(`toast not cleared: ${after.toast}`);
if (after.pendingRemove !== 0) failures.push(`pendingRemove not cleared: ${after.pendingRemove}`);
if (after.previous !== null) failures.push(`previous not null`);
if (after.transition !== null) failures.push(`transition not null`);
if (after.winner !== null) failures.push(`winner not null`);
if (after.phase !== "play") failures.push(`phase not play`);
if (after.logLen !== 0) failures.push(`log not empty`);
if (!after.caravansEmpty) failures.push(`caravans not empty`);

await browser.close();
if (failures.length) { console.error("FAIL:", failures); process.exit(1); } else { console.log("PASS: all state vars reset on new game"); }
