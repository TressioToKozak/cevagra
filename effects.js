const reduced=()=>globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches??false;

export class ArcadeEffects {
  constructor(root){
    this.root=root;
    this.host=root?.closest?.(".competition-shell")||root;
    this.layer=document.createElement("div");
    this.layer.className="arcade-effect-layer";
    this.layer.setAttribute("aria-live","assertive");
    this.host?.append(this.layer);
    this.timers=new Set();
    this.cancelFlights=()=>this.nodes.forEach(node=>{if(node.classList.contains("parcel-exit")){node.getAnimations().forEach(a=>a.cancel());node.remove();this.nodes.delete(node);}});globalThis.addEventListener?.("resize",this.cancelFlights,{passive:true});
    this.shaking=false;this.animations=new Set();this.nodes=new Set();this.pulses=new Map();
  }
  later(callback,delay){const id=setTimeout(()=>{this.timers.delete(id);callback();},delay);this.timers.add(id);return id;}
  animate(node,frames,duration=200){
    if(reduced()||!node?.animate)return null;
    const animation=node.animate(frames,{duration,easing:"cubic-bezier(.2,.7,.2,1)",fill:"forwards"});if(document.timeline?.currentTime!=null)animation.startTime=document.timeline.currentTime;this.animations.add(animation);
    animation.finished.then(()=>this.animations.delete(animation),()=>this.animations.delete(animation));return animation;
  }
  pulse(node,className="inspection-pulse",duration=220){
    if(!node)return;
    const key=this.pulses.get(node);if(key){clearTimeout(key.timer);this.timers.delete(key.timer);node.classList.remove(key.className);}
    if(className==="scan-pulse")node.style.setProperty("--scan-distance",`${node.clientHeight}px`);node.classList.add(className);
    // Restart an existing decorative CSS animation without moving the actual control.
    node.getAnimations?.().forEach(a=>{if(a.animationName==="terminalScan")a.currentTime=0;});
    const timer=this.later(()=>{node.classList.remove(className);this.pulses.delete(node);},duration);this.pulses.set(node,{timer,className});
  }
  transfer(source,target){
    if(reduced()||!source||!target)return;
    const r=source.getBoundingClientRect(),t=(target.querySelector(".chute-art")||target).getBoundingClientRect(),clone=source.cloneNode(true);
    clone.removeAttribute("id");clone.removeAttribute("data-moving-box");clone.classList.remove("drag-ghost","drag-source","delivered","misrouted");clone.classList.add("parcel-exit");clone.setAttribute("aria-hidden","true");
    Object.assign(clone.style,{position:"fixed",left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`,transform:"none",opacity:"1",pointerEvents:"none",margin:"0",zIndex:"70"});
    this.layer.append(clone);this.nodes.add(clone);
    const animation=this.animate(clone,[{transform:"translate(0,0) scale(1)",opacity:1},{transform:`translate(${t.left+t.width/2-r.left-r.width/2}px,${t.top+t.height/2-r.top-r.height/2}px) scale(.22)`,opacity:0}],220);
    const remove=()=>{clone.remove();this.nodes.delete(clone);};if(animation)animation.finished.then(remove,remove);else remove();
  }
  acknowledge(text,tone="neutral"){
    if(!this.layer)return;const stamp=document.createElement("div");stamp.className=`authorization-stamp ${tone}`;stamp.textContent=text;this.layer.replaceChildren(stamp);this.nodes.add(stamp);this.later(()=>{stamp.remove();this.nodes.delete(stamp);},650);
  }
  feedback(kind,text,anchor=this.root){
    if(!anchor||!this.layer)return;
    const success=kind==="success";
    anchor.classList.remove("feedback-correct","feedback-wrong");
    void anchor.offsetWidth;
    anchor.classList.add(success?"feedback-correct":"feedback-wrong");
    this.layer.replaceChildren();
    const badge=document.createElement("div");
    badge.className=`action-badge ${success?"success":"error"}`;
    badge.innerHTML=`<i aria-hidden="true">${success?"✓":"×"}</i><span>${text}</span><small>${success?"ACTION CONFIRMED":"TRY AGAIN"}</small>`;
    this.layer.append(badge);
    if(success)this.burst(badge);
    this.later(()=>anchor.classList.remove("feedback-correct","feedback-wrong"),260);
    this.later(()=>badge.remove(),620);
  }
  selection(text="SELECTION UPDATED"){
    if(!this.layer)return;
    const note=document.createElement("div");note.className="selection-toast";note.textContent=`✓ ${text}`;this.layer.replaceChildren(note);this.later(()=>note.remove(),420);
  }
  shake(){
    if(reduced()||this.shaking||!this.root||this.root.classList.contains("is-dragging"))return;
    this.shaking=true;this.root.classList.add("arcade-shake");
    this.later(()=>{this.root?.classList.remove("arcade-shake");this.shaking=false;},130);
  }
  burst(anchor){
    if(reduced()||!anchor)return;
    const burst=document.createElement("span");burst.className="success-burst";burst.innerHTML="<i></i><i></i><i></i><i></i><i></i><i></i>";anchor.append(burst);this.nodes.add(burst);this.later(()=>{burst.remove();this.nodes.delete(burst);},520);
  }
  destroy(){globalThis.removeEventListener?.("resize",this.cancelFlights);this.timers.forEach(clearTimeout);this.timers.clear();this.animations.forEach(a=>a.cancel());this.animations.clear();this.nodes.forEach(n=>n.remove());this.nodes.clear();this.pulses.forEach((value,node)=>node.classList.remove(value.className));this.pulses.clear();this.root?.classList.remove("arcade-shake","feedback-correct","feedback-wrong");this.layer?.remove();this.shaking=false;}
}

export function animateNumber(node,to,duration=800){
  if(!node)return()=>{};
  if(reduced()){node.textContent=to;return()=>{};}
  let frame,start,done=false;
  const finish=()=>{if(done)return;done=true;cancelAnimationFrame(frame);node.textContent=to;node.removeEventListener("click",finish);node.classList.add("score-settled");};
  const tick=now=>{start??=now;const progress=Math.min(1,(now-start)/duration);node.textContent=Math.round(to*(1-(1-progress)**3));if(progress<1)frame=requestAnimationFrame(tick);else finish();};
  frame=requestAnimationFrame(tick);node.addEventListener("click",finish);return finish;
}
