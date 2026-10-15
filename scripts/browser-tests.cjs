// Optional browser QA: NODE_PATH points to an installed Playwright package.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8002';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});page.on('request',r=>{if(/\.(webp|png|svg)(\?|$)/.test(r.url()))requests.push(r.url());});
  await page.goto(origin);await page.evaluate(async()=>{window.qa=(await import('./game.js?v=22')).manager;});
  assert.equal(await page.locator('#player-name').inputValue(),'');
  await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
  const click=async selector=>page.locator(selector).evaluate(e=>e.click());
  const state=()=>page.evaluate(()=>qa.state);
  const waitState=async target=>{for(let i=0;i<400;i++){if(await state()===target)return;await page.waitForTimeout(40);await page.clock.runFor(32);}throw new Error(`Expected ${target}, got ${await state()}`);};
  async function newRun(){await page.locator('#player-name').fill('Alex');await page.locator('#start-form').evaluate(form=>form.requestSubmit());assert.equal(await state(),'briefing');assert.equal(await page.locator('#asset-progress,#asset-error').count(),0);assert(await page.evaluate(()=>qa.guard.closed));await waitState('briefing');return page.evaluate(()=>({id:qa.runId,seed:qa.runSeed,order:qa.gameConfigs.map(c=>c.id),tasks:qa.tasks}));}
  async function activate(){
   const index=await page.evaluate(()=>qa.index);assert.equal(await state(),'briefing');for(let retry=0;retry<600&&!await page.evaluate(()=>qa.stageReady);retry++){await page.waitForTimeout(40);await page.clock.runFor(32);}assert(await page.evaluate(()=>qa.stageReady));await page.clock.runFor(10000);assert.equal(await state(),'briefing');assert(await page.evaluate(()=>qa.guard.closed));
   await click('#ready-button');await page.evaluate(()=>qa.countdown(3,qa.flowSerial-1));assert.equal(await state(),'countdown');assert(await page.evaluate(()=>qa.guard.closed));
   await page.clock.runFor(2500);assert(await page.evaluate(()=>qa.guard.closed),'countdown has no stage timer');await page.clock.runFor(450);await waitState('playing');
   const timing=await page.evaluate(()=>({left:qa.guard.remaining(),duration:qa.gameConfigs[qa.index].time,index:qa.index,images:[...document.querySelectorAll('#minigame-root img')].every(i=>i.complete&&i.naturalWidth>0)}));assert.equal(timing.index,index);assert(timing.left<=timing.duration&&timing.left>timing.duration-.5);assert(timing.images);
  }
  async function solve(){
   const id=await page.evaluate(()=>qa.gameConfigs[qa.index].id),token=await page.evaluate(()=>qa.stageToken);
   if(id==='picking'||id==='barcode'){const first=await page.locator('[data-sku]').first().evaluate(e=>{e.dataset.qaPersistent='yes';return e.dataset.sku;});for(let i=0;i<10;i++){const target=await page.evaluate(()=>qa.active.current.target);await click(`[data-sku="${target}"]`);if(i===1)assert.equal(await page.locator('[data-qa-persistent]').count(),1,'rapid rounds reuse card nodes');}}
   if(id==='conveyor'){for(let i=0;i<12;i++)await page.evaluate(()=>qa.active.sort(document.querySelector(`[data-chute="${qa.active.active.carrier}"]`)));}
   if(id==='packing')await page.evaluate(async()=>{const {packingInventoryLayout}=await import('./minigames.js?v=22'),layout=packingInventoryLayout(qa.active.data.boxes);for(const [id,pos]of Object.entries(layout)){const node=document.querySelector(`[data-shape="${id}"]`),r=node.getBoundingClientRect(),box=qa.active.data.boxes.find(b=>b.id===id),size=qa.active.boxGeometry(box),cell=document.querySelector(`[data-cell="${pos.x}:${pos.y}"]`).getBoundingClientRect();node.setPointerCapture=()=>{};node.releasePointerCapture=()=>{};const send=(type,x,y)=>node.dispatchEvent(new PointerEvent(type,{pointerId:77,button:0,bubbles:true,cancelable:true,clientX:x,clientY:y}));send('pointerdown',r.left+r.width/2,r.top+r.height/2);send('pointermove',cell.left+size.width/2,cell.top+size.height/2);send('pointerup',cell.left+size.width/2,cell.top+size.height/2);}});
   if(id==='detective'||id==='quality'){const solution=await page.evaluate(()=>qa.active.data.solution);const attr=id==='detective'?'row':'quality';for(const value of solution)await click(`[data-${attr}="${value}"]`);const before=await page.locator('#score-value').textContent();await page.evaluate(()=>qa.updateHud());assert.equal(await page.locator('#score-value').textContent(),before);await click(id==='detective'?'#lock-detective':'#lock-quality');}
   if(id==='loading'){const solution=await page.evaluate(()=>qa.active.data.solution);for(const [i,id] of solution.entries()){await click(`[data-pallet-id="${id}"]`);await page.locator(`[data-slot="${i}"]`).evaluate(e=>e.click());}await click('#lock-loading');}
   if(id==='memory'){assert.equal(await page.locator('[data-remember-gift]').count(),5);const elapsed=await page.evaluate(()=>qa.gameConfigs[qa.index].time-qa.guard.remaining());await page.clock.runFor(Math.max(0,Math.floor(3999-elapsed*1000)));assert.equal(await page.locator('[data-gift]').count(),0);await page.clock.runFor(2);await waitState('playing');assert.equal(await page.locator('[data-remember-gift]').count(),0);assert.equal(await page.locator('[data-gift]').count(),8);const gifts=await page.evaluate(()=>qa.active.data.shipment);for(const gift of gifts)await click(`[data-gift="${gift}"]`);await click('#lock-memory');}
   if(id==='final'){const data=await page.evaluate(()=>qa.active.data);for(const issue of data.solution)await click(`[data-issue="${issue}"]`);await click(`[data-action="${data.action}"]`);}
   assert.notEqual(await state(),'playing');const count=await page.evaluate(()=>qa.results.length);await page.evaluate(token=>qa.completeGame(token),token);assert.equal(await page.evaluate(()=>qa.results.length),count,'no duplicate stage completion');
   if(id!=='final'){await page.clock.runFor(1600);await waitState('briefing');}
   console.log(`Complete flow: ${id} passed.`);
  }
  const first=await newRun();assert.equal(first.order.at(-1),'final');assert.equal(new Set(first.order).size,9);
  for(let i=0;i<9;i++){await activate();await solve();}
  assert.equal(await state(),'results');assert.equal(await page.evaluate(()=>qa.results.length),9);assert.equal(await page.evaluate(()=>qa.results.reduce((s,r)=>s+r.score,0)),1000,'all maximums are achievable with real gameplay time');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('christmas-logistics-leaderboard-v1')).runs.length),1);
  await click('#view-board');assert.equal(await page.locator('.leaderboard tbody tr').count(),1);await click('#modal-close');await click('#return-start');assert.equal(await page.locator('#player-name').inputValue(),'');
  const second=await newRun();assert.notEqual(first.id,second.id);assert.notEqual(first.seed,second.seed);assert.notDeepEqual(first.tasks,second.tasks);
  for(let i=0;i<9;i++){await activate();const duration=await page.evaluate(()=>qa.gameConfigs[qa.index].time);await page.clock.runFor(duration*1000+100);if(i<8){await page.clock.runFor(1600);await waitState('briefing');}}
  assert.equal(await state(),'results');const runs=await page.evaluate(()=>JSON.parse(localStorage.getItem('christmas-logistics-leaderboard-v1')).runs);assert.equal(runs.length,2);assert.equal(runs[0].name,runs[1].name);assert.notEqual(runs[0].id,runs[1].id);assert(runs.every(r=>r.runSeed&&r.timestamp));
  assert.equal(new Set(requests).size,requests.length,'decoded assets are not fetched again between stages/runs');assert.deepEqual(errors,[]);console.log('Two complete competitions, perfect score, all timeouts, unique seeds/IDs, duplicate names, leaderboard and clean console passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
