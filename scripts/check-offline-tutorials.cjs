const assert=require('node:assert/strict'),{chromium}=require('playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8023';
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});try{
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin+'/panel/');await page.locator('#username').fill('ceva');await page.locator('#password').fill('wrong');await page.locator('#login-form').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>document.getElementById('login-error').textContent.includes('Incorrect'));assert(await page.locator('#panel-screen').isHidden());
await page.evaluate(()=>localStorage.setItem('christmas-logistics-leaderboard-v1',JSON.stringify({version:3,runs:[{id:'offline-qa',name:'Offline QA',email:'offline@example.com',score:700,accuracy:90,mistakes:1,timestamp:new Date().toISOString()}]})));
await page.locator('#password').fill('ceva');await page.locator('#login-form').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>!document.getElementById('panel-screen').hidden);assert((await page.locator('#status').textContent()).includes('Offline mode'));assert(await page.locator('#backup-folder').isHidden(),'Offline panel hides Backup folder');assert.equal(await page.locator('#stat-games').textContent(),'1');assert((await page.locator('#statistics-note').textContent()).includes('This browser only'));assert.equal(await page.locator('tbody').getByText('offline@example.com').count(),1);
await page.reload();await page.waitForFunction(()=>!document.getElementById('panel-screen').hidden);const download=page.waitForEvent('download');await page.locator('#export').click();assert.match((await download).suggestedFilename(),/^Leaderboard - \d{2}\.\d{2}\.\d{4}\.xlsx$/);await page.locator('#logout').click();assert(await page.locator('#panel-screen').isHidden());await page.reload();assert(await page.locator('#panel-screen').isHidden());
await page.goto(origin);await page.evaluate(async()=>{const {manager}=await import('./game.js?v=47');const {GAME_CONFIGS,buildCompetition}=await import('./tasks.js?v=27');window.qa=manager;qa.playerName='Tutorial QA';qa.playerEmail='qa@example.com';qa.prepare();qa.gameConfigs=GAME_CONFIGS;qa.index=0;});
for(const size of [[1920,1080],[1366,768],[1280,720]]){
 await page.setViewportSize({width:size[0],height:size[1]});
 for(let index=0;index<9;index++){
  await page.evaluate(index=>{qa.index=index;qa.briefing();},index);await page.waitForFunction(()=>qa.stageReady);
  const image=page.locator('.briefing-demo img');await image.evaluate(img=>img.decode());assert((await image.getAttribute('src')).includes('.gif'));
  const fit=await page.evaluate(()=>{const d=document.querySelector('.briefing-demo').getBoundingClientRect(),p=document.querySelector('.gate-panel').getBoundingClientRect();return d.left>=p.right-1&&d.right<=innerWidth&&d.bottom<=innerHeight&&d.top>=0;});assert(fit,`tutorial ${index} fits ${size}`);assert.equal(await page.locator('#ready-button').isDisabled(),false);assert.equal(await page.evaluate(()=>qa.state),'briefing');
  if(index===4)await page.screenshot({path:`/tmp/ceva-tutorial-wms-${size[0]}.png`});
 }
}
assert.deepEqual(errors,[]);console.log('PASS: offline credentials, local results/Excel, session reload/logout and nine looping tutorial slots at three viewport sizes');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
