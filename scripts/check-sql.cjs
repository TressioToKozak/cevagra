const {chromium}=require('playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8002';
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
try{
const a=await browser.newPage();await a.goto(origin);
const result=await a.evaluate(async()=>{
const {SqlLeaderboardStore,LeaderboardManager}=await import('/storage.js');
const store=new SqlLeaderboardStore(),board=new LeaderboardManager(store);
board.saveRun({id:'sql-integration-'+Date.now(),name:'SQL Test',normalizedName:'sql test',score:777,accuracy:95,mistakes:1,timestamp:new Date().toISOString()});
await store.sync();await store.sync();return board.getLeaderboard().find(r=>r.name==='SQL Test').id;
});
const b=await browser.newPage();await b.goto(origin);
await b.evaluate(async id=>{const {SqlLeaderboardStore}=await import('/storage.js');const store=new SqlLeaderboardStore();await store.sync();if(store.read().runs.filter(r=>r.id===id).length!==1)throw Error('Shared SQL result missing or duplicated');},result);
await a.route('**/api/leaderboard',r=>r.abort());
await a.evaluate(async()=>{const {SqlLeaderboardStore,LeaderboardManager}=await import('/storage.js');const store=new SqlLeaderboardStore(),board=new LeaderboardManager(store);board.saveRun({id:'offline-test',name:'Offline',score:100,accuracy:50,mistakes:2});await store.sync();if(!board.getLeaderboard().some(r=>r.id==='offline-test'))throw Error('Offline save missing');});
for(const path of ['/data/leaderboard.sqlite3','/.git/config','/server.py']){const r=await fetch(origin+path);if(r.status!==404)throw Error('Private file exposed');}
const invalid=await fetch(origin+'/api/leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runs:[{id:'bad',name:'Bad',timestamp:'now',score:1001,accuracy:50,mistakes:0}]})});if(invalid.status!==400)throw Error('Invalid score accepted');
console.log('PASS: shared SQL, duplicate retries, offline local save, validation, private files');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
