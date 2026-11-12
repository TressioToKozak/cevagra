import {localStatistics} from './analytics.js?v=47';
import {backupDate,createBrowserBackup,chooseBackupDirectory,startDailyBackups} from './backup-store.js?v=43';
import {resultsWorkbook} from './excel.js?v=2';
import {LeaderboardManager, LocalLeaderboardStore} from './storage.js?v=29';
const $=id=>document.getElementById(id),local=new LeaderboardManager(new LocalLeaderboardStore());
const api=new URL('api/panel/',new URL('./',import.meta.url));
const PAGE_SIZE=10;
let rows=[],mode='sql',page=0,statistics=null;
const number=new Intl.NumberFormat('en-GB');
function renderStatistics(){
  const stats=mode==='local'?localStatistics(rows):statistics;
  $('stat-visits').textContent=stats?number.format(stats.visits):'—';
  $('stat-games').textContent=stats?number.format(stats.games):'—';
  const seconds=Math.floor((stats?.playMs||0)/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
  $('stat-time').textContent=stats?`${hours}h ${minutes}m ${seconds%60}s`:'—';
  $('stat-player').textContent=stats?.topPlayer?.name||'No games yet';
  $('stat-player-detail').textContent=stats?.topPlayer?`${number.format(stats.topPlayer.count)} completed ${stats.topPlayer.count===1?'game':'games'}${stats.topPlayer.email?' · '+stats.topPlayer.email:''}`:'Complete a game to appear here';
  $('statistics-note').textContent=stats?`${mode==='local'?'This browser only · ':''}Visits and active play time tracked since ${new Date(stats.since).toLocaleDateString('en-GB')}. Games = completed competitions. Totals survive result deletion.`:'Statistics unavailable.';
}

const OFFLINE_SESSION='ceva-panel-offline-v1';
let offlineSignedIn=false;
try{offlineSignedIn=sessionStorage.getItem(OFFLINE_SESSION)==='signed-in';}catch{}
function localSession(active){offlineSignedIn=active;try{active?sessionStorage.setItem(OFFLINE_SESSION,'signed-in'):sessionStorage.removeItem(OFFLINE_SESSION);}catch{}}
function showLocalResults(){if(!offlineSignedIn){showLogin();return;}mode='local';rows=local.getLeaderboard();$('status').textContent='Offline mode · Results saved in this browser';$('login-screen').hidden=true;$('panel-screen').hidden=false;render();}

function showLogin(message=''){rows=[];page=0;$('results').replaceChildren();$('result-count').textContent='0';$('confirm').close();$('panel-screen').hidden=true;$('login-screen').hidden=false;$('login-error').textContent=message;}
function render(){
  renderStatistics();
  const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
  page=Math.max(0,Math.min(page,pages-1));
  const start=page*PAGE_SIZE;
  $('page-info').textContent=`Page ${page+1} of ${pages}`;
  $('result-range').textContent=rows.length?`${start+1}–${Math.min(start+PAGE_SIZE,rows.length)} of ${rows.length} results`:'0 results';
  $('previous-page').disabled=page===0;
  $('next-page').disabled=page===pages-1;
  $('results').replaceChildren();
  for(const run of rows.slice(start,start+PAGE_SIZE)){const tr=document.createElement('tr');for(const value of [run.name,run.email||'—',run.score]){const td=document.createElement('td');td.textContent=String(value??'');tr.append(td);}$('results').append(tr);}
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;td.className='empty-state';td.textContent='No completed runs yet.';tr.append(td);$('results').append(tr);}
  $('backup-folder').hidden=mode!=='sql'||['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  $('result-count').textContent=rows.length;
  $('delete').disabled=!rows.length;$('export').disabled=!rows.length;
}
async function refresh(){
  try{const response=await fetch(new URL('results',api),{cache:'no-store',signal:AbortSignal.timeout(5000)});if(response.status===401){showLogin();return;}if(!response.ok)throw Error();const data=await response.json();if(!Array.isArray(data.runs))throw Error();rows=data.runs;statistics=data.statistics||null;mode='sql';$('status').textContent=`Shared competition results · ${rows.length} ${rows.length===1?'run':'runs'}`;}
  catch{showLocalResults();return;}
  $('login-screen').hidden=true;$('panel-screen').hidden=false;rows.sort(LeaderboardManager.compareRuns);render();
}
function exportExcel(snapshot=rows,name=`Leaderboard - ${backupDate()}.xlsx`,blob=resultsWorkbook(snapshot)){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('refresh-statistics').onclick=()=>void refresh();
$('export').onclick=()=>exportExcel();
$('backup-folder').onclick=async()=>{try{await chooseBackupDirectory();$('status').textContent='Backup folder: leaderboard backups.';}catch(error){if(error.name!=='AbortError')$('status').textContent=error.message;}};
$('delete').onclick=()=>{$('delete-error').textContent='';$('confirm').showModal();};
$('confirm-delete').onclick=async()=>{
  if($('confirm-delete').disabled)return;
  const snapshot=rows.map(run=>({...run}));
  $('confirm-delete').disabled=true;
  try{
    // Initiate the backup in the click handler, before the destructive request.
    const backup=await createBrowserBackup(snapshot);
    if(!backup.written)exportExcel(snapshot,backup.name,backup.blob);
    if(mode==='sql'){
      const response=await fetch(new URL('delete',api),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE',ids:snapshot.map(run=>run.id)}),signal:AbortSignal.timeout(10000)});
      if(response.status===401){showLogin('Your session has expired. Please sign in again.');return;}if(!response.ok)throw Error('Results could not be deleted. Please try again.');
    }
    // Remove only the backed-up IDs; a run saved by another tab must survive.
    const data=local.store.read(),deletedIds=new Set(snapshot.map(run=>run.id));
    const kept=data.runs.filter(run=>!deletedIds.has(run.id));
    const cleared=!local.store.error&&(kept.length===data.runs.length||local.store.write({...data,runs:kept})!==false);
    if(!cleared&&mode==='local')throw Error('Results could not be cleared from this browser.');
    $('confirm').close();await refresh();
  }catch(error){$('delete-error').textContent=error.message;}
  finally{$('confirm-delete').disabled=false;}
};
$('previous-page').onclick=()=>{page--;render();};
$('next-page').onclick=()=>{page++;render();};
$('login-form').onsubmit=async event=>{
  event.preventDefault();$('sign-in').disabled=true;$('login-error').textContent='';
  const username=$('username').value,password=$('password').value;
  try{
    let response;
    try{response=await fetch(new URL('login',api),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password}),signal:AbortSignal.timeout(5000)});}catch{}
    if(!response||[404,405,501,502,503,504].includes(response.status)){
      if(username!=='ceva'||password!=='ceva')throw Error('Incorrect username or password.');
      localSession(true);$('password').value='';showLocalResults();
    }else{
      if(!response.ok)throw Error(response.status===401?'Incorrect username or password.':'Sign in is unavailable. Please try again.');
      localSession(false);$('password').value='';await refresh();
    }
  }catch(error){showLogin(error.message);}
  finally{$('sign-in').disabled=false;}
};
$('logout').onclick=async()=>{
  if(mode==='local'){localSession(false);showLogin();return;}
  try{const response=await fetch(new URL('logout',api),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});if(!response.ok&&response.status!==401)throw Error();showLogin();}
  catch{$('status').textContent='Sign out failed. Please try again.';}
};
void refresh();

startDailyBackups(async()=>{if($('panel-screen').hidden)return null;if(mode==='sql')await refresh();return $('panel-screen').hidden?null:rows;},()=>{$('status').textContent='Automatic backup failed. Check folder access.';});
