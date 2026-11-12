import {resultsWorkbook} from './excel.js?v=2';
const ZONE='Europe/Berlin';
export const backupDate=(date=new Date())=>new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,day:'2-digit',month:'2-digit',year:'numeric'}).format(date).replaceAll('/','.');
let database;
function open(){return database||=(new Promise((resolve,reject)=>{const request=indexedDB.open('ceva-leaderboard-backups-v1',1);request.onupgradeneeded=()=>{request.result.createObjectStore('files',{keyPath:'name'});request.result.createObjectStore('settings');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}));}
const requestResult=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
async function read(store,key){const db=await open();return requestResult(db.transaction(store).objectStore(store).get(key));}
async function write(store,value,key){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');const object=tx.objectStore(store);key===undefined?object.put(value):object.put(value,key);tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||Error('Backup could not be saved.'));});}
async function writeToFolder(file,provided){
  const handle=provided||await read('settings','directory');
  if(!handle||await handle.queryPermission({mode:'readwrite'})!=='granted')return false;
  let name=file.name,number=1;
  while(true){
    try{const existing=await(await handle.getFileHandle(name)).getFile();
      if(existing.size===file.blob.size){const a=new Uint8Array(await existing.arrayBuffer()),b=new Uint8Array(await file.blob.arrayBuffer());if(a.every((byte,index)=>byte===b[index]))return true;}
      name=file.name.replace(/\.xlsx$/,` (${++number}).xlsx`);
    }catch(error){if(error.name==='NotFoundError')break;throw error;}
  }
  const target=await handle.getFileHandle(name,{create:true}),stream=await target.createWritable();await stream.write(file.blob);await stream.close();return true;
}
async function create(rows,daily,now){
  const stem=`${daily?'Leaderboard BackUp':'Leaderboard'} - ${backupDate(now)}`;
  let name=stem+'.xlsx',number=1;
  if(daily&&await read('files',name))return null;
  while(await read('files',name))name=`${stem} (${++number}).xlsx`;
  const file={name,blob:resultsWorkbook(rows),createdAt:now.toISOString()};
  await write('files',file);
  let written=false;try{written=await writeToFolder(file);}catch{/* The durable browser copy remains available for the next folder sync. */}
  return {...file,written};
}
export function createBrowserBackup(rows,{daily=false,now=new Date()}={}){const action=()=>create(rows,daily,now);return navigator.locks?navigator.locks.request('ceva-leaderboard-backup',action):action();}
export async function chooseBackupDirectory(){
  if(!window.showDirectoryPicker)throw Error('Folder access is not supported by this browser. Backups will download normally.');
  const selected=await window.showDirectoryPicker({id:'ceva-leaderboard-backups',mode:'readwrite'});
  const handle=selected.name==='leaderboard backups'?selected:await selected.getDirectoryHandle('leaderboard backups',{create:true});
  await write('settings',handle,'directory');
  const db=await open(),files=await requestResult(db.transaction('files').objectStore('files').getAll());
  for(const file of files)await writeToFolder(file,handle);
}
export function startDailyBackups(getRows,onError=()=>{}){
  let running=false;
  const tick=async()=>{if(running)return;running=true;try{const name=`Leaderboard BackUp - ${backupDate()}.xlsx`;if(await read('files',name))return;const rows=await getRows();if(rows)await createBrowserBackup(rows,{daily:true});}catch(error){onError(error);}finally{running=false;}};
  // Local backup catches up when the panel opens and checks across midnight.
  const timer=setInterval(tick,15000);void tick();
  window.addEventListener('focus',tick);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void tick();});
  return ()=>clearInterval(timer);
}
