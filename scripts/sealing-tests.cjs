const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const {SealSimulation}=await import('../sealing.js');
 const run=fn=>{const s=new SealSimulation();for(let i=0;i<900;i++){fn(s,i/60);s.step(1/60);}return s;};
 const perfect=run(s=>{s.hold(true);s.y=s.target;});assert.equal(perfect.score,100);assert(perfect.sealed&&perfect.coverage>.99);
 const fast=run((s,t)=>{s.hold(true);s.y=t<1.1?0:Math.min(1,(t-1.1)/2);});assert(fast.coverage<.5&&fast.score<perfect.score,'Rushing leaves gaps');
 const slow=run(s=>{s.hold(true);s.y=0;});assert(slow.waste>3&&slow.score<perfect.score,'Dwelling wastes film');
 const outside=run((s,t)=>{s.hold(true);s.y=t<1.1?0:1.2;});assert(outside.outside>10&&outside.score===0,'Outside movements lose points');
 const released=run((s,t)=>{s.hold(t<3||t>4);s.y=s.target;});assert.equal(released.breaks,1);assert(released.score<perfect.score,'A sustained release tears film once');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 for(const touch of [false,true]){const p=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1366,height:768},isMobile:touch,hasTouch:touch}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.TEST_ORIGIN||'http://127.0.0.1:8057');await p.evaluate(async()=>{window.qa=(await import('./game.js?v=50')).manager;const t=await import('./tasks.js?v=50');window.configs=t.GAME_CONFIGS;window.make=t.buildCompetition;window.RNG=(await import('./rng.js?v=20')).SeededRandom;});await p.clock.install();await p.clock.pauseAt(new Date());
 const setup=async()=>{await p.evaluate(async()=>{qa.reset();document.body.classList.remove('menu-active','results-active');qa.gameConfigs=configs;qa.tasks=make('SEAL',new RNG('SEAL'));qa.index=2;qa.playerName='Sealing QA';qa.state='countdown';void qa.startGame();});for(let i=0;i<100&&!await p.evaluate(()=>qa.state==='playing');i++){await p.clock.runFor(16);await p.waitForTimeout(5);}assert.equal(await p.evaluate(()=>qa.state),'playing');};
 await setup();assert.equal(await p.locator('[data-sku]').count(),0,'Old Barcode Hunt is replaced');assert.equal(await p.locator('.seal-roll').count(),1);
 const cdp=await p.context().newCDPSession(p),r=await p.locator('.seal-roll').boundingBox(),x=r.x+r.width/2;let y=r.y+r.height/2;
 const move=async(px,py)=>touch?cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:px,y:py}]}):p.mouse.move(px,py);
 if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});else{await p.mouse.move(x,y);await p.mouse.down();}
 await p.clock.runFor(1100);assert(await p.evaluate(()=>qa.active.sim.anchorAt!==null),'Base needs a real hold');
 const before=await p.evaluate(()=>qa.active.sim.y);await move(x-60,y);assert(Math.abs(await p.evaluate(()=>qa.active.sim.y)-before)<.001,'Horizontal movement cannot move the roll');
 for(let i=0;i<145&&await p.evaluate(()=>qa.state==='playing');i++){const target=await p.evaluate(()=>{const r=qa.active.control.getBoundingClientRect();return r.bottom-qa.active.sim.target*r.height;});await move(x,target);await p.clock.runFor(100);}
 assert.equal(await p.evaluate(()=>qa.results.length),1,'Top hold submits exactly one result');assert(await p.evaluate(()=>qa.results[0].score>=95),'A continuous green-zone wrap earns a high score');
 if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await p.mouse.up();
 await setup();const active=await p.evaluate(()=>{window.oldSealing=qa.active;qa.reset();return oldSealing.locked;});assert(active);await p.clock.runFor(16000);assert.equal(await p.evaluate(()=>qa.results.length),0,'Reset cancels the old animation and completion');
 for(const [w,h]of touch?[[320,568],[390,844],[430,932]]:[[1366,768],[1920,1080]]){await p.setViewportSize({width:w,height:h});await setup();assert(await p.locator('.seal-roll').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));assert(await p.locator('.seal-meters').evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight+1));await p.screenshot({path:`/tmp/ceva-sealing-${w}.png`});}
 assert.deepEqual(errors,[]);await p.close();console.log(`${touch?'Touch':'Mouse'}: base hold, vertical-only input, full wrap, seal, cleanup and screen sizes passed`);
 }
 }finally{await browser.close();}
 console.log('Sealing: coverage, waste, outside penalties and film tears passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
