import { chromium } from "playwright";
import assert from "node:assert/strict";

function makeCard(deckId, rank, suitOrJoker){
  if(rank==="Joker"){
    const id=`D${deckId}-Joker${suitOrJoker}`;
    return {id, rank:"Joker", suit:null, jokerType:suitOrJoker};
  }
  const suit=suitOrJoker;
  const id=`D${deckId}-${rank}${suit[0].toUpperCase()}`;
  return {id, rank, suit};
}
function caravanOf(rows, direction, suit){ return {rows, direction, suit}; }
const BASE = process.env.BASE_URL || "http://localhost:5173/";
const browser = await chromium.launch({args:['--no-sandbox','--disable-setuid-sandbox']});
const page = await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];
page.on("console", m=> m.type()==="error" && errors.push(m.text()));
page.on("pageerror", e=> errors.push("PAGEERROR: "+e.message));
await page.goto(BASE, {waitUntil:"networkidle"});
await page.waitForSelector(".board");
const startBtn = page.locator(".start .btn, button:has-text('Start')");
if(await startBtn.count()>0) await startBtn.first().click({force:true});
await page.waitForSelector(".caravans.human .caravan", {timeout:5000});
await page.waitForTimeout(600);

const hBoneyard = caravanOf([[makeCard(1,"2","diamonds")]], null, "diamonds");
const hRedding = caravanOf([[makeCard(1,"9","hearts")],[makeCard(1,"7","diamonds")]], "desc","hearts");
const hShadyBefore = caravanOf([
  [makeCard(1,"9","clubs"), makeCard(1,"J","spades")],
  [makeCard(1,"8","spades")],
  [makeCard(1,"7","spades")]
], "desc","clubs");
const aDay = caravanOf([[makeCard(2,"7","clubs")]], null, "clubs");
const aNew = caravanOf([[makeCard(2,"9","diamonds"), makeCard(2,"K","hearts")]], null, "diamonds");
const aHub = caravanOf([[makeCard(2,"10","hearts"), makeCard(2,"K","spades")],[makeCard(2,"5","clubs")]], "desc","hearts");
const humanHand = [makeCard(1,"2","hearts"), makeCard(1,"6","hearts")];
const aiHand = [makeCard(2,"4","diamonds")];
const programmedState = {
  players:[
    {hand: humanHand, deck:[], caravans:[hBoneyard,hRedding,hShadyBefore]},
    {hand: aiHand, deck:[], caravans:[aDay,aNew,aHub]}
  ],
  current:0, phase:"play", winner:null, log:[{id:100,text:"You played {9♣} to Shady Sands",segments:[{type:"actor",player:0,form:"subject"}," played ",{id:"log100",rank:"9",suit:"clubs"}," to ",{type:"caravan",player:0,caravan:2}]},{id:101,text:"You played {8♠} to Shady Sands",segments:[{type:"actor",player:0,form:"subject"}," played ",{id:"log101",rank:"8",suit:"spades"}," to ",{type:"caravan",player:0,caravan:2}]}], started:true
};
console.log("Programming Shady 9+J,8,7...");
await page.evaluate(s=> window.__setCaravanState(s), programmedState);
await page.waitForTimeout(600);
await page.evaluate(()=> window.__act({type:"playValueCard", player:0, caravan:2, handIndex:0}));
await page.waitForTimeout(600);

const info = await page.evaluate(()=>{
  const tracks = document.querySelectorAll(".caravans.human .caravan .track");
  const shadyTrack = tracks[2];
  const cards = [...shadyTrack.querySelectorAll(":scope > .card")];
  const rects = cards.map(c=>{
    const r=c.getBoundingClientRect();
    return {cls:c.className, idx:c.getAttribute("data-index"), z: getComputedStyle(c).zIndex, y:r.y};
  });
  return {rects, count:cards.length};
});
console.log(JSON.stringify(info,null,2));
let failures=[];
if(info.count!==4) failures.push(`Shady should have 4 cards after 2♥, got ${info.count}`);
const zVals = info.rects.map(r=> parseInt(r.z));
console.log("zVals",zVals);
if(!(zVals[3] > zVals[0])) failures.push(`2 should have higher z than 9 (9 under 2 z), got ${zVals}`);
const nineY = info.rects[0].y;
const twoY = info.rects[3].y;
console.log(`nineY=${nineY} twoY=${twoY}`);
// Human placeholder at top toward title; cards stack from placeholder downward, so 9 at top, 2 below, but 9 still under in z
if(!(nineY < twoY)) failures.push(`9 should be at placeholder top and above 2 in Y (9 y ${nineY} should be < 2 y ${twoY}) — placement should be where placeholder now is`);
const hasJack = await page.evaluate(()=>{
  const card9 = document.querySelectorAll(".caravans.human .caravan .track")[2].querySelector("[data-index='0']");
  return card9 ? card9.innerHTML.includes("jack") : false;
});
if(!hasJack) failures.push("9 should have Jack attachment inside");

if(failures.length){
  console.log("FAILURES:",failures);
  assert.fail(failures.join(" | "));
} else {
  console.log("PASS: 9 and Jack under 2 (z) and placement at placeholder top");
}
assert.equal(errors.length,0,`console errors: ${errors.join(" | ")}`);
await browser.close();
console.log("=== SHADY STACKING TEST PASSED ===");
