const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{startBackend}=require('./backend-fixture.cjs');
const fallback=require('node:fs').readFileSync(require('node:path').join(__dirname,'../route-fallback.js'),'utf8');
for(const path of ['/d12','/random-route','/api/private','/assets/missing.png','/.git/config']){let target=null;require('node:vm').runInNewContext(fallback,{window:{location:{pathname:path,replace:value=>target=value}}});assert.equal(target,['/d12','/random-route'].includes(path)?'/':null);}
{let target=null;require('node:vm').runInNewContext(fallback,{URL,document:{currentScript:{src:'https://example.com/cevagra/route-fallback.js'}},window:{location:{pathname:'/cevagra/d12',replace:value=>target=value}}});assert.equal(target,'/cevagra/');}
const query=(db,sql)=>JSON.parse(execFileSync('python3',['-c','import sqlite3,json,sys; d=sqlite3.connect(sys.argv[1]); print(json.dumps(d.execute(sys.argv[2]).fetchall()))',db,sql],{encoding:'utf8'}));
const ageStage=(db,id,seconds)=>execFileSync('python3',['-c',"import sqlite3,json,sys,time; d=sqlite3.connect(sys.argv[1]); r=json.loads(d.execute('SELECT state FROM game_sessions WHERE id=?',(sys.argv[2],)).fetchone()[0]); r['started']=time.time()-float(sys.argv[3]); d.execute('UPDATE game_sessions SET state=? WHERE id=?',(json.dumps(r),sys.argv[2])); d.commit()",db,id,String(seconds)]);
(async()=>{const f=await startBackend(),unconfigured=await startBackend({unconfigured:true,secure:true}),secure=await startBackend({secure:true});try{
 const post=(route,data,cookie='',extra={})=>fetch(f.origin+route,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...extra},body:JSON.stringify(data)});
 const login=await post('/api/panel/login',{username:f.username,password:f.password});assert.equal(login.status,200);const admin=login.headers.get('set-cookie').split(';')[0];
 for(const path of ['/','/panel','/test','/assets/ceva-icon.svg','/missing.css']){const r=await fetch(f.origin+path);assert(r.headers.get('content-security-policy').includes("script-src 'self'"));assert(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));assert.equal(r.headers.get('x-content-type-options'),'nosniff');}
 const redirect=await fetch(f.origin+'/d12',{redirect:'manual'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/');assert.equal((await fetch(f.origin+'/d12')).status,200);
 for(const path of ['/server.py','/game_sessions.py','/game-verifier.mjs','/.git/config','/data/db.sqlite3','/work/private'])assert.equal((await fetch(f.origin+path)).status,404,path);
 assert.equal((await post('/api/leaderboard',{runs:[{id:'forged',score:1000}]})).status,410);
 assert.equal((await post('/api/panel/delete',{confirmation:'DELETE',ids:[]})).status,401);
 assert.equal((await post('/api/session',{},'',{Origin:'https://attacker.invalid'})).status,403);
 const noPassword=await fetch(unconfigured.origin+'/api/panel/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'ceva',password:'ceva'})});assert.equal(noPassword.status,503);
 for(const proto of ['http','https']){const r=await fetch(secure.origin+'/api/panel/login',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-Proto':proto},body:JSON.stringify({username:secure.username,password:secure.password})});assert.equal(r.status,200);assert(r.headers.get('set-cookie').includes('; Secure'));assert(r.headers.get('set-cookie').includes('HttpOnly; SameSite=Strict'));assert(r.headers.get('strict-transport-security').includes('31536000'));}
 const session=await post('/api/session',{});assert.equal(session.status,200);const cookie=session.headers.get('set-cookie').split(';')[0];assert.deepEqual(await session.json(),{session:true});
 assert.equal((await post('/api/session',{id:'chosen-by-client'},cookie)).status,400);
 for(const value of [-1,1,31536000000])assert.equal((await post('/api/statistics',{id:'forged',playMs:value},cookie)).status,400);
 const initialVisits=query(f.db,'SELECT COUNT(*) FROM statistics_visits')[0][0];await post('/api/session',{},cookie);assert.equal(query(f.db,'SELECT COUNT(*) FROM statistics_visits')[0][0],initialVisits,'Session retries cannot create visits');
 const game=await (await post('/api/game/start',{name:'Verified QA',email:'verified@example.com'},cookie)).json();assert.equal(game.configs.length,9);assert.equal((await post('/api/game/finish',{gameId:game.id},cookie)).status,409);
 const other=await post('/api/session',{}),otherCookie=other.headers.get('set-cookie').split(';')[0];assert.equal((await post('/api/game/stage',{gameId:game.id,id:game.configs[0].id},otherCookie)).status,401);
 assert.equal((await post('/api/game/stage',{gameId:game.id,id:'wrong-stage'},cookie)).status,409);
 for(let i=0;i<game.configs.length;i++){
  const config=game.configs[i],stage=await (await post('/api/game/stage',{gameId:game.id,id:config.id},cookie)).json();assert(stage.nonce);
  if(i===0){assert.equal((await post('/api/game/end',{gameId:game.id,nonce:stage.nonce},cookie)).status,400,'Cannot instantly submit an unfinished stage');
   assert.equal((await post('/api/game/events',{gameId:game.id,nonce:stage.nonce,seq:1,events:[{type:'wrap',at:999999,dt:.05,y:0,holding:true}]},cookie)).status,400,'Client clock cannot fast-forward server time');
   assert.equal((await post('/api/game/events',{gameId:game.id,nonce:stage.nonce,seq:1,events:[{type:'submit',at:0,score:1000}]},cookie)).status,400,'Result fields cannot be smuggled into events');
  }
  ageStage(f.db,game.id,config.time+.02);const r=await post('/api/game/end',{gameId:game.id,nonce:stage.nonce},cookie);assert.equal(r.status,200,await r.clone().text());const graded=await r.json();assert.equal(graded.result.score,0,'Server computes zero for no correct actions');assert.equal((await post('/api/game/end',{gameId:game.id,nonce:stage.nonce},cookie)).status,409,'Stage receipts cannot be replayed');
 }
 assert.equal((await post('/api/game/finish',{gameId:game.id,score:1000},cookie)).status,400);
 const finish=await post('/api/game/finish',{gameId:game.id},cookie);assert.equal(finish.status,200);const run=(await finish.json()).run;assert.equal(run.score,0);assert.equal(run.verification,'server-v1');assert.equal(run.id,game.id);
 const again=(await (await post('/api/game/finish',{gameId:game.id},cookie)).json()).run;assert.equal(again.id,run.id);assert.equal(query(f.db,'SELECT COUNT(*) FROM runs')[0][0],1,'Final submission is idempotent');
 const board=await (await fetch(f.origin+'/api/leaderboard')).json();assert.equal(board.runs.length,1);assert(!('email'in board.runs[0]));assert(!('runSeed'in board.runs[0]));
 const stats=await (await fetch(f.origin+'/api/panel/results',{headers:{Cookie:admin}})).json();assert.equal(stats.statistics.games,1);
 await post('/api/panel/delete',{confirmation:'DELETE',ids:[game.id]},admin);assert.equal((await post('/api/game/finish',{gameId:game.id},cookie)).status,410,'Deleted results cannot be resurrected');
 assert.equal(query(f.db,'SELECT COUNT(*) FROM statistics_runs')[0][0],1,'Administrative deletion preserves historical statistics');
 for(let i=0;i<8;i++)await post('/api/panel/login',{username:'wrong',password:'wrong'},'',{'X-Forwarded-For':`10.0.0.${i}`});assert.equal((await post('/api/panel/login',{username:f.username,password:f.password},'',{'X-Forwarded-For':'192.0.2.9'})).status,429,'Spoofed forwarding headers cannot bypass login throttling');
 console.log('PASS: fail-closed auth, fixed Secure cookies, CSP/HSTS/nosniff, routing, server sessions, forgery/cross-session/replay/time checks, authoritative scoring, deduplication and rate limits');
}finally{await Promise.all([f.close(),unconfigured.close(),secure.close()]);}})().catch(e=>{console.error(e);process.exitCode=1;});
