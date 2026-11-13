const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const {SealSimulation}=await import('../sealing.js');
 const run=fn=>{const s=new SealSimulation();for(let i=0;i<900;i++){fn(s,i/60);s.step(1/60);}return s;};
 const perfect=run(s=>{s.hold(true);s.y=s.target;});assert.equal(perfect.score,100);assert(perfect.sealed&&perfect.coverage>.99);
 const topDown=run(s=>{s.hold(true);s.y=1-s.target;});assert(topDown.sealed&&topDown.score===100,'Wrapping from the top is fully credited');
 const middleDownUp=run((s,t)=>{s.hold(true);s.y=t<1?.5:t<4.5?.5-(t-1)/7:t<5.2?0:t<13.2?(t-5.2)/8:1;});assert(middleDownUp.sealed&&middleDownUp.coverage===1,'Middle to bottom to top covers the pallet');
 const middleUpDown=run((s,t)=>{s.hold(true);s.y=t<1?.5:t<4.5?.5+(t-1)/7:t<5.2?1:t<13.2?1-(t-5.2)/8:0;});assert(middleUpDown.sealed&&middleUpDown.coverage===1,'Middle to top to bottom covers the pallet');
 const gap=new SealSimulation();gap.layers.fill(1);gap.layers[31]=.95;gap.hold(true);gap.step(.02,1);assert(!gap.sealed,'A nearly complete average cannot hide an unwrapped patch');gap.step(.1,.5);assert(gap.sealed,'Last gap can be finished in the middle');
 const fast=run((s,t)=>{s.hold(true);s.y=t<1.1?0:Math.min(1,(t-1.1)/2);});assert(fast.coverage<.5&&fast.score<perfect.score&&!fast.sealed,'Uncovered gaps prevent a completed seal');
 const slow=run(s=>{s.hold(true);s.y=0;});assert(slow.waste>3&&slow.score<perfect.score,'Dwelling wastes film');
 const outside=run((s,t)=>{s.hold(true);s.y=t<1.1?0:1.2;});assert(outside.outside>10&&outside.score===0,'Outside movements lose points');
 const released=run((s,t)=>{s.hold(t<3||t>4);s.y=s.target;});assert.equal(released.breaks,1);assert(released.score<perfect.score,'A sustained release tears film once');
 // A rendering map must follow contact rather than copying one mask to all walls.
 const {SealFilmVisual,sealContact}=await import('../sealing.js');
 const visualRun=direction=>{const sim=new SealSimulation(),visual=new SealFilmVisual();for(let i=0;i<900&&!sim.sealed;i++){sim.hold(true);sim.y=direction==='down'?1-sim.target:sim.target;sim.step(1/60);visual.sync(sim);}return {sim,visual};};
 for(const direction of ['up','down']){const {sim,visual}=visualRun(direction);assert(sim.sealed);assert(visual.cells.every(n=>n>0),'Completed simulation has actual deposited film at every height and angle');}
 const visSim=new SealSimulation(),vis=new SealFilmVisual();visSim.y=.5;visSim.hold(true);for(let i=0;i<6;i++){visSim.step(1/60);vis.sync(visSim);}assert(vis.cells.some(n=>n>0)&&vis.cells.some(n=>n===0),'First short pass wraps only a local surface patch');
 const stored=Array.from(vis.cells),revision=vis.revision;visSim.hold(false);for(let i=0;i<120;i++){visSim.step(1/60);vis.sync(visSim);}assert.deepEqual(Array.from(vis.cells),stored,'Released rotation retains coverage without adding film');assert.equal(vis.revision,revision);
 visSim.hold(true);for(let i=0;i<200;i++){visSim.step(1/60);vis.sync(visSim);}assert(Math.max(...vis.cells)>1.5,'Repeated winding retains multiple layers');assert(visSim.waste>0,'Visual model leaves excess-film penalties active');
 for(let angle=0;angle<=360;angle++){const c=sealContact(angle);assert(Math.abs(Math.max(Math.abs(c.x),Math.abs(c.z))-.5)<1e-10,'Contact lies on the actual square surface');if(angle){const prev=sealContact(angle-1);assert(Math.hypot(c.x-prev.x,c.z-prev.z)<.025,'Contact moves continuously across corners');}}
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 for(const touch of [false,true]){const p=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1366,height:768},isMobile:touch,hasTouch:touch}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.TEST_ORIGIN||'http://127.0.0.1:8057');await p.evaluate(async()=>{window.qa=(await import('./game.js?v=58')).manager;const t=await import('./tasks.js?v=52');window.configs=t.GAME_CONFIGS;window.make=t.buildCompetition;window.RNG=(await import('./rng.js?v=20')).SeededRandom;});await p.clock.install();await p.clock.pauseAt(new Date());
 const setup=async()=>{await p.evaluate(async()=>{qa.reset();document.body.classList.remove('menu-active','results-active');qa.gameConfigs=configs;qa.tasks=make('SEAL',new RNG('SEAL'));qa.index=2;qa.playerName='Sealing QA';qa.state='countdown';void qa.startGame();});for(let i=0;i<100&&!await p.evaluate(()=>qa.state==='playing');i++){await p.clock.runFor(16);await p.waitForTimeout(5);}assert.equal(await p.evaluate(()=>qa.state),'playing');};
 await setup();await p.evaluate(()=>{const a=qa.active,finish=a.ctx.finish;a.ctx.finish=()=>{window.sealAutoFinish={sealed:a.sim.sealed,remaining:a.ctx.remaining()};finish();};});assert.equal(await p.locator('[data-sku]').count(),0,'Old Barcode Hunt is replaced');assert.equal(await p.locator('.seal-roll').count(),1);assert.equal(await p.locator('[data-film]').count(),0,'Film is rendered as one continuous surface per face');assert.equal(await p.locator('.seal-steps,.seal-stage,.seal-target').count(),0,'No instruction panels or green guidance remain');
 const cdp=await p.context().newCDPSession(p),r=await p.locator('.seal-roll').boundingBox(),x=r.x+r.width/2;let y=r.y+r.height/2;if(touch){const rail=await p.locator('.seal-control').boundingBox();y=rail.y;}
 const move=async(px,py)=>touch?cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:px,y:py}]}):p.mouse.move(px,py);
 if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});else{await p.mouse.move(x,y);await p.mouse.down();}
 await p.clock.runFor(1100);assert(await p.evaluate(()=>qa.active.sim.started),'Film starts applying at the chosen height');
 const before=await p.evaluate(()=>qa.active.sim.y);await move(x-60,y);assert(Math.abs(await p.evaluate(()=>qa.active.sim.y)-before)<.001,'Horizontal movement cannot move the roll');
 for(let i=0;i<145&&await p.evaluate(()=>qa.state==='playing');i++){const target=await p.evaluate(topDown=>{const r=qa.active.control.getBoundingClientRect(),height=topDown?1-qa.active.sim.target:qa.active.sim.target;return r.bottom-height*r.height;},touch);await move(x,target);await p.clock.runFor(100);}
 assert(await p.evaluate(()=>sealAutoFinish.sealed&&sealAutoFinish.remaining>0),'Full coverage finishes before the clock runs out');assert.equal(await p.evaluate(()=>qa.state),'briefing','Completed pallet immediately opens the next minigame briefing');
 assert.equal(await p.evaluate(()=>qa.results.length),1,'Complete coverage submits exactly one result at either edge');assert(await p.evaluate(()=>qa.results[0].score>=95),'Complete coverage earns a high score in either direction');
 if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await p.mouse.up();
 await setup();await p.locator('.seal-roll').focus();await p.keyboard.down('Space');await p.keyboard.down('ArrowUp');await p.clock.runFor(700);await p.keyboard.up('ArrowUp');await p.keyboard.up('Space');assert(await p.evaluate(()=>qa.active.sim.y>.07&&qa.active.sim.layers.some(n=>n>0)&&!qa.active.sim.holding),'Keyboard wrapping still works with the PNG roll');
 await setup();const active=await p.evaluate(()=>{window.oldSealing=qa.active;qa.reset();return oldSealing.locked;});assert(active);await p.clock.runFor(16000);assert.equal(await p.evaluate(()=>qa.results.length),0,'Reset cancels the old animation and completion');
 for(const [w,h]of touch?[[320,568],[390,844],[430,932]]:[[1366,768],[1920,1080]]){await p.setViewportSize({width:w,height:h});await setup();assert(await p.locator('.seal-roll').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));assert(await p.locator('.seal-meters').evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight+1));await p.screenshot({path:`/tmp/ceva-sealing-${w}.png`});}
 assert.deepEqual(errors,[]);await p.close();console.log(`${touch?'Touch':'Mouse'}: any-height start, vertical-only input, full wrap, seal, cleanup and screen sizes passed`);
 }
 }finally{await browser.close();}
 console.log('Sealing: coverage, waste, outside penalties and film tears passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
