const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_ORIGIN||'http://127.0.0.1:8002/');
  await page.evaluate(async()=>{
   window.qa=(await import('./game.js?v=24')).manager;
   const tasks=await import('./tasks.js?v=24');window.configs=tasks.GAME_CONFIGS;window.make=tasks.buildCompetition;
   window.RNG=(await import('./rng.js?v=20')).SeededRandom;
  });
  await page.locator('#player-name').fill('Alex');
  await page.locator('#start-form').evaluate(n=>n.requestSubmit());
  assert.equal(await page.evaluate(()=>qa.state),'menu');
  await page.locator('#player-email').fill('invalid');
  await page.locator('#start-form').evaluate(n=>n.requestSubmit());
  assert.equal(await page.evaluate(()=>qa.state),'menu');
  assert(await page.evaluate(()=>{const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});document.querySelector('#player-name').dispatchEvent(e);return e.defaultPrevented;}));
  await page.locator('#player-email').fill('alex@example.com');
  await page.locator('#start-form').evaluate(n=>n.requestSubmit());
  assert.deepEqual(await page.evaluate(()=>[qa.playerName,qa.playerEmail,qa.state]),['Alex','alex@example.com','briefing']);
  const fits=async label=>{
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const bad=await page.evaluate(()=>[...document.querySelectorAll('#app button,#app input,#app h1,#app .instruction-card,#app .results-game-card')].filter(n=>{
    const r=n.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(n).visibility!=='hidden'&&(r.top< -1||r.left< -1||r.right>innerWidth+1||r.bottom>innerHeight+1);
   }).map(n=>n.className||n.id));
   assert.deepEqual(bad,[],label);
   assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1),label+' document fits');
  };
  for(const [width,height] of [[1920,1080],[1366,650],[1280,600],[1024,576],[800,500]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>qa.landing());await fits('menu');
   for(const id of await page.evaluate(()=>configs.map(c=>c.id))){
    await page.evaluate(id=>{qa.reset();document.body.classList.remove('menu-active','results-active');qa.gameConfigs=configs;qa.tasks=make('LAYOUT',new RNG('LAYOUT'));qa.index=configs.findIndex(c=>c.id===id);qa.playerName='Alex';qa.playerEmail='alex@example.com';qa.briefing();},id);
    await fits(id+' briefing');await page.evaluate(async()=>{qa.state='countdown';await qa.startGame();qa.stopTimer();});await fits(id+' gameplay');
    if(id==='picking'){
     const boxes=[];
     for(let i=0;i<10;i++){await page.evaluate(i=>{qa.active.index=i;qa.active.draw();},i);assert.equal(await page.locator('.picking-card').count(),6);boxes.push(await page.locator('.picking-locations').boundingBox());}
     assert(boxes.every(b=>Math.abs(b.height-boxes[0].height)<1),'pallet grid keeps its height');
    }
   }
   await page.evaluate(()=>{qa.results=configs.map(c=>({id:c.id,name:c.name,score:100,max:c.max}));qa.finish();});await fits('results');
   const run=await page.evaluate(()=>JSON.parse(localStorage.getItem('christmas-logistics-leaderboard-v1')).runs.at(-1));assert.equal(run.email,'alex@example.com');
   await page.locator('#view-board').click();
   assert(!(await page.locator('.leaderboard').innerText()).includes('alex@example.com'));
   await page.locator('#modal-close').click();console.log(`${width}x${height}: all screens fit; six stable pallets; email saved and hidden from ranking`);
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
