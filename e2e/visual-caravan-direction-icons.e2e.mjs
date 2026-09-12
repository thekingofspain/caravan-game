import { chromium } from "playwright";
import assert from "node:assert/strict";
import { boardReady } from "./wait.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await boardReady(page);

let cid = 7000;
function card(rank, suit) {
  cid += 1;
  return { id: `D1-${rank}${suit}-${cid}`, rank, suit };
}
function caravanOf(ranks, suit, direction) {
  return { rows: ranks.map((r) => [card(r, suit)]), direction, suit: ranks.length ? suit : null };
}
function mkPlayer(caravans, hand = [], shoe = []) {
  return { shoe, hand, caravans };
}

// Human: asc (3,5), desc (9,7), single-row (4, no direction).
await page.evaluate((s) => window.__setCaravanState(s), {
  players: [
    mkPlayer([caravanOf(["3", "5"], "hearts", "asc"), caravanOf(["9", "7"], "spades", "desc"), caravanOf(["4"], "clubs", null)]),
    mkPlayer([caravanOf([], null, null), caravanOf([], null, null), caravanOf([], null, null)]),
  ],
  current: 0, phase: "play", winner: null, log: [], started: true,
});
// Bespoke condition: the programmed caravans have rendered, identified by the
// first human caravan header carrying data-dir="asc" (exactly what the test asserts).
await page.waitForFunction(() => {
  const headers = [...document.querySelectorAll(".caravans.human .caravan header")];
  return headers.length >= 3 && headers[0].getAttribute("data-dir") === "asc";
}, null, { timeout: 10000 });

// ── Direction icons map to their masks; null reserves space ──
console.log("TEST: direction icons match caravan direction");
const icons = await page.evaluate(() => {
  const headers = [...document.querySelectorAll(".caravans.human .caravan header")].slice(0, 3);
  return headers.map((h) => {
    const el = h.querySelector(".sort-icon");
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { mask: cs.maskImage, w: Math.round(r.width), h: Math.round(r.height), dir: h.getAttribute("data-dir") };
  });
});
assert.equal(icons.length, 3, `expected 3 human caravan headers, got ${icons.length}`);

assert.equal(icons[0].dir, "asc", `caravan 0 should carry data-dir asc, got ${icons[0].dir}`);
 assert.ok((icons[0].mask || "").includes("sort-human-asc.svg"), `asc caravan should use sort-human-asc.svg, got ${icons[0].mask}`);
 console.log("  PASS: asc caravan uses sort-human-asc.svg (arrow down)");

assert.equal(icons[1].dir, "desc", `caravan 1 should carry data-dir desc, got ${icons[1].dir}`);
 assert.ok((icons[1].mask || "").includes("sort-human-desc.svg"), `desc caravan should use sort-human-desc.svg, got ${icons[1].mask}`);
 console.log("  PASS: desc caravan uses sort-human-desc.svg (arrow down)");

assert.equal(icons[2].dir, null, `single-row caravan should have no data-dir, got ${icons[2].dir}`);
assert.equal(icons[2].mask, "none", `single-row caravan should paint no icon, got ${icons[2].mask}`);
assert.ok(icons[2].w > 0 && icons[2].h > 0, `single-row icon must still reserve space, got ${icons[2].w}x${icons[2].h}`);
console.log("  PASS: single-row caravan reserves icon space with no icon");

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log("\n=== ALL DIRECTION ICON TESTS PASSED ===");
await browser.close();
