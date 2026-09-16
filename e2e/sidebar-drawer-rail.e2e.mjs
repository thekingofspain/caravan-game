import { chromium } from "playwright";
import { boardReady } from "./wait.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const failures = [];

// Narrow viewport: hamburger drawer must exist and open.
{
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 720, height: 860 } });
    await page.goto(`${BASE}?seed=123`, { waitUntil: "networkidle" });
    await boardReady(page);
    const hasMenu = (await page.getByRole("button", { name: "Menu" }).count()) > 0;
    const hasRail = (await page.locator(".side-rail").count()) > 0;
    if (!hasMenu) failures.push("narrow: Menu button missing");
    if (hasRail) failures.push("narrow: docked side-rail should not render");
    if (hasMenu) {
        await page.getByRole("button", { name: "Menu" }).dispatchEvent("click");
        await page.waitForSelector("#game-menu", { timeout: 5000 });
        const activity = await page.locator("#game-menu .activity").count();
        if (activity !== 1) failures.push(`narrow: drawer activity count=${activity}`);
    }
    await browser.close();
}

// Wide viewport: docked rail must exist, no hamburger. 1500px breakpoint
// keeps half-width laptop windows (~720-1280px) on the drawer; 1600px at
// 950px height fits rail + hands + 3 lanes with zero column overflow.
{
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    await page.goto(`${BASE}?seed=123`, { waitUntil: "networkidle" });
    await boardReady(page);
    const hasMenu = (await page.getByRole("button", { name: "Menu" }).count()) > 0;
    const rail = await page.locator(".side-rail").count();
    const activity = await page.locator(".side-rail .activity").count();
    if (hasMenu) failures.push("wide: Menu button should not render");
    if (rail !== 1) failures.push(`wide: side-rail count=${rail}`);
    if (activity !== 1) failures.push(`wide: rail activity count=${activity}`);
    await browser.close();
}

if (failures.length) {
    console.error("FAIL:", failures);
    process.exit(1);
} else {
    console.log("PASS: sidebar drawer/rail crossover works");
}
