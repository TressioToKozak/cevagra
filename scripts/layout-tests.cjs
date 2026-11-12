const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_ORIGIN||'http://127.0.0.1:8002/');
  await page.evaluate(async()=>{
   window.qa=(await import('./game.js?v=52')).manager;
   const tasks=await import('./tasks.js?v=52');window.configs=tasks.GAME_CONFIGS;window.make=tasks.buildCompetition;
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
   await page.locator('#player-name').fill('Alex');await page.locator('#player-email').fill('alex@example.com');
   const fields=await page.locator('.menu-input-wrap input').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return {background:s.backgroundColor,color:s.color,fill:s.webkitTextFillColor};}));
   assert.deepEqual(fields[0],fields[1],'filled name and email use the same colors');
   assert(await page.locator('.menu-input-wrap').first().evaluate(wrap=>{
    const icon=wrap.querySelector('span'),input=wrap.querySelector('input'),s=getComputedStyle(icon),body=getComputedStyle(icon,'::after'),padding=parseFloat(getComputedStyle(input).paddingLeft);
    return parseFloat(s.left)+parseFloat(body.width)/2+6<padding&&parseFloat(s.top)>=0&&parseFloat(s.top)+parseFloat(s.height)+parseFloat(body.height)+6<=wrap.clientHeight;
   }),'name icon fits inside the input and leaves space before text');
   for(const id of await page.evaluate(()=>configs.map(c=>c.id))){
    await page.evaluate(id=>{qa.reset();document.body.classList.remove('menu-active','results-active');qa.gameConfigs=configs;qa.tasks=make('LAYOUT',new RNG('LAYOUT'));qa.index=configs.findIndex(c=>c.id===id);qa.playerName='Alex';qa.playerEmail='alex@example.com';qa.briefing();},id);
    await fits(id+' briefing');await page.evaluate(async()=>{qa.state='countdown';await qa.startGame();qa.stopTimer();});await fits(id+' gameplay');
    assert.equal(await page.locator('.overall,.terminal-status,.loading-guide,.quality-legend,.final-inspect,.final-footer p').count(),0,'redundant panels are removed');
    if(id==='barcode')assert(await page.locator('.seal-roll').isVisible(),'Film roll is visible');
    const hud=await page.locator('.competition-hud>div').evaluateAll(nodes=>nodes.map(n=>({column:getComputedStyle(n).gridColumn,image:getComputedStyle(n).backgroundImage})));
    assert(hud.every(n=>n.column==='auto'&&n.image==='none'),'all games use the shared HUD without baked-in labels');
    if(id==='loading'){
     const readable=await page.locator('.pallet-yard .load-pallet').evaluateAll(nodes=>nodes.every(n=>{
      const scale=Number(document.querySelector('#app').style.getPropertyValue('--screen-scale')),label=n.querySelector('.pallet-copy b');
      return parseFloat(getComputedStyle(label).fontSize)*scale>=12&&label.scrollWidth<=label.clientWidth+1&&!/LOAD (FIRST|LAST)/.test(n.textContent);
     }));
     assert(readable,'waiting pallet cities stay readable without LOAD FIRST/LAST');
     assert(await page.locator('.truck-cab>img,.rear-door>img').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).objectFit==='contain')),'complete truck markers are shown');
    }
    if(id==='conveyor'){
     assert.equal(await page.locator('.parcel-copy span,.parcel-copy small').count(),0,'Conveyor omits gift ID and product name');
     assert.equal(await page.locator('.parcel-label>img').count(),1,'original label artwork retains header, barcode and QR');
     for(const variant of [0,1,2]){
      const visible=await page.evaluate(variant=>{
       const a=qa.active;cancelAnimationFrame(a.raf);a.data.parcels[a.index].variant=variant;a.spawn();a.x=a.trackStart+100;a.position();
       const box=a.box.getBoundingClientRect(),belt=document.querySelector('.conveyor').getBoundingClientRect(),label=a.box.querySelector('.parcel-copy b').getBoundingClientRect();
       const hit=document.elementFromPoint(label.left+label.width/2,label.top+label.height/2);
       return box.top>=belt.top-1&&box.bottom<=belt.bottom+1&&!!hit?.closest('[data-moving-box]');
      },variant);
      assert(visible,'all parcel variants fit the belt and their labels are not covered by trim');
     }
    }
    if(id==='picking'){
     assert(await page.locator('.picking-card-footer strong').evaluateAll(nodes=>nodes.every(n=>{
      const scale=Number(document.querySelector('#app').style.getPropertyValue('--screen-scale'));return parseFloat(getComputedStyle(n).fontSize)*scale>=18&&n.scrollWidth<=n.clientWidth+1;
     })),'picking SKUs stay at least 18 screen pixels');
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
