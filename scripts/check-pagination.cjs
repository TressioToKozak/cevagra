const assert=require('node:assert/strict'),{chromium}=require('playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8002';
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});try{
const page=await browser.newPage({viewport:{width:1366,height:768}});
let rows=Array.from({length:23},(_,i)=>({id:`page-${i}`,name:`Player ${i+1}`,email:`p${i+1}@example.com`,score:1000-i,accuracy:100,mistakes:0,timestamp:'2026-11-11T10:00:00Z'}));
await page.route('**/api/panel/results',r=>r.fulfill({json:{runs:rows}}));
await page.route('**/api/panel/delete',async r=>{const data=r.request().postDataJSON();assert.equal(data.ids.length,23);rows=[];await r.fulfill({json:{deleted:23}});});
await page.goto(origin+'/panel');await page.waitForFunction(()=>document.getElementById('result-count').textContent==='23');
for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1366,650],[1280,720],[1280,600],[1024,576],[800,500]]){
await page.setViewportSize({width,height});
const fit=await page.evaluate(()=>{const main=document.querySelector('main').getBoundingClientRect();const nodes=[...document.querySelectorAll('tbody tr,.pagination,.card-head,.card-footer')];return {width:main.width,scroll:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth,visible:nodes.every(node=>{const r=node.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}),rows:[...document.querySelectorAll('tbody tr')].every(row=>row.getBoundingClientRect().height>=18),tableScroll:document.querySelector('.table-wrap').scrollHeight>document.querySelector('.table-wrap').clientHeight};});
assert(!fit.scroll,`${width}x${height}: no page scroll`);assert(!fit.tableScroll,`${width}x${height}: no table scroll`);assert(fit.visible&&fit.rows,`${width}x${height}: all ten rows and controls fit`);assert(fit.width>width*.9,'Panel fills the screen width');
if(width===1366&&height===650)await page.screenshot({path:'/tmp/ceva-panel-full-laptop.png'});
if(width===1920)await page.screenshot({path:'/tmp/ceva-panel-full-desktop.png'});
}
assert.equal(await page.locator('tbody tr').count(),10);assert(await page.locator('#previous-page').isDisabled());assert.equal(await page.locator('#result-range').textContent(),'1–10 of 23 results');
await page.locator('#next-page').click();assert.equal(await page.locator('tbody tr').count(),10);assert.equal(await page.locator('tbody tr').first().locator('td').first().textContent(),'Player 11');
await page.locator('#next-page').click();assert.equal(await page.locator('tbody tr').count(),3);assert(await page.locator('#next-page').isDisabled());assert.equal(await page.locator('#page-info').textContent(),'Page 3 of 3');
await page.locator('#previous-page').click();assert.equal(await page.locator('#page-info').textContent(),'Page 2 of 3');
const download=page.waitForEvent('download');await page.locator('#export').click();const stream=await(await download).createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.equal(Buffer.concat(chunks).toString('utf8').trim().split('\r\n').length,24);
await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/ceva-pagination-mobile.png'});
await page.locator('#delete').click();const backup=page.waitForEvent('download');await page.locator('#confirm-delete').click();await backup;await page.waitForFunction(()=>document.getElementById('result-count').textContent==='0');assert.equal(await page.locator('#page-info').textContent(),'Page 1 of 1');assert(await page.locator('#previous-page').isDisabled());assert(await page.locator('#next-page').isDisabled());
for(const count of [1,10,11,20]){rows=Array.from({length:count},(_,i)=>({id:String(i),name:'Player',score:100-i}));await page.reload();await page.waitForFunction(n=>document.getElementById('result-count').textContent===String(n),count);assert.equal(await page.locator('tbody tr').count(),Math.min(10,count));assert.equal(await page.locator('#next-page').isDisabled(),count<=10);}
console.log('PASS: 10-row pages, arrows, boundaries, mobile layout, full export/deletion and empty-page reset');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
