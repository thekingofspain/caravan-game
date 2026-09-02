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
function caravanOf(rows, direction, suit){ return {rows, direction, suit};}
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
await page.waitForSelector(".play-row.human .track.human", {timeout:5000});
await page.waitForTimeout(600);

const hBoneyard = caravanOf([[makeCard(1,"2","diamonds")]], null, "diamonds");
const hRedding = caravanOf([[makeCard(1,"9","hearts")],[makeCard(1,"7","diamonds")]], "desc","hearts");
const hShadyBefore = caravanOf([
  [makeCard(1,"9","clubs")],[makeCard(1,"8","spades")],[makeCard(1,"7","spades")]
], "desc","clubs");
const aDay = caravanOf([[makeCard(2,"7","clubs")]], null, "clubs");
const aNew = caravanOf([[makeCard(2,"9","diamonds"), makeCard(2,"K","hearts")]], null, "diamonds");
const aHub = caravanOf([[makeCard(2,"10","hearts"), makeCard(2,"K","spades")],[makeCard(2,"5","clubs")]], "desc","hearts");
const humanHand = [makeCard(1,"2","hearts"), makeCard(1,"6","hearts")];
const aiHand = [makeCard(2,"4","diamonds")];
let log = [
  {id:100, text:"You played {9♣} to Shady Sands"},
  {id:101, text:"AI played {7♣} to Dayglow"},
  {id:102, text:"You played {9♥} to Redding"},
  {id:103, text:"AI played {9♦} to New Reno"},
  {id:104, text:"You played {2♦} to Boneyard"},
  {id:105, text:"AI played {10♥} to The Hub"},
  {id:106, text:"You played {7♦} to Redding"},
  {id:107, text:"AI played {K♠} on AI's The Hub {10♥}"},
  {id:108, text:"You played {8♠} to Shady Sands"},
  {id:109, text:"AI played {5♣} to The Hub"},
  {id:110, text:"You played {7♠} to Shady Sands"},
  {id:111, text:"AI played {K♥} on AI's New Reno {9♦}"},
];
const programmedState = {
  players:[
    {hand: humanHand, deck:[], caravans:[hBoneyard,hRedding,hShadyBefore]},
    {hand: aiHand, deck:[], caravans:[aDay,aNew,aHub]}
  ],
  current:0, phase:"play", winner:null, log, started:true
};
await page.evaluate(s=> window.__setCaravanState(s), programmedState);
await page.waitForTimeout(600);
await page.evaluate(()=> window.__act({type:"playValueCard", player:0, caravan:2, handIndex:0}));
await page.waitForTimeout(600);

await page.click("button:has-text('Activity')");
await page.waitForSelector(".activity[role='dialog']", {timeout:3000});
await page.waitForTimeout(300);

const info = await page.evaluate(()=>{
  const dialog = document.querySelector(".activity[role='dialog']");
  const lines = [...dialog.querySelectorAll(".log .line")].map(el=>{
    const text = el.textContent || "";
    const html = el.innerHTML.slice(0,500);
    const hasConfirm = !!el.querySelector(".confirm");
    const className = el.className;
    return {text: text.slice(0,200), html, hasConfirm, className};
  });
  const anyConfirmInLog = dialog.querySelectorAll(".log .confirm").length;
  const fullText = dialog.textContent || "";
  const logHTML = dialog.querySelector(".log")?.innerHTML.slice(0,2000) || "";
  return {lines, anyConfirmInLog, fullText: fullText.slice(0,2000), logHTML};
});
console.log(JSON.stringify(info,null,2));

let failures=[];
if(info.anyConfirmInLog>0) failures.push(`activity log should not have red x .confirm entry at all (found ${info.anyConfirmInLog} .confirm inside log)`);
if(info.fullText.includes("×") && !info.fullText.includes("×2") && !info.fullText.includes("×1")){
  const hasHeaderX = info.fullText.includes("×") && info.lines.every(l=> !l.text.includes("×"));
  if(hasHeaderX) failures.push(`activity dialog should not have red x entry at all (found × in header, should be Close) fullText: ${info.fullText.slice(0,200)}`);
}
for(const l of info.lines){
  if(l.hasConfirm) failures.push(`log line should not have confirm X: ${l.text}`);
  if(l.text.includes("×")){
    failures.push(`log line should not contain × (red X entry) while phase play: "${l.text}"`);
  }
}
const last = info.lines[info.lines.length-1];
if(last && last.text.includes("×")) failures.push(`last log entry should not be X: ${last.text}`);
console.log("log lines count",info.lines.length);
if(info.lines.length !== 13 && info.lines.length !== 14) failures.push(`expected 13 or 14 log lines after 2♥, got ${info.lines.length}`);

if(failures.length){
  console.log("FAILURES:",failures);
  assert.fail(failures.join(" | "));
} else {
  console.log("PASS: activity log has no red x entry");
}
assert.equal(errors.length,0,`console errors: ${errors.join(" | ")}`);
await browser.close();
console.log("=== ACTIVITY NO RED X TEST PASSED ===");
