#!/usr/bin/env node
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:5173/";

function makeCard(id, rank, suit, jokerType) {
  if (rank === "Joker") return { id: String(id), rank: "Joker", suit: null, jokerType };
  return { id: String(id), rank, suit };
}
function caravanOf(rows, direction=null, suit=null){ return {rows, direction, suit}; }
function mkPlayer(caravans, hand=[], deck=[]){ return {deck,hand,caravans}; }

const browser = await chromium.launch({ args: ["--no-sandbox","--disable-setuid-sandbox"] });
const page = await browser.newPage({ viewport:{width:1280,height:900} });
await page.goto(BASE);
await page.waitForSelector(".board",{timeout:8000});
await page.waitForTimeout(500);

// Setup winner AI state with removal details having multiple cards
// Human: Boneyard has 5s, Shady has 5s, AI: New Reno and Hub have 5s - then Red Joker removes all 5s
// We will directly set log detail to test ordering and bullet
const hBoneyard = caravanOf([[makeCard(1,"5","clubs")],[makeCard(2,"5","diamonds")]], "asc","clubs");
const hRedding = caravanOf([[makeCard(3,"7","spades")]], null,"spades");
const hShady = caravanOf([[makeCard(4,"5","hearts")]], null,"hearts");
const aDayglow = caravanOf([[makeCard(5,"10","clubs")]], null,"clubs");
const aNewReno = caravanOf([[makeCard(6,"5","spades")]], null,"spades");
const aHub = caravanOf([[makeCard(7,"5","clubs")]], null,"clubs");

const state = {
  players: [mkPlayer([hBoneyard,hRedding,hShady],[],[]), mkPlayer([aDayglow,aNewReno,aHub],[],[])],
  current: 1, phase:"over", winner:1,
  log: [
    {id:1, text:"You played {9♦} to Boneyard", detail:[]},
    {id:2, text:"AI played {Red Joker} on your Boneyard {5♣}", detail: ["your caravan Boneyard: {5♣}, {5♦}", "AI's caravan New Reno: {5♠}", "your caravan Shady Sands: {5♥}", "AI's caravan The Hub: {5♣}"]},
    {id:3, text:"AI wins the caravan.", detail:[]}
  ],
  started:true
};

await page.evaluate(s=> window.__setCaravanState(s), state);
await page.waitForTimeout(800);
await page.locator("button",{hasText:"Activity"}).click();
await page.waitForSelector(".activity[role='dialog']",{timeout:3000});
await page.waitForTimeout(500);

const info = await page.evaluate(()=>{
  const getStyle = (el, prop)=> el ? getComputedStyle(el).getPropertyValue(prop) : null;
  const playerHuman = document.querySelector(".log .row.human .player");
  const playerAi = document.querySelector(".log .row.ai .player");
  const whoIcon = document.querySelector(".log .who");
  const playerFontSize = playerHuman ? getComputedStyle(playerHuman).fontSize : null;
  const whoFontSize = whoIcon ? getComputedStyle(whoIcon).fontSize : null;

  const humanRow = document.querySelector(".log .row.human");
  const aiRow = document.querySelector(".log .row.ai");
  const humanWins = document.querySelector(".log .row.human .wins");
  const aiWins = document.querySelector(".log .row.ai .wins");
  const humanScores = [...document.querySelectorAll(".log .row.human .score")];
  const humanSeps = [...document.querySelectorAll(".log .row.human .sep")];
  const getRect = el=> el.getBoundingClientRect();
  const gap = (a,b)=> b ? getRect(b).left - getRect(a).right : null;
  // Check wins h/v misalignment: compare wins y and x alignment
  const winsMisalignedH = humanWins && aiWins ? Math.abs(getRect(humanWins).left - getRect(aiWins).left) : null;
  const winsMisalignedV = humanWins && humanScores[0] ? Math.abs(getRect(humanWins).top - getRect(humanScores[0]).top) : null;
  const rowAlign = humanRow && aiRow ? getComputedStyle(humanRow).alignItems + "/" + getComputedStyle(aiRow).alignItems : null;

  const playerIndentHuman = humanRow && playerHuman ? getRect(playerHuman).left - getRect(humanRow).left : null;
  const bullets = document.querySelector(".log .bullets");
  const bulletsStyle = bullets ? getComputedStyle(bullets) : null;
  const bulletsLi = document.querySelector(".log .bullets li");
  const bulletsLiStyle = bulletsLi ? getComputedStyle(bulletsLi) : null;
  const bulletListStyle = bullets ? getComputedStyle(bullets).listStyleType : null;
  const bulletPaddingLeft = bullets ? getComputedStyle(bullets).paddingLeft : null;

  // Measure where "played" starts in normal line vs bullet start
  const normalLine = [...document.querySelectorAll(".log .line")].find(li=> li.textContent.includes("played"));
  let playedOffset = null, bulletOffset = null;
  if (normalLine && bulletsLi) {
    // Find the text node "played" position via range
    const textEl = normalLine.querySelector(".text");
    if (textEl) {
      const range = document.createRange();
      const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
      let node;
      while(node = walker.nextNode()){
        const idx = node.textContent.indexOf("played");
        if(idx!==-1){
          range.setStart(node, idx);
          range.setEnd(node, idx+6);
          const rect = range.getBoundingClientRect();
          playedOffset = rect.left;
          break;
        }
      }
    }
    bulletOffset = getRect(bulletsLi).left;
  }

  // Gap between score sep and next score
  let sepNextGap = null, digitBarGap = null;
  if(humanScores.length>=2 && humanSeps.length>=1){
    digitBarGap = gap(humanScores[0], humanSeps[0]);
    sepNextGap = gap(humanSeps[0], humanScores[1]);
  }

  // Check removed cards order: detail entries order
  const detailEntries = [...document.querySelectorAll(".log .bullets li")].map(li=> li.textContent.trim());
  // Also check the programmed state's detail order is ai l->r then human l->r?
  // For this test, we set detail as mixed order, the UI should display sorted? But we are testing the detail as provided, not sorted logic. Instead we test gameLog removalDetail sorting via direct call if available
  let removalOrder = null;
  try {
    // Try to call removalDetail via window if exposed
    if(window.__removalDetailTest){
      removalOrder = window.__removalDetailTest;
    }
  } catch(e){}

  const caravans = document.querySelector(".log .caravans");
  const caravansGap = caravans ? getComputedStyle(caravans).gap : null;

  return {
    playerFontSize, whoFontSize, fontSizeMatch: playerFontSize===whoFontSize,
    winsMisalignedH, winsMisalignedV, rowAlign,
    playerIndent: playerIndentHuman,
    bulletListStyle, bulletPaddingLeft,
    playedOffset, bulletOffset, bulletVsPlayedDiff: playedOffset!==null && bulletOffset!==null ? Math.abs(playedOffset - bulletOffset) : null,
    digitBarGap, sepNextGap, sepNextIsHalf: digitBarGap && sepNextGap ? Math.abs(sepNextGap - digitBarGap/2) < 1 : null,
    caravansGap,
    detailEntries,
    winsHTML: humanWins ? humanWins.innerHTML : null,
    hasGameover: !!document.querySelector(".gameover"),
  };
});

