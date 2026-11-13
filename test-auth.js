const root=document.getElementById('app'),form=document.getElementById('test-login-form'),button=document.getElementById('test-sign-in'),error=document.getElementById('test-login-error');
const OFFLINE_SESSION='ceva-panel-offline-v1',api=new URL('api/panel/',import.meta.url),offlineStatuses=new Set([404,405,501,502,503,504]);
let opening=null;
function offlineSession(){try{return sessionStorage.getItem(OFFLINE_SESSION)==='signed-in';}catch{return false;}}
function saveOffline(active){try{active?sessionStorage.setItem(OFFLINE_SESSION,'signed-in'):sessionStorage.removeItem(OFFLINE_SESSION);}catch{}}
async function openTests(){if(!opening)opening=import('./game.js?v=61').then(()=>document.body.classList.remove('test-login-active')).catch(e=>{opening=null;throw e;});await opening;}
form.onsubmit=async event=>{
  event.preventDefault();button.disabled=true;error.textContent='';
  const username=document.getElementById('test-username').value,password=document.getElementById('test-password').value;
  try{
    let response;try{response=await fetch(new URL('login',api),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password}),signal:AbortSignal.timeout(5000)});}catch{}
    if(!response||offlineStatuses.has(response.status)){
      if(username!=='ceva'||password!=='ceva')throw Error('Incorrect username or password.');
      saveOffline(true);
    }else{
      if(!response.ok)throw Error(response.status===401?'Incorrect username or password.':'Sign in is unavailable. Please try again.');
      if((await response.json()).authenticated!==true)throw Error('Sign in is unavailable. Please try again.');saveOffline(false);
    }
    document.getElementById('test-password').value='';await openTests();
  }catch(e){error.textContent=e.message;}
  finally{button.disabled=false;}
};
button.disabled=true;
try{
  let response;try{response=await fetch(new URL('session',api),{cache:'no-store',signal:AbortSignal.timeout(5000)});}catch{}
  if(response?.ok){if((await response.json()).authenticated===true)await openTests();}
  else if((!response||offlineStatuses.has(response.status))&&offlineSession())await openTests();
}catch{error.textContent='Session could not be checked. Please sign in.';}
finally{button.disabled=false;}
