const form=document.getElementById('test-login-form'),button=document.getElementById('test-sign-in'),error=document.getElementById('test-login-error');
const api=new URL('api/panel/',import.meta.url);let opening=null;
async function openTests(){if(!opening)opening=import('./game.js?v=68').then(()=>document.body.classList.remove('test-login-active')).catch(e=>{opening=null;throw e;});await opening;}
form.onsubmit=async event=>{event.preventDefault();button.disabled=true;error.textContent='';try{
 const response=await fetch(new URL('login',api),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('test-username').value,password:document.getElementById('test-password').value}),signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error(response.status===401?'Incorrect username or password.':'Server sign-in is unavailable. Contact the administrator.');
 if((await response.json()).authenticated!==true)throw Error('Server session could not be verified.');document.getElementById('test-password').value='';await openTests();
 }catch(e){error.textContent=e.message==='Failed to fetch'?'Server sign-in is unavailable. Please reconnect.':e.message;}finally{button.disabled=false;}};
button.disabled=true;
try{const response=await fetch(new URL('session',api),{cache:'no-store',signal:AbortSignal.timeout(5000)});if(response.ok&&(await response.json()).authenticated===true)await openTests();else if(response.status!==401)error.textContent='Server sign-in is unavailable. Please reconnect.';}catch{error.textContent='Server session could not be checked. Please reconnect.';}finally{button.disabled=false;}