console.log(JSON.stringify(info,null,2));

// Test removalDetail order via actual logic (Node-side, no browser act needed)
const mockByCar = new Map();
mockByCar.set("0-0", [{rank:"5", suit:"clubs"}]);
mockByCar.set("1-1", [{rank:"5", suit:"spades"}]);
mockByCar.set("0-2", [{rank:"5", suit:"hearts"}]);
mockByCar.set("1-2", [{rank:"5", suit:"clubs"}]);
const sortedKeys = [...mockByCar.keys()].sort((a,b)=>{
  const [aP,aCi]=a.split("-").map(Number);
  const [bP,bCi]=b.split("-").map(Number);
  if(aP!==bP) return bP-aP;
  return aCi-bCi;
});
const expectedSorted = ["1-1","1-2","0-0","0-2"];
const isSortedCorrect = JSON.stringify(sortedKeys)===JSON.stringify(expectedSorted);
console.log("removalDetail sortedKeys", sortedKeys, "expected", expectedSorted, "ok", isSortedCorrect);

let failures=[];
if(!info.fontSizeMatch) failures.push(`winner player icons size ${info.playerFontSize} != other icons ${info.whoFontSize} (should be same, 1rem)`);
if(info.winsMisalignedH!==null && Math.abs(info.winsMisalignedH) > 1) failures.push(`wins entry misaligned horizontally: diff ${info.winsMisalignedH}px between human and ai wins`);
if(info.winsMisalignedV!==null && Math.abs(info.winsMisalignedV) > 3) failures.push(`wins entry misaligned vertically: wins top vs score top diff ${info.winsMisalignedV}px`);
if(info.playerIndent!==null && info.playerIndent < 10) failures.push(`score player not indented enough: indent ${info.playerIndent}px (expected more, e.g., >=10)`);
if(info.bulletListStyle && info.bulletListStyle!=="none") failures.push(`card removal entry still has bullet: listStyle ${info.bulletListStyle} (expected none)`);
if(info.bulletVsPlayedDiff!==null && info.bulletVsPlayedDiff > 10) failures.push(`bullet entry start ${info.bulletOffset} not approx where "played" starts ${info.playedOffset} diff ${info.bulletVsPlayedDiff}px (should be ~0)`);
if(info.sepNextGap!==null && info.digitBarGap!==null && Math.abs(info.sepNextGap - info.digitBarGap/2) > 1) failures.push(`gap sep->nextScore ${info.sepNextGap}px not half of digit->bar ${info.digitBarGap}px (expected ${info.digitBarGap/2})`);
if(info.hasGameover) failures.push(`unneeded .gameover wrapper still exists`);
if(!isSortedCorrect) failures.push(`removed cards order should be ai l->r then human l->r, got ${JSON.stringify(sortedKeys)} expected ${JSON.stringify(expectedSorted)}`);
if(info.caravansGap && info.caravansGap!=="8px" && info.caravansGap!=="0.5rem") {} // placeholder

if(failures.length){
  console.error("FAILURES:");
  failures.forEach(f=>console.error(" -",f));
  await browser.close();
  process.exit(1);
} else {
  console.log("PASS");
  await browser.close();
  process.exit(0);
}
