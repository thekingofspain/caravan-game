import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.click(".start .btn");
await page.waitForSelector(".board");
const res = await page.evaluate(async () => {
  const card = document.querySelector(".player--human .hand .card");
  const bg = getComputedStyle(card).backgroundImage;
  const url = bg.slice(bg.indexOf('"') + 1, bg.lastIndexOf('"'));
  const svg = await (await fetch(url)).text();
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const u = URL.createObjectURL(blob);
  const img = new Image();
  img.src = u;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  // sample brightness across the image
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let light = 0, dark = 0, transparent = 0, total = 0;
  for (let i = 0; i < d.length; i += 4 * 37) {
    const r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
    total++;
    if (a < 20) transparent++;
    else if (r + g + b > 380) light++;
    else dark++;
  }
  return { w: img.naturalWidth, h: img.naturalHeight, light, dark, transparent, total, pctLight: (light/total*100).toFixed(1) };
});
console.log(JSON.stringify(res, null, 2));
await browser.close();
