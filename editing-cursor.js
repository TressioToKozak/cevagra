/** Native CSS cannot prevent OS pointer hiding while typing. Only editing uses this fallback. */
export function installEditingCursor(){
  const overlay=document.createElement('img');overlay.className='editing-cursor';overlay.alt='';overlay.draggable=false;overlay.setAttribute('aria-hidden','true');overlay.hidden=true;overlay.src='assets/cursor/clicker-hover.png';
  let point=null,editing=null;
  const field=node=>node?.matches?.('#app input:not([type=checkbox]):not([type=radio]),#modal input, #app textarea,#modal textarea,[contenteditable="true"]');
  const hide=()=>{overlay.hidden=true;document.documentElement.classList.remove('editing-cursor-active');};
  const paint=()=>{if(editing&&(!editing.isConnected||document.activeElement!==editing)){hide();return false;}if(!point||point.x<0||point.y<0||point.x>=innerWidth||point.y>=innerHeight){hide();return false;}overlay.style.left=`${point.x-18}px`;overlay.style.top=`${point.y-5}px`;return true;};
  const show=()=>{if(!point||!editing||!editing.isConnected||document.activeElement!==editing||document.hidden||!document.hasFocus()||!overlay.complete||!overlay.naturalWidth)return;const host=editing.closest('dialog[open]')||document.body;if(overlay.parentElement!==host)host.append(overlay);if(!paint())return;overlay.hidden=false;document.documentElement.classList.add('editing-cursor-active');};
  document.addEventListener('pointermove',event=>{if(event.pointerType!=='mouse')return;point={x:event.clientX,y:event.clientY};if(!overlay.hidden)paint();},{passive:true});
  overlay.addEventListener('load',()=>{if(editing)show();});
  document.addEventListener('input',event=>{if(field(event.target)){editing=event.target;show();}});
  document.addEventListener('keydown',event=>{if(field(document.activeElement)&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&(event.key.length===1||['Backspace','Delete','Enter'].includes(event.key))){editing=document.activeElement;show();}});
  document.addEventListener('submit',hide,true);document.addEventListener('close',hide,true);
  document.addEventListener('focusout',()=>{editing=null;hide();});
  document.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'){point=null;hide();return;}point={x:event.clientX,y:event.clientY};if(!field(event.target)){hide();return;}if(!overlay.hidden)overlay.src='assets/cursor/clicker-click.png';},{passive:true});
  document.addEventListener('pointerup',()=>{if(!overlay.hidden)overlay.src='assets/cursor/clicker-hover.png';},{passive:true});
  document.documentElement.addEventListener('pointerleave',()=>{point=null;hide();});
  window.addEventListener('resize',()=>{if(!overlay.hidden)paint();});
  window.addEventListener('blur',()=>{point=null;hide();});document.addEventListener('visibilitychange',()=>{if(document.hidden){point=null;hide();}});
  return overlay;
}
