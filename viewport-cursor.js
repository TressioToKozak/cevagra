/** Browsers can reject CSS image cursors when their bitmap crosses a viewport edge. */
export function installViewportCursor(){
  const root=document.documentElement,overlay=document.createElement('img');
  overlay.className='edge-cursor';overlay.alt='';overlay.draggable=false;overlay.hidden=true;overlay.setAttribute('aria-hidden','true');
  if(typeof overlay.showPopover==='function')overlay.popover='manual';
  document.body.append(overlay);
  let point=null;
  const hide=()=>{root.classList.remove('edge-cursor-active');if(overlay.matches(':popover-open'))overlay.hidePopover();overlay.hidden=true;};
  const update=()=>{
    root.classList.remove('edge-cursor-active');
    if(!point||document.hidden||root.classList.contains('editing-cursor-active')){hide();return;}
    const {x,y,buttons}=point;
    if(x<0||y<0||x>=innerWidth||y>=innerHeight||x>=64&&x<innerWidth-64&&y>=64&&y<innerHeight-64){hide();return;}
    const target=document.elementFromPoint(x,y)||root;
    const cursor=getComputedStyle(target).cursor.match(/url\(["']?([^"')]+)["']?\)\s+(\d+)\s+(\d+)/);
    if(!cursor){hide();return;}
    let source=cursor[1];
    if(buttons&1&&!/unavailable|busy/.test(source))source=source.replace(/(?:pointer|clicker)(?:-hover|-click)?\.png/,match=>match.startsWith('clicker')?'clicker-click.png':'pointer-click.png');
    if(overlay.src!==source)overlay.src=source;
    overlay.style.left=`${x-Number(cursor[2])}px`;overlay.style.top=`${y-Number(cursor[3])}px`;
    if(!overlay.complete||!overlay.naturalWidth){hide();return;}
    overlay.hidden=false;
    if(overlay.popover&&!overlay.matches(':popover-open'))overlay.showPopover();
    root.classList.add('edge-cursor-active');
  };
  const move=event=>{if(event.pointerType!=='mouse'){point=null;hide();return;}point={x:event.clientX,y:event.clientY,buttons:event.buttons};update();};
  for(const type of ['pointermove','pointerdown','pointerup'])document.addEventListener(type,move,{passive:true});
  overlay.addEventListener('load',update);
  document.addEventListener('input',update);document.addEventListener('keydown',()=>{if(root.classList.contains('editing-cursor-active'))hide();});
  root.addEventListener('pointerleave',()=>{point=null;hide();});
  window.addEventListener('blur',()=>{point=null;hide();});
  window.addEventListener('resize',update);document.addEventListener('visibilitychange',()=>{if(document.hidden){point=null;hide();}});
  return overlay;
}
