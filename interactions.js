/**
 * Lightweight pointer drag controller shared by warehouse interactions.
 * It never changes the source DOM tree and batches visual work to one frame.
 */
export function attachPointerDrag({
  element,
  targets,
  container=document.body,
  canInteract=()=>true,
  onStart=()=>{},
  onMove=()=>{},
  onDrop=()=>{},
  onCancel=()=>{},
  hitPadding=10,
  createGhost=null,
  activationDistance=0,
  trackPosition=false,
  cancelOnResize=false,
}) {
  let state=null;
  let frame=0;
  let destroyed=false;
  const targetList=()=>[...(typeof targets==="function"?targets():targets||[])];
  const clearTargets=()=>targetList().forEach(target=>target.classList.remove("drop-ready","drag-over"));
  const hitTarget=(x,y)=>{
    let nearest=null,nearestDistance=Infinity;
    for(const {target,rect} of state?.targetRects||[]){
      if(x<rect.left-hitPadding||x>rect.right+hitPadding||y<rect.top-hitPadding||y>rect.bottom+hitPadding)continue;
      const distance=(x-rect.centerX)**2+(y-rect.centerY)**2;
      if(distance<nearestDistance){nearest=target;nearestDistance=distance;}
    }
    return nearest;
  };
  const paint=()=>{
    frame=0;
    if(!state?.ghost||!canInteract())return;
    const target=hitTarget(state.x,state.y);
    const changed=target!==state.target;
    if(changed){state.target?.classList.remove("drag-over");target?.classList.add("drag-over");state.target=target;}
    if(changed||trackPosition)onMove({...state,target});
  };
  const move=event=>{
    if(!state||event.pointerId!==state.id)return;
    event.preventDefault();
    if(!canInteract())return finish(event,true);
    state.x=event.clientX;state.y=event.clientY;
    state.moved ||= !!state.ghost&&Math.hypot(state.x-state.startX,state.y-state.startY)>4;
    if(!state.ghost){if(Math.hypot(state.x-state.startX,state.y-state.startY)<activationDistance)return;begin();state.moved=true;}
    // Cursor-following is deliberately synchronous; only hit testing is frame-batched.
    state.ghost.style.transform=`translate3d(${state.x-state.startX}px,${state.y-state.startY}px,0)`;
    if(!frame)frame=requestAnimationFrame(paint);
  };
  const finish=(event,cancelled=false)=>{
    if(!state||event.pointerId!==state.id)return;
    cancelled ||= !canInteract();
    event.preventDefault();
    state.x=event.clientX;state.y=event.clientY;
    if(!cancelled&&!state.ghost&&Math.hypot(state.x-state.startX,state.y-state.startY)>=activationDistance){begin();state.moved=true;}
    if(state.ghost)state.ghost.style.transform=`translate3d(${state.x-state.startX}px,${state.y-state.startY}px,0)`;
    // Resolve the release position even when the last visual frame has already run.
    state.moved ||= !!state.ghost&&Math.hypot(state.x-state.startX,state.y-state.startY)>4;
    if(frame){cancelAnimationFrame(frame);frame=0;}
    if(!cancelled)paint();
    const completed=state;
    state=null;
    if(completed.moved){element.dataset.dragged="true";setTimeout(()=>delete element.dataset.dragged,0);}
    clearTargets();
    element.classList.remove("drag-source");
    globalThis.document?.documentElement?.classList.remove("is-pointer-dragging");
    try{element.releasePointerCapture?.(event.pointerId);}catch{}
    if(cancelled||completed.ghost)(cancelled?onCancel:onDrop)({...completed,target:completed.target,x:event.clientX,y:event.clientY});
    completed.ghost?.remove();
  };
  const begin=()=>{
    const {rect,downEvent:event}=state;
    const customGhost=createGhost?.({element,rect,event});
    const ghost=customGhost?.node||customGhost||element.cloneNode(true);
    const ghostRect=customGhost?.rect||rect;
    ghost.removeAttribute("id");
    ghost.classList.add("drag-ghost");
    Object.assign(ghost.style,{position:"fixed",left:`${ghostRect.left}px`,top:`${ghostRect.top}px`,width:`${ghostRect.width}px`,height:`${ghostRect.height}px`,margin:"0"});
    container.append(ghost);
    const targetRects=targetList().map(target=>{const rect=target.getBoundingClientRect();return {target,rect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,centerX:rect.left+rect.width/2,centerY:rect.top+rect.height/2}};});
    Object.assign(state,{ghost,targetRects});
    element.classList.add("drag-source");
    globalThis.document?.documentElement?.classList.add("is-pointer-dragging");
    targetList().forEach(target=>target.classList.add("drop-ready"));
    onStart({...state});
  };
  const down=event=>{
    if(destroyed||state||event.button!==0||!canInteract())return;
    event.preventDefault();
    state={id:event.pointerId,ghost:null,target:null,targetRects:[],rect:element.getBoundingClientRect(),downEvent:event,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,moved:false};
    element.setPointerCapture?.(event.pointerId);
    if(!activationDistance)begin();
  };
  const cancel=event=>finish(event,true);
  const lost=event=>{if(state)finish(event,true);};
  element.addEventListener("pointerdown",down);
  element.addEventListener("pointermove",move);
  element.addEventListener("pointerup",finish);
  element.addEventListener("pointercancel",cancel);
  element.addEventListener("lostpointercapture",lost);
  const abort=()=>{if(state)finish({pointerId:state.id,clientX:state.x,clientY:state.y,preventDefault(){}},true);};
  if(cancelOnResize)globalThis.addEventListener?.("resize",abort,{passive:true});
  const cleanup=()=>{
    destroyed=true;
    if(frame)cancelAnimationFrame(frame);
    state?.ghost?.remove();
    clearTargets();
    element.classList.remove("drag-source");
    globalThis.document?.documentElement?.classList.remove("is-pointer-dragging");
    state=null;
    element.removeEventListener("pointerdown",down);
    element.removeEventListener("pointermove",move);
    element.removeEventListener("pointerup",finish);
    element.removeEventListener("pointercancel",cancel);
    element.removeEventListener("lostpointercapture",lost);
    if(cancelOnResize)globalThis.removeEventListener?.("resize",abort);
  };
  cleanup.cancel=abort;
  return cleanup;
}
