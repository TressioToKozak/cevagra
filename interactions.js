/**
 * Lightweight pointer drag controller shared by warehouse interactions.
 * It never changes the source DOM tree and batches visual work to one frame.
 */
export function attachPointerDrag({
  element,
  targets,
  container=document.body,
  onStart=()=>{},
  onMove=()=>{},
  onDrop=()=>{},
  onCancel=()=>{},
  hitPadding=10,
}) {
  let state=null;
  let frame=0;
  let destroyed=false;
  const targetList=()=>[...(typeof targets==="function"?targets():targets||[])];
  const clearTargets=()=>targetList().forEach(target=>target.classList.remove("drop-ready","drag-over"));
  const hitTarget=(x,y)=>{
    const matches=targetList().filter(target=>{
      const rect=target.getBoundingClientRect();
      return x>=rect.left-hitPadding&&x<=rect.right+hitPadding&&y>=rect.top-hitPadding&&y<=rect.bottom+hitPadding;
    });
    return matches.sort((a,b)=>{
      const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
      return Math.hypot(x-(ar.left+ar.width/2),y-(ar.top+ar.height/2))-Math.hypot(x-(br.left+br.width/2),y-(br.top+br.height/2));
    })[0]||null;
  };
  const paint=()=>{
    frame=0;
    if(!state)return;
    state.ghost.style.transform=`translate3d(${state.x-state.startX}px,${state.y-state.startY}px,0)`;
    const target=hitTarget(state.x,state.y);
    if(target!==state.target){state.target?.classList.remove("drag-over");target?.classList.add("drag-over");state.target=target;}
    onMove({...state,target});
  };
  const move=event=>{
    if(!state||event.pointerId!==state.id)return;
    event.preventDefault();
    state.x=event.clientX;state.y=event.clientY;
    state.moved ||= Math.hypot(state.x-state.startX,state.y-state.startY)>4;
    if(!frame)frame=requestAnimationFrame(paint);
  };
  const finish=(event,cancelled=false)=>{
    if(!state||event.pointerId!==state.id)return;
    event.preventDefault();
    if(frame){cancelAnimationFrame(frame);frame=0;paint();}
    const completed=state;
    state=null;
    if(completed.moved){element.dataset.dragged="true";setTimeout(()=>delete element.dataset.dragged,0);}
    clearTargets();
    element.classList.remove("drag-source");
    try{element.releasePointerCapture?.(event.pointerId);}catch{}
    (cancelled?onCancel:onDrop)({...completed,target:completed.target,x:event.clientX,y:event.clientY});
    completed.ghost.remove();
  };
  const down=event=>{
    if(destroyed||state||event.button!==0)return;
    event.preventDefault();
    const rect=element.getBoundingClientRect();
    const ghost=element.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.classList.add("drag-ghost","dragging");
    Object.assign(ghost.style,{position:"fixed",left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,margin:"0"});
    container.append(ghost);
    state={id:event.pointerId,ghost,target:null,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,moved:false};
    element.classList.add("drag-source");
    targetList().forEach(target=>target.classList.add("drop-ready"));
    element.setPointerCapture?.(event.pointerId);
    onStart({...state});
  };
  const cancel=event=>finish(event,true);
  const lost=event=>{if(state)finish(event,true);};
  element.addEventListener("pointerdown",down);
  element.addEventListener("pointermove",move);
  element.addEventListener("pointerup",finish);
  element.addEventListener("pointercancel",cancel);
  element.addEventListener("lostpointercapture",lost);
  return ()=>{
    destroyed=true;
    if(frame)cancelAnimationFrame(frame);
    state?.ghost.remove();
    clearTargets();
    element.classList.remove("drag-source");
    state=null;
    element.removeEventListener("pointerdown",down);
    element.removeEventListener("pointermove",move);
    element.removeEventListener("pointerup",finish);
    element.removeEventListener("pointercancel",cancel);
    element.removeEventListener("lostpointercapture",lost);
  };
}
