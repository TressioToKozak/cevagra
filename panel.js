import {LeaderboardManager, LocalLeaderboardStore} from './storage.js?v=29';
const $=id=>document.getElementById(id),local=new LeaderboardManager(new LocalLeaderboardStore());
const api=new URL('api/panel/',new URL('./',import.meta.url));
let rows=[],mode='sql';
function render(){
  $('results').replaceChildren();
  for(const run of rows){const tr=document.createElement('tr');for(const value of [run.name,run.email||'—',run.score]){const td=document.createElement('td');td.textContent=String(value??'');tr.append(td);}$('results').append(tr);}
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;td.textContent='Brak wyników';tr.append(td);$('results').append(tr);}
  $('delete').disabled=!rows.length;$('export').disabled=!rows.length;
}
async function refresh(){
  try{const response=await fetch(new URL('results',api),{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error();const data=await response.json();if(!Array.isArray(data.runs))throw Error();rows=data.runs;mode='sql';$('status').textContent=`Wyniki w bazie SQL: ${rows.length}`;}
  catch{mode='local';rows=local.getLeaderboard();$('status').textContent='Serwer SQL niedostępny. Wyświetlono wyniki lokalne tej przeglądarki.';}
  rows.sort(LeaderboardManager.compareRuns);render();
}
function csvCell(value){let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
$('export').onclick=()=>{const csv='\uFEFF'+[['Imię','Mail','Punkty'],...rows.map(run=>[run.name,run.email,run.score])].map(row=>row.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='ceva-wyniki.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('delete').onclick=()=>{$('confirmation').value='';$('confirm-delete').disabled=true;$('delete-error').textContent='';$('confirm').showModal();};
$('confirmation').oninput=()=>{$('confirm-delete').disabled=$('confirmation').value!=='USUŃ';};
$('confirm-delete').onclick=async()=>{
  if($('confirmation').value!=='USUŃ')return;
  $('confirm-delete').disabled=true;
  try{
    if(mode==='sql'){
      const response=await fetch(new URL('delete',api),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE',ids:rows.map(run=>run.id)}),signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('Nie udało się usunąć wyników z SQL. Spróbuj ponownie.');
    }
    // Clear this browser too, so local copies cannot reappear after deletion.
    if(local.clearLeaderboard()===false&&mode==='local')throw Error('Nie udało się wyczyścić zapisu lokalnego.');
    $('confirm').close();await refresh();
  }catch(error){$('delete-error').textContent=error.message;}
  finally{$('confirm-delete').disabled=false;}
};
void refresh();
