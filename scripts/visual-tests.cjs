const assert=require('node:assert/strict');const{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(process.env.TEST_ORIGIN||'http://127.0.0.1:8002');await page.evaluate(async()=>{window.qa=(await import('./game.js?v=21')).manager;const {assetLoader}=await import('./asset-loader.js?v=20'),{COMPETITION_ASSETS}=await import('./asset-manifest.js?v=20');await assetLoader.preload(COMPETITION_ASSETS);});
 for(const [width,height] of [[1920,1080],[1366,768],[1280,720]]){
  await page.setViewportSize({width,height});
  for(const id of ['picking','conveyor','barcode','packing','detective','loading','memory','quality','final']){
   await page.evaluate(async id=>{const {GAME_CONFIGS,buildCompetition}=await import('./tasks.js?v=20'),{SeededRandom}=await import('./rng.js?v=20');qa.reset();document.body.classList.remove("menu-active","results-active");qa.playerName='VISUAL QA';qa.gameConfigs=GAME_CONFIGS;qa.index=GAME_CONFIGS.findIndex(c=>c.id===id);qa.tasks=buildCompetition('VIEWPORT',new SeededRandom('VIEWPORT'));qa.state='countdown';await qa.startGame();clearInterval(qa.timer);qa.timer=null;qa.active.ctx.remaining=()=>qa.active.ctx.config.time;if(id==='memory')qa.active.cleanups.splice(0).forEach(fn=>fn());},id);
   await page.waitForTimeout(100);
   const selector={picking:'[data-sku]',barcode:'[data-sku]',conveyor:'[data-chute]',packing:'[data-shape]',detective:'[data-row]',loading:'[data-pallet-id]',memory:'[data-remember-gift]',quality:'[data-quality]',final:'[data-issue]'}[id];
   const rects=await page.locator(selector).evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
   assert(rects.every(r=>r.left>=0&&r.top>=0&&r.right<=width+1&&r.bottom<=height+1&&r.width>20&&r.height>20),`${id} targets fit ${width}x${height}`);
   const count={picking:6,barcode:6,conveyor:6,packing:10,detective:8,loading:7,memory:5,quality:8,final:4}[id];assert.equal(rects.length,count);
   const images=await page.locator('#minigame-root img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode().then(()=>n.complete&&n.naturalWidth>0))));assert(images.every(Boolean));
   for(const button of await page.locator('.lock-answer,[data-action]').all()){const r=await button.boundingBox();assert(r&&r.bottom!==null&&r.y+r.height<=height+1,`${id} confirmation fits`);}
   await page.screenshot({path:`/tmp/ceva-${id}-${width}.png`});
   if(id==='memory'){await page.evaluate(()=>qa.active.hide());assert.equal(await page.locator('[data-remember-gift]').count(),0);assert.equal(await page.locator('[data-gift]').count(),8);await page.screenshot({path:`/tmp/ceva-memory-select-${width}.png`});}
   if(id==='picking'||id==='barcode'){await page.evaluate(()=>{qa.active.index=9;qa.active.draw();});const late=await page.locator('[data-sku]').evaluateAll(nodes=>nodes.every(n=>{const r=n.getBoundingClientRect();return r.bottom<=innerHeight&&r.right<=innerWidth;}));assert(late,'late-round nine-card layouts fit');await page.screenshot({path:`/tmp/ceva-${id}-late-${width}.png`});}
   console.log(`${id}: ${width}x${height} fit and asset decode passed.`);
  }
 }
 // Native pointer interactions validate that visual changes preserve hit targets.
 await page.setViewportSize({width:1366,height:768});
 await page.evaluate(async()=>{qa.reset();document.body.classList.remove("menu-active","results-active");const {GAME_CONFIGS,buildCompetition}=await import('./tasks.js?v=20'),{SeededRandom}=await import('./rng.js?v=20');qa.gameConfigs=GAME_CONFIGS;qa.index=5;qa.tasks=buildCompetition('DRAG',new SeededRandom('DRAG'));qa.state='countdown';await qa.startGame();clearInterval(qa.timer);});
 const pallets=await page.evaluate(()=>qa.active.data.pallets);const card=page.locator(`[data-pallet-id="${pallets[0].id}"]`);const a=await card.boundingBox(),target=await page.locator('[data-slot="0"]').boundingBox();await page.mouse.move(a.x+a.width*.5,a.y+a.height*.5);await page.mouse.down();const ghost=await page.locator('.drag-ghost').boundingBox();assert(Math.abs(ghost.width-a.width)<1&&Math.abs(ghost.height-a.height)<1,'ghost dimensions remain stable');await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:6});await page.mouse.up();assert.equal(await page.evaluate(()=>qa.active.slots[0]),pallets[0].id);assert.equal(await page.locator('.drag-ghost').count(),0);
 await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(100);const second=page.locator(`[data-pallet-id="${pallets[1].id}"]`);await second.click();assert.equal(await second.getAttribute('aria-pressed'),'true');await page.locator('[data-slot="1"]').click({position:{x:4,y:4}});assert.equal(await page.evaluate(()=>qa.active.slots[1]),pallets[1].id);
 assert.deepEqual(errors,[]);console.log('All 27 stage/viewports, late rounds, and native Truck drag + resized click passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
