import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });

const card = page.locator(".card--spades.card--king").first();
await card.waitFor();
const bg = await card.evaluate((el) => getComputedStyle(el).backgroundImage);
console.log("computed background-image:", bg.slice(0, 80));

const count = await page.locator(".card").count();
console.log("card elements rendered:", count);

await page.screenshot({ path: "/tmp/caravan-check.png", fullPage: true });
console.log("screenshot saved");
await browser.close();
