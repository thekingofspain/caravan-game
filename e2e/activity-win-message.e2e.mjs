#!/usr/bin/env node
import { chromium } from "playwright";
import { logInfo } from "./log.mjs";
import { boardReady } from "./wait.mjs";
import assert from "node:assert";

const BASE = process.env.BASE_URL || "http://localhost:5173/";

function makeCard(id, rank, suit) {
  if (rank === "Joker") return { id: String(id), rank: "Joker", suit: null, jokerType: "Red" };
  return { id: String(id), rank, suit };
}
function caravanOf(rows, direction = null, suit = null) {
  return { rows, direction, suit };
}
function mkPlayer(caravans, hand = [], deck = []) {
  return { deck, hand, caravans };
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(BASE);
await boardReady(page);

// Program a winning state: Human wins with 2 caravans
const hBoneyard = caravanOf([[makeCard(1, "10", "clubs"), makeCard(2, "K", "clubs")], [makeCard(3, "A", "clubs")]], "asc", "clubs"); // 21? 10*2+1=21
const hRedding = caravanOf([[makeCard(4, "7", "spades")], [makeCard(5, "6", "spades")], [makeCard(6, "5", "spades")], [makeCard(7, "4", "clubs"), makeCard(8, "K", "clubs")]], "desc", "spades"); // 7+6+5+8=26
const hShady = caravanOf([[makeCard(9, "3", "clubs")], [makeCard(10, "4", "spades")], [makeCard(11, "9", "hearts")], [makeCard(12, "4", "hearts")], [makeCard(13, "6", "hearts")]], "desc", "hearts"); // 3+4+9+4+6=26
const aDayglow = caravanOf([[makeCard(20, "10", "diamonds")], [makeCard(21, "9", "diamonds")], [makeCard(22, "5", "hearts")]], "desc", "diamonds"); // 24
const aNewReno = caravanOf([[makeCard(23, "10", "spades")], [makeCard(24, "9", "spades")], [makeCard(25, "6", "spades")], [makeCard(26, "A", "hearts")]], "desc", "spades"); // 26? 10+9+6+1=26 but ai wins? make 10+9+6+1=26 - make human win by having 26 vs 4? Let's simplify: make aHub small
const aHub = caravanOf([[makeCard(27, "4", "clubs")]], null, "clubs"); // 4

const humanCaravans = [hBoneyard, hRedding, hShady];
const aiCaravans = [aDayglow, aNewReno, aHub];

const programmedState = {
  players: [mkPlayer(humanCaravans, [], []), mkPlayer(aiCaravans, [], [])],
  current: 0,
  phase: "over",
  winner: 0,
  log: [{ id: 1, text: "You win the caravan!", segments: [{type:"actor",player:0,form:"subject"}," win the caravan!"], detail: [] }],
  started: true,
};
await page.evaluate((s) => window.__setCaravanState(s), programmedState);
await page.waitForFunction(() => window.__caravanStore?.state?.phase === "over", null, { timeout: 5000 });
if ((await page.locator(".activity").count()) === 0) await page.locator("button", { hasText: "Activity" }).click();
await page.waitForSelector(".activity[role='dialog']", { timeout: 3000 });
await page.waitForFunction(() => document.querySelector(".log .win-details") && document.querySelector(".log .row.human .player") && document.querySelector(".log .row.ai .player"), null, { timeout: 5000 });

const info = await page.evaluate(() => {
  const lineWin = document.querySelector(".log .line.win");
  const bg = lineWin ? getComputedStyle(lineWin).backgroundColor : null;
  const bgImage = lineWin ? getComputedStyle(lineWin).backgroundImage : null;

  const humanPlayerEl = document.querySelector(".log .row.human .player");
  const aiPlayerEl = document.querySelector(".log .row.ai .player");
  const humanPlayerText = humanPlayerEl ? humanPlayerEl.textContent.trim() : null;
  const aiPlayerText = aiPlayerEl ? aiPlayerEl.textContent.trim() : null;
  const humanPlayerHTML = humanPlayerEl ? humanPlayerEl.innerHTML : null;
  const aiPlayerHTML = aiPlayerEl ? aiPlayerEl.innerHTML : null;

  const humanScores = [...document.querySelectorAll(".log .row.human .score")];
  const aiScores = [...document.querySelectorAll(".log .row.ai .score")];
  const humanRects = humanScores.map(el => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return { text: el.textContent.trim(), x: r.x, width: r.width, right: r.x + r.width, textAlign: style.textAlign };
  });
  const aiRects = aiScores.map(el => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return { text: el.textContent.trim(), x: r.x, width: r.width, right: r.x + r.width, textAlign: style.textAlign };
  });

  // Check right alignment: right edges should be equal across rows per index
  const alignments = humanRects.map((hr, i) => {
    const ar = aiRects[i];
    if (!ar) return null;
    return { idx: i, humanRight: hr.right, aiRight: ar.right, diff: Math.abs(hr.right - ar.right), humanTextAlign: hr.textAlign, aiTextAlign: ar.textAlign };
  });

  return { bg, bgImage, humanPlayerText, aiPlayerText, humanPlayerHTML, aiPlayerHTML, humanRects, aiRects, alignments };
});

logInfo("INFO", info);

let failures = [];

// 1. Background color should be removed (transparent/none)
if (info.bg) {
  // buggy: rgba(212, 175, 55, 0.12)  ~ rgb(212,175,55) with alpha
  const isBuggyBg = info.bg.includes("212") || info.bg.includes("175") || info.bg === "rgba(212, 175, 55, 0.12)";
  const isTransparent = info.bg === "rgba(0, 0, 0, 0)" || info.bg === "transparent" || info.bg === "rgba(0, 0, 0, 0)" || info.bg === "rgb(0, 0, 0)" && false;
  // Accept transparent or none
  if (isBuggyBg) failures.push(`background color not removed: got ${info.bg} (expected transparent/none)`);
  else if (info.bg !== "rgba(0, 0, 0, 0)" && info.bg !== "transparent") {
    // also check if still has color
    console.log(`background is ${info.bg}, checking if transparent...`);
    if (info.bg !== "rgba(0, 0, 0, 0)") failures.push(`background should be transparent/none, got ${info.bg}`);
  }
}

// 2. Icon vs names: expect icons 👤 and 🤖, not text "You"/"AI"
if (info.humanPlayerText === "You") failures.push(`human player should be icon 👤, got names "You"`);
if (info.aiPlayerText === "AI") failures.push(`ai player should be icon 🤖, got names "AI"`);
if (info.humanPlayerText !== "👤") failures.push(`human player expected 👤, got "${info.humanPlayerText}"`);
if (info.aiPlayerText !== "🤖") failures.push(`ai player expected 🤖, got "${info.aiPlayerText}"`);

// 3. Scores right aligned: right edges should align and text-align right
for (const a of info.alignments) {
  if (!a) continue;
  if (a.diff > 1.5) failures.push(`scores idx ${a.idx} not right aligned: human right ${a.humanRight} vs ai right ${a.aiRight} diff ${a.diff}`);
  if (a.humanTextAlign !== "right") failures.push(`human score idx ${a.idx} textAlign is ${a.humanTextAlign}, expected right`);
  if (a.aiTextAlign !== "right") failures.push(`ai score idx ${a.idx} textAlign is ${a.aiTextAlign}, expected right`);
}

if (failures.length > 0) {
  console.error("FAILURES:");
  for (const f of failures) console.error(" -", f);
  await browser.close();
  process.exit(1);
} else {
  console.log("PASS: activity win message checks passed");
  await browser.close();
  process.exit(0);
}
