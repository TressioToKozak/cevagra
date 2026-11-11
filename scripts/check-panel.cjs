// Run against a server.py instance with a disposable database.
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8002';
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});try{
const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin);
assert.equal(await page.locator('#player-email').getAttribute('autocomplete'),'off');assert.equal(await page.locator('.menu-email-icon').count(),1);
const sizes=await page.evaluate(()=>({form:document.querySelector('.menu-form').getBoundingClientRect().width,title:document.querySelector('.menu-content').getBoundingClientRect().width}));assert(sizes.form<sizes.title*.85);
await page.screenshot({path:'/tmp/ceva-compact-menu.png'});
const run={id:'panel-'+Date.now(),name:'Panel QA',email:'panel@example.com',score:650,accuracy:90,mistakes:1,timestamp:new Date().toISOString()};
let response=await fetch(origin+'/api/leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runs:[run]})});assert(response.ok);
const publicData=await(await fetch(origin+'/api/leaderboard')).json();assert(!publicData.runs.find(row=>row.id===run.id).email);
await page.goto(origin+'/panel');await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Shared competition results'));
assert.equal(await page.locator('tbody').getByText('panel@example.com',{exact:true}).count(),1);
const download=page.waitForEvent('download');await page.locator('#export').click();const file=await download;const stream=await file.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const csv=Buffer.concat(chunks).toString('utf8');assert(csv.includes('panel@example.com')&&csv.includes('650'));
await page.locator('#delete').click();assert.equal(await page.locator('#confirmation').count(),0);await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.locator('tbody').getByText('panel@example.com',{exact:true}).count(),1);
await page.screenshot({path:'/tmp/ceva-results-panel.png'});
await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/ceva-results-panel-mobile.png'});
await page.locator('#delete').click();let backupStarted=false;const backupPromise=page.waitForEvent('download').then(file=>{backupStarted=true;return file;});await page.route('**/api/panel/delete',async route=>{await new Promise(resolve=>setTimeout(resolve,100));assert(backupStarted,'Excel download starts before the deletion request is sent');await route.continue();});await page.locator('#confirm-delete').click();const backup=await backupPromise;assert.equal(backup.suggestedFilename(),'ceva-results.xlsx');const backupStream=await backup.createReadStream();const backupChunks=[];for await(const chunk of backupStream)backupChunks.push(chunk);assert(Buffer.concat(backupChunks).toString('utf8').includes('panel@example.com'));await page.waitForFunction(()=>!document.getElementById('confirm').open&&document.getElementById('result-count').textContent==='0');assert.equal(await page.locator('tbody').getByText('panel@example.com',{exact:true}).count(),0);
response=await fetch(origin+'/api/leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runs:[run]})});assert(response.ok);const after=await(await fetch(origin+'/api/leaderboard')).json();assert(!after.runs.some(row=>row.id===run.id));assert(after.deleted.includes(run.id));
await page.goto(origin);await page.evaluate(async run=>{localStorage.setItem('christmas-logistics-leaderboard-v1',JSON.stringify({version:3,runs:[run]}));const {SqlLeaderboardStore}=await import('/storage.js?v=29');const store=new SqlLeaderboardStore();await store.sync();if(store.read().runs.some(row=>row.id===run.id))throw Error('Deleted result returned');},run);
assert.deepEqual(errors,[]);console.log('PASS: compact controls, email icon/autocomplete, /panel, private email, Excel, confirmation/cancel, automatic backup before deletion, responsive layout and no resurrection');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
