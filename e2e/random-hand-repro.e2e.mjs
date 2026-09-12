import { chromium } from "playwright";
import { boardReady } from "./wait.mjs";
const BASE = process.env.BASE_URL || "http://localhost:5173/";
async function getCounts(page) {
  return await page.evaluate(() => {
    const s = window.__caravanStore?.state;
    if (!s) return null;
    const caravans = s.players.flatMap(p=>p.caravans).map(c=>c.rows.length);
    const totalCards = s.players.reduce((sum,p)=> sum + p.hand.length + p.shoe.length + p.caravans.reduce((a,c)=>a + c.rows.flat().length,0),0);
    return {
      h0: s.players[0].hand.length, s0: s.players[0].shoe.length,
      h1: s.players[1].hand.length, s1: s.players[1].shoe.length,
      caravans, totalCards,
      handIds0: s.players[0].hand.map(c=>c.id),
      shoeIds0: s.players[0].shoe.map(c=>c.id),
    };
  });
}
async function getDomCounts(page) {
  return await page.evaluate(() => {
    const handCards = document.querySelectorAll(".hand.human .slot .card").length;
    const handSlots = document.querySelectorAll(".hand.human .slot").length;
    const shoeCount = document.querySelector(".shoe .count")?.textContent;
    const caravanCards = document.querySelectorAll(".caravan .card").length;
    return { handCards, handSlots, shoeCount, caravanCards };
  });
}
const browser = await chromium.launch();
const page = await browser.newPage();
let failures=[];
// Fixed master seed: the 20 hands vary but every run reproduces them, and
// failures already log their seed for single-seed reruns via ?seed=.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedGen = mulberry32(20260912);
for(let i=0;i<20;i++){
  const seed=Math.floor(seedGen()*1e9);
  await page.goto(`${BASE}?seed=${seed}`, {waitUntil:"networkidle"});
  await boardReady(page);
  // Initial deal: wait until the dealt state (8-card hands) and its DOM render land.
  await page.waitForFunction(() => {
    const s = window.__caravanStore?.state;
    return (
      s?.players?.[0]?.hand?.length === 8 &&
      s?.players?.[1]?.hand?.length === 8 &&
      document.querySelectorAll(".hand.human .slot .card").length === 8
    );
  }, null, { timeout: 10000 });
  const c=await getCounts(page);
  const d=await getDomCounts(page);
  console.log(`seed ${seed}: state`,c,`dom`,d);
  if(!c || c.h0!==8 || c.s0!==22 || c.h1!==8 || c.s1!==22 || c.totalCards!==60 || c.caravans.some(v=>v!==0)){
    failures.push({seed,c,d});
  }
  if(d.handCards!==8 || d.caravanCards!==0){
    failures.push({seed, reason:"dom mismatch",c,d});
  }
}
await browser.close();
if(failures.length){ console.log(JSON.stringify(failures,null,2)); console.error(`FAIL ${failures.length}`); process.exit(1);} else console.log("PASS");
