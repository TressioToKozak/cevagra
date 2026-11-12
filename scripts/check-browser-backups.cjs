const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});try{const p=await b.newPage();await p.goto(process.env.TEST_ORIGIN||'http://127.0.0.1:8033');const result=await p.evaluate(async()=>{
const {backupDate,createBrowserBackup,chooseBackupDirectory}=await import('./backup-store.js?v=43');
const rows=[{name:'Łukasz',email:'test@example.com',score:800}],now=new Date('2026-12-27T12:00:00Z');
const first=await createBrowserBackup(rows,{now}),second=await createBrowserBackup(rows,{now});
const daily=await createBrowserBackup(rows,{now,daily:true}),again=await createBrowserBackup(rows,{now,daily:true});
if(first.name!=='Leaderboard - 27.12.2026.xlsx'||second.name!=='Leaderboard - 27.12.2026 (2).xlsx'||daily.name!=='Leaderboard BackUp - 27.12.2026.xlsx'||again!==null)throw Error('Backup naming/deduplication failed');
const root=await navigator.storage.getDirectory();window.showDirectoryPicker=()=>Promise.resolve(root);await chooseBackupDirectory();const folder=await root.getDirectoryHandle('leaderboard backups');
for(const name of [first.name,second.name,daily.name]){const file=await(await folder.getFileHandle(name)).getFile();if(file.size<1000)throw Error('Archived backup missing from selected folder');}
const written=await createBrowserBackup(rows,{now});if(!written.written)throw Error('New backup was not written into selected folder');
const file=await(await folder.getFileHandle(written.name)).getFile();const bytes=new Uint8Array(await file.arrayBuffer());if(bytes[0]!==80||bytes[1]!==75)throw Error('Backup is not a workbook ZIP');
return {names:[first.name,second.name,daily.name,written.name],date:backupDate(new Date('2026-12-27T23:00:00Z'))};
});assert.equal(result.date,'28.12.2026');
await p.clock.install();await p.clock.pauseAt(new Date('2026-12-27T22:59:59Z'));
await p.evaluate(async()=>{const {startDailyBackups}=await import('./backup-store.js?v=43');window.stopBackupTest=startDailyBackups(()=>[{name:'Midnight QA',email:'midnight@example.com',score:900}]);});
await p.clock.runFor(15000);
let saved=false;for(let i=0;i<100&&!saved;i++){saved=await p.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ceva-leaderboard-backups-v1',1);r.onsuccess=()=>{const request=r.result.transaction('files').objectStore('files').get('Leaderboard BackUp - 28.12.2026.xlsx');request.onsuccess=()=>resolve(!!request.result);};}));if(!saved)await new Promise(resolve=>setTimeout(resolve,20));}
assert(saved,'Open panel automatically saves the next daily backup after midnight');await p.evaluate(()=>window.stopBackupTest());
console.log('PASS: dated names, repeated deletion backups, daily deduplication, saved folder and archive sync',result.names);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
