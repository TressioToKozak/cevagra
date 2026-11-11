import {LeaderboardManager, LocalLeaderboardStore} from './storage.js?v=29';
const $=id=>document.getElementById(id),local=new LeaderboardManager(new LocalLeaderboardStore());
const api=new URL('api/panel/',new URL('./',import.meta.url));
let rows=[],mode='sql';
function render(){
  $('results').replaceChildren();
  for(const run of rows){const tr=document.createElement('tr');for(const value of [run.name,run.email||'—',run.score]){const td=document.createElement('td');td.textContent=String(value??'');tr.append(td);}$('results').append(tr);}
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;td.className='empty-state';td.textContent='No completed runs yet.';tr.append(td);$('results').append(tr);}
  $('result-count').textContent=rows.length;
  $('delete').disabled=!rows.length;$('export').disabled=!rows.length;
}
async function refresh(){
  try{const response=await fetch(new URL('results',api),{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error();const data=await response.json();if(!Array.isArray(data.runs))throw Error();rows=data.runs;mode='sql';$('status').textContent=`Shared competition results · ${rows.length} ${rows.length===1?'run':'runs'}`;}
  catch{mode='local';rows=local.getLeaderboard();$('status').textContent='Showing results saved in this browser. The shared server is unavailable.';}
  rows.sort(LeaderboardManager.compareRuns);render();
}
function csvCell(value){let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
function exportCsv(snapshot=rows){const csv='\uFEFF'+[['Name','Email','Points'],...snapshot.map(run=>[run.name,run.email,run.score])].map(row=>row.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='ceva-results.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').onclick=()=>exportCsv();
$('delete').onclick=()=>{$('delete-error').textContent='';$('confirm').showModal();};
$('confirm-delete').onclick=async()=>{
  if($('confirm-delete').disabled)return;
  const snapshot=rows.map(run=>({...run}));
  $('confirm-delete').disabled=true;
  try{
    // Initiate the backup in the click handler, before the destructive request.
    exportCsv(snapshot);
    if(mode==='sql'){
      const response=await fetch(new URL('delete',api),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE',ids:snapshot.map(run=>run.id)}),signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('Results could not be deleted. Please try again.');
    }
    // Clear this browser too, so local copies cannot reappear after deletion.
    if(local.clearLeaderboard()===false&&mode==='local')throw Error('Results could not be cleared from this browser.');
    $('confirm').close();await refresh();
  }catch(error){$('delete-error').textContent=error.message;}
  finally{$('confirm-delete').disabled=false;}
};
void refresh();
