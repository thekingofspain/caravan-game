import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const browser = await chromium.launch();
const context = await browser.newContext();
await context.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await context.newPage();

await page.goto(`${BASE}?seed=42`, { waitUntil: "networkidle" });
await page.waitForSelector(".board");
await page.waitForTimeout(300);

// Open activity
if ((await page.locator(".activity").count()) === 0) await page.locator(".btn", { hasText: "Activity" }).click();
await page.waitForSelector(".activity");
await page.waitForTimeout(200);

// Click Copy
const copyBtn = page.locator(".activity .copy");
await copyBtn.waitFor({ state: "visible" });
await copyBtn.click();
await page.waitForTimeout(300);

// Check toast
const toast = await page.locator(".toast").textContent().catch(()=>null);
console.log("toast", toast);
assert.ok(toast && /Copied/.test(toast), `toast should show Copied, got ${toast}`);

// Check clipboard
const clip = await page.evaluate(() => navigator.clipboard.readText());
console.log("clipboard preview", clip.slice(0,300));
assert.ok(clip.startsWith("Seed:"), "clipboard should start with Seed header line");
assert.ok(clip.includes("Seed: 42"), "clipboard should contain seed");
assert.ok(clip.includes("Activity Log:"), "clipboard should contain log section");
assert.ok(clip.includes("Human — hand:"), "clipboard should contain debug hand");
assert.ok(clip.includes("Boneyard") || clip.includes("Redding"), "clipboard should contain caravan names");

console.log("PASS: copy");
await browser.close();
