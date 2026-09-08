#!/usr/bin/env node
// Repro for Joker grey bug: Joker on 7 should grey all 7s across Human caravans
// Uses playwright via chromium.launch with --no-sandbox for WSL
import { chromium } from "playwright";
import { fileURLToPath } from "url";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5175";

function log(...a){ console.log(...a); }

async function run(){
  const browser = await chromium.launch({ args: ["--no-sandbox","--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.goto(BASE);
  await page.waitForSelector(".caravans", {timeout: 8000});
  await page.waitForTimeout(500);
  log("== Setup: inject 3x7 state ==");

  // Inject state: Human has 7♦,7♥,7♣ in each caravan; Boneyard has extra 9♦ to make 16
  await page.evaluate(()=>{
    const w = window;
    let s = structuredClone(w.__caravanStore.state);
    function mk(rank,suit,j=null){
      if(rank==="Joker") return {id:`j-${j}-${Math.random()}`, rank:"Joker", suit:null, jokerType:j};
      return {id:`${rank}${suit}-${Math.random().toString(36).slice(2,5)}`, rank, suit};
    }
    const H=0,A=1;
    // Match report: Human Boneyard 16 rows2, others 9 rows1 but with 7s
    // Use Boneyard: [7♦,9♦]=16, Redding:[7♥]=7 (report says 9 but we force 7), Shady:[7♣]=7
    s.players[H].caravans[0].rows=[[mk("7","diamonds")],[mk("9","diamonds")]];
    s.players[H].caravans[0].direction="asc"; s.players[H].caravans[0].suit="diamonds";
    s.players[H].caravans[1].rows=[[mk("7","hearts")]];
    s.players[H].caravans[1].direction=null; s.players[H].caravans[1].suit="hearts";
    s.players[H].caravans[2].rows=[[mk("7","clubs")]];
    s.players[H].caravans[2].direction=null; s.players[H].caravans[2].suit="clubs";
    // AI caravans arbitrary
    s.players[A].caravans[0].rows=[[mk("8","clubs")]];
    s.players[A].caravans[1].rows=[[mk("10","spades")],[mk("6","spades")]];
    s.players[A].caravans[2].rows=[[mk("8","spades")]];
    s.players[A].hand=[mk("Joker",null,"Black")];
    s.players[H].hand=[mk("2","clubs")];
    s.current=A; s.phase="play"; s.log=[];
    w.__setCaravanState(s);
  });
  await page.waitForTimeout(600);
  let before = await page.evaluate(()=> {
    const w = window;
    return w.__caravanStore.state.players[0].caravans.map(c=>c.rows.map(r=>r[0].rank+r[0].suit));
  });
  log("before Human rows:", before);

  // Play Joker on Redding 7♥ (Human, caravan 1, idx 0)
  await page.evaluate(()=> {
    const w = window;
    w.__act({type:"playOperationCard", player:1, target:{player:0, caravan:1, cardIndex:0}, handIndex:0});
  });
  await page.waitForTimeout(600);

  let res = await page.evaluate(()=>{
    const w = window;
    const t = w.__caravanStore.transition;
    const pendingEls = document.querySelectorAll(".card.pending");
    const pendingList = [...pendingEls].map(el=>{
      const btn = el.closest("button.card");
      const caravan = el.closest(".caravan");
      const title = caravan?.querySelector(".title")?.textContent?.trim();
      return `${title} idx=${btn?.getAttribute("data-index")}`;
    });
    const displayed = [...document.querySelectorAll(".caravans.human .caravan")].map((c,i)=>{
      const total = c.querySelectorAll(".card").length;
      const pend = c.querySelectorAll(".card.pending").length;
      return {i, title: c.querySelector(".title")?.textContent, total, pend};
    });
    return {
      impacted: t?.impacted,
      impactedCount: t?.impacted?.length,
      pendingEls: pendingEls.length,
      pendingList,
      displayed,
      transition: t,
    };
  });
  log("transition impacted:", res.impacted);
  log("pendingEls:", res.pendingEls, res.pendingList);
  log("displayed per caravan:", res.displayed);

  const expected = 3;
  if(res.pendingEls !== expected){
    log(`❌ BUG REPRODUCED: expected ${expected} greyed cards, got ${res.pendingEls}`);
    log(`   Only ${res.pendingEls} of ${expected} 7s were greyed – matches user report (only target grey)`);
    await page.screenshot({path:"/tmp/joker-bug-repro.png"});
    log("screenshot /tmp/joker-bug-repro.png");
  } else {
    log(`✅ NO BUG: all ${expected} sevens correctly greyed (pending=${res.pendingEls})`);
    // Also check that detail matches engine
    if(res.impactedCount===expected) log("engine impacted count correct");
  }

  await browser.close();
  process.exit(res.pendingEls===expected ? 0 : 1);
}

run().catch(e=>{ console.error(e); process.exit(1); });
