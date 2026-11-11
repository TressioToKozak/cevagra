const assert=require('node:assert/strict'),{chromium}=require('playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8002';
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});try{
for(const path of ['/api/panel/session','/api/panel/results'])assert.equal((await fetch(origin+path)).status,401);
assert.equal((await fetch(origin+'/api/panel/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE',ids:[]})})).status,401);
const page=await browser.newPage({viewport:{width:1366,height:650}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/panel');assert(await page.locator('#login-screen').isVisible());assert(await page.locator('#panel-screen').isHidden());assert.equal(await page.getByText('Register',{exact:true}).count(),0);
await page.locator('#username').fill('ceva');await page.locator('#password').fill('wrong');await page.locator('#login-form').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>document.getElementById('login-error').textContent.includes('Incorrect'));assert(await page.locator('#panel-screen').isHidden());
await page.locator('#password').fill('ceva');await page.locator('#login-form').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>!document.getElementById('panel-screen').hidden);assert.equal(await page.locator('#password').inputValue(),'');
const cookies=await page.context().cookies(origin+'/api/panel/results'),session=cookies.find(c=>c.name==='ceva_panel_session');assert(session&&session.httpOnly&&session.sameSite==='Strict');const cookie=`ceva_panel_session=${session.value}`;
assert.equal((await fetch(origin+'/api/panel/results',{headers:{Cookie:cookie}})).status,200);
await page.reload();await page.waitForFunction(()=>!document.getElementById('panel-screen').hidden);
await page.locator('#logout').click();await page.waitForFunction(()=>document.getElementById('panel-screen').hidden);assert.equal(await page.locator('tbody tr').count(),0);
assert.equal((await fetch(origin+'/api/panel/results',{headers:{Cookie:cookie}})).status,401);assert.equal((await fetch(origin+'/api/panel/session',{headers:{Cookie:'ceva_panel_session=forged'}})).status,401);
await page.screenshot({path:'/tmp/ceva-panel-login.png'});assert.deepEqual(errors,[]);console.log('PASS: login, invalid password, HttpOnly session, reload, sign-out, revoked/forged cookies, protected read/delete API and no registration');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
