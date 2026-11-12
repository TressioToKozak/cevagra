const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});try{
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.TEST_ORIGIN||'http://127.0.0.1:8025');
await page.evaluate(async()=>{window.qa=(await import('./game.js?v=47')).manager;window.configs=(await import('./tasks.js?v=27')).GAME_CONFIGS;window.make=(await import('./tasks.js?v=27')).buildCompetition;window.RNG=(await import('./rng.js?v=20')).SeededRandom;await(await import('./asset-loader.js?v=20')).assetLoader.preload((await import('./asset-manifest.js?v=20')).COMPETITION_ASSETS);});
async function edges(width,height){
 const before=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}));
 for(const [x,y] of [[2,height/2],[width-2,height/2],[width/2,2],[width/2,height-2],[2,2],[width-2,height-2]]){
  await page.mouse.move(x,y);await page.waitForFunction(()=>document.documentElement.classList.contains('edge-cursor-active'));
  const info=await page.locator('.edge-cursor').evaluate(n=>({visible:!n.hidden,loaded:n.complete&&n.naturalWidth===64,top:n.matches(':popover-open'),left:parseFloat(n.style.left),y:parseFloat(n.style.top)}));
  assert(info.visible&&info.loaded&&info.top);const after=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}));assert.deepEqual(after,before,'Cursor overlay does not add scrollbars');assert(Math.abs(info.left-x)<=18&&Math.abs(info.y-y)<=5);
 }
 await page.mouse.move(2,height/2);await page.mouse.down();assert((await page.locator('.edge-cursor').getAttribute('src')).includes('pointer-click'));await page.mouse.up();
 await page.mouse.move(width/2,height/2);assert(await page.locator('.edge-cursor').isHidden());
}
for(const [width,height] of [[1920,1080],[1366,768],[1280,720]]){
 await page.setViewportSize({width,height});await page.evaluate(()=>{qa.reset();qa.landing();});await edges(width,height);
 for(const id of ['picking','conveyor','barcode','packing','detective','loading','memory','quality','final']){
  await page.evaluate(id=>{qa.reset();document.body.classList.remove('menu-active','results-active');qa.gameConfigs=configs;qa.tasks=make('EDGE-CURSOR',new RNG('EDGE-CURSOR'));qa.index=configs.findIndex(c=>c.id===id);qa.playerName='Cursor QA';qa.briefing();},id);
  await page.waitForFunction(()=>qa.stageReady);await edges(width,height);await page.evaluate(()=>{qa.state='countdown';void qa.startGame();});await page.waitForFunction(()=>qa.state==='playing');await edges(width,height);
 }
 console.log(`${width}x${height}: custom cursor at all viewport edges in menu, nine briefings and nine games`);
}
await page.mouse.move(2,350);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert(await page.locator('.edge-cursor').isHidden());assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
