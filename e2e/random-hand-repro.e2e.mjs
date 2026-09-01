import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:5173/";
async function getCounts(page) {
  return await page.evaluate(() => {
    const s = window.__caravanStore?.state;
    if (!s) return null;
    const caravans = s.players.flatMap(p=>p.caravans).map(c=>c.rows.length);
    const totalCards = s.players.reduce((sum,p)=> sum + p.hand.length + p.deck.length + p.caravans.reduce((a,c)=>a + c.rows.flat().length,0),0);
    return {
      h0: s.players[0].hand.length, d0: s.players[0].deck.length,
      h1: s.players[1].hand.length, d1: s.players[1].deck.length,
      caravans, totalCards,
      handIds0: s.players[0].hand.map(c=>c.id),
      deckIds0: s.players[0].deck.map(c=>c.id),
    };
  });
}
async function getDomCounts(page) {
  return await page.evaluate(() => {
    const handCards = document.querySelectorAll(".hand.human .slot .card").length;
    const handSlots = document.querySelectorAll(".hand.human .slot").length;
    const deckCount = document.querySelector(".deck .count")?.textContent;
    const caravanCards = document.querySelectorAll(".caravan .card").length;
    return { handCards, handSlots, deckCount, caravanCards };
  });
}
const browser = await chromium.launch();
const page = await browser.newPage();
let failures=[];
for(let i=0;i<20;i++){
  const seed=Math.floor(Math.random()*1e9);
  await page.goto(`${BASE}?seed=${seed}`, {waitUntil:"networkidle"});
  await page.waitForSelector(".board");
  await page.waitForTimeout(300);
  const c=await getCounts(page);
  const d=await getDomCounts(page);
  console.log(`seed ${seed}: state`,c,`dom`,d);
  if(!c || c.h0!==8 || c.d0!==22 || c.h1!==8 || c.d1!==22 || c.totalCards!==60 || c.caravans.some(v=>v!==0)){
    failures.push({seed,c,d});
  }
  if(d.handCards!==8 || d.caravanCards!==0){
    failures.push({seed, reason:"dom mismatch",c,d});
  }
}
await browser.close();
if(failures.length){ console.log(JSON.stringify(failures,null,2)); console.error(`FAIL ${failures.length}`); process.exit(1);} else console.log("PASS");
