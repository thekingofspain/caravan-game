#!/usr/bin/env node
import { chromium } from "playwright";
import { logInfo } from "./log.mjs";
import { boardReady, waitGameOver } from "./wait.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173/";

function makeCard(id, rank, suit) {
  if (rank === "Joker") return { id: String(id), rank: "Joker", suit: null, jokerType: "Red" };
  return { id: String(id), rank, suit };
}
function caravanOf(rows, direction = null, suit = null) {
  return { rows, direction, suit };
}
function mkPlayer(caravans, hand = [], shoe = []) {
  return { shoe, hand, caravans };
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(BASE);
await boardReady(page);

const hBoneyard = caravanOf([[makeCard(1, "10", "clubs"), makeCard(2, "K", "clubs")], [makeCard(3, "A", "clubs")]], "asc", "clubs");
const hRedding = caravanOf([[makeCard(4, "7", "spades")], [makeCard(5, "6", "spades")], [makeCard(6, "5", "spades")], [makeCard(7, "4", "clubs"), makeCard(8, "K", "clubs")]], "desc", "spades");
const hShady = caravanOf([[makeCard(9, "3", "clubs")], [makeCard(10, "4", "spades")], [makeCard(11, "9", "hearts")], [makeCard(12, "4", "hearts")], [makeCard(13, "6", "hearts")]], "desc", "hearts");
const aDayglow = caravanOf([[makeCard(20, "10", "diamonds")], [makeCard(21, "9", "diamonds")], [makeCard(22, "5", "hearts")]], "desc", "diamonds");
const aNewReno = caravanOf([[makeCard(23, "10", "spades")], [makeCard(24, "9", "spades")], [makeCard(25, "6", "spades")], [makeCard(26, "A", "hearts")]], "desc", "spades");
const aHub = caravanOf([[makeCard(27, "4", "clubs")]], null, "clubs");

const programmedState = {
  players: [mkPlayer([hBoneyard, hRedding, hShady], [], []), mkPlayer([aDayglow, aNewReno, aHub], [], [])],
  current: 0,
  phase: "gameOver",
  winner: 0,
  log: [{ id: 1, text: "You win the caravan!", segments: [{type:"actor",player:0,form:"subject"}," win the caravan!"], detail: [] }],
  started: true,
};

await page.evaluate((s) => window.__setCaravanState(s), programmedState);
// The activity log is docked on wide screens, behind the hamburger on narrow:
// open the menu first only when the log is not already visible, then wait for
// the winner rows to render instead of sleeping.
if ((await page.locator(".activity").count()) === 0) {
  await page.getByRole("button", { name: "Menu" }).click();
}
await page.waitForSelector(".activity[role='dialog']", { timeout: 3000 });
await waitGameOver(page);
await page.waitForSelector(".log .row.human .score", { timeout: 8000 });
await page.waitForSelector(".log .row.human .wins", { timeout: 8000 });

const info = await page.evaluate(() => {
  const gameover = document.querySelector(".gameover");
  const scores = document.querySelector(".scores");
  const lineWin = document.querySelector(".log .line.win") || document.querySelector(".log .win-details")?.closest(".line");
  const winTitle = document.querySelector(".win-title");
  const humanRow = document.querySelector(".log .row.human");
  const aiRow = document.querySelector(".log .row.ai");
  const humanPlayer = document.querySelector(".log .row.human .player");
  const humanScores = [...document.querySelectorAll(".log .row.human .score")];
  const aiScores = [...document.querySelectorAll(".log .row.ai .score")];
  const humanSeps = [...document.querySelectorAll(".log .row.human .sep")];
  const aiSeps = [...document.querySelectorAll(".log .row.ai .sep")];
  const humanWins = document.querySelector(".log .row.human .wins");
  const aiWins = document.querySelector(".log .row.ai .wins");

  const getGap = (el1, el2) => {
    if (!el1 || !el2) return null;
    const r1 = el1.getBoundingClientRect();
    const r2 = el2.getBoundingClientRect();
    return r2.left - r1.right;
  };

  // Check inline styles (non-standard)
  const hasInlineStyle = (el) => el && el.getAttribute("style") && el.getAttribute("style").trim() !== "";
  const scoreInline = humanScores.some(hasInlineStyle) || aiScores.some(hasInlineStyle);
  const caravansInline = [...document.querySelectorAll(".log .caravans")].some(hasInlineStyle);
  const lineInlineBg = lineWin ? lineWin.getAttribute("style") || "" : "";

  // Check unneeded wrappers: gameover and scores both exist
  const hasGameover = !!gameover;
  const hasScores = !!scores;

  // Player indented on left: check margin-left or padding-left or offset from row left
  let playerIndented = false;
  let playerIndentPx = 0;
  if (humanRow && humanPlayer) {
    const rowRect = humanRow.getBoundingClientRect();
    const playerRect = humanPlayer.getBoundingClientRect();
    playerIndentPx = playerRect.left - rowRect.left;
    playerIndented = playerIndentPx > 2; // at least 2px indent
  }

  // Gaps: digit-bar, bar-digit, lastScore-x, x-count should be equal
  // Find elements for gap checks
  // For human row: scores[0] -> sep[0] -> scores[1] -> sep[1] -> scores[2] -> wins
  // For wins, need to check wins internal if split into x and count
  let gaps = [];
  if (humanScores.length >= 3 && humanSeps.length >= 2 && humanWins) {
    const g1 = getGap(humanScores[0], humanSeps[0]); // digit -> bar
    const g2 = getGap(humanSeps[0], humanScores[1]); // bar -> digit
    const g3 = getGap(humanScores[1], humanSeps[1]);
    const g4 = getGap(humanSeps[1], humanScores[2]);
    const g5 = getGap(humanScores[2], humanWins); // last score -> x
    // For x-count, check if wins has two children
    let g6 = null;
    let winsHasSplit = false;
    if (humanWins.children.length >= 2) {
      winsHasSplit = true;
      g6 = getGap(humanWins.children[0], humanWins.children[1]);
    } else {
      // No split, can't measure x-count gap
      winsHasSplit = false;
    }
    gaps = [g1, g2, g3, g4, g5, g6];
  }

  // Check if gaps are equal within tolerance
  const validGaps = gaps.filter(g => g !== null);
  const avgGap = validGaps.length ? validGaps.reduce((a,b)=>a+b,0)/validGaps.length : 0;
  const gapsEqual = validGaps.every(g => Math.abs(g - avgGap) < 1.0);

  // Check if caravans scores are right aligned is handled elsewhere, but check textAlign
  const scoreTextAlign = humanScores[0] ? getComputedStyle(humanScores[0]).textAlign : null;

  // Check background removed
  const bg = lineWin ? getComputedStyle(lineWin).backgroundColor : null;
  const isBgRemoved = bg === "rgba(0, 0, 0, 0)" || bg === "transparent";

  // Check DOM standards: should be div not span for block, and no inline styles
  const gameoverTag = gameover ? gameover.tagName : null;
  const scoresTag = scores ? scores.tagName : null;
  const rowTagHuman = humanRow ? humanRow.tagName : null;

  return {
    hasGameover,
    hasScores,
    gameoverTag,
    scoresTag,
    rowTagHuman,
    scoreInline,
    caravansInline,
    lineInlineBg,
    hasInlineStyles: scoreInline || caravansInline || lineInlineBg.includes("background"),
    playerIndented,
    playerIndentPx,
    gaps,
    gapsEqual,
    avgGap,
    scoreTextAlign,
    isBgRemoved,
    bg,
    humanScoresCount: humanScores.length,
    humanSepsCount: humanSeps.length,
    winsHasSplit: humanWins ? humanWins.children.length >= 2 : false,
    winsHTML: humanWins ? humanWins.innerHTML : null,
    winsText: humanWins ? humanWins.textContent : null,
  };
});

logInfo("INFO", info);

let failures = [];
if (info.hasInlineStyles) failures.push(`winner DOM has inline styles (scoreInline=${info.scoreInline}, caravansInline=${info.caravansInline}, lineInlineBg="${info.lineInlineBg}") — should be CSS classes, not inline`);
if (info.hasGameover && info.hasScores) failures.push(`unneeded winner wrappers: both .gameover and .scores exist (one is redundant); remove one to achieve same layout`);
if (!info.playerIndented) failures.push(`player not indented on left: indent ${info.playerIndentPx}px (expected >2px)`);
if (info.gaps) {
  // Current CSS: .log .caravans uses uniform `gap: 0.5ch` between scores/seps,
  // while .log .row and .log .wins use `gap: var(--sp-2)` (8px). So g1-g4 must
  // be mutually equal (uniform caravan gap) and g5/g6 must be 8px.
  const [g1, g2, g3, g4, g5, g6] = info.gaps;
  for (const [i, g] of [g1, g2, g3, g4].entries()) {
    if (g !== null && Math.abs(g - g1) > 1) failures.push(`gap ${i} expected uniform caravan gap ~${g1}px, got ${g}px`);
  }
  if (g5 !== null && Math.abs(g5 - 8) > 1) failures.push(`gap 4 (lastScore->wins) expected 8px, got ${g5}px`);
  if (g6 !== null && Math.abs(g6 - 8) > 1) failures.push(`gap 5 (x->count) expected 8px, got ${g6}px`);
}
if (!info.winsHasSplit) failures.push(`wins not split into x and count (needs same gap as digit-bar); current wins HTML: ${info.winsHTML}`);
if (!info.isBgRemoved) failures.push(`background not removed: bg ${info.bg}`);
if (failures.length) {
  console.error("FAILURES:");
  failures.forEach(f=>console.error(" -",f));
  await browser.close();
  process.exit(1);
} else {
  console.log("PASS: winner standards checks passed");
  await browser.close();
  process.exit(0);
}
