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
    this.shaking=false;
  }
  later(callback,delay){const id=setTimeout(()=>{this.timers.delete(id);callback();},delay);this.timers.add(id);return id;}
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
    if(success)this.burst(badge);else this.shake();
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
    const burst=document.createElement("span");burst.className="success-burst";burst.innerHTML="<i></i><i></i><i></i><i></i><i></i><i></i>";anchor.append(burst);this.later(()=>burst.remove(),520);
  }
  destroy(){this.timers.forEach(clearTimeout);this.timers.clear();this.root?.classList.remove("arcade-shake","feedback-correct","feedback-wrong");this.layer?.remove();this.shaking=false;}
}

export function animateNumber(node,to,duration=800){
  if(!node)return()=>{};
  if(reduced()){node.textContent=to;return()=>{};}
  let frame,start,done=false;
  const finish=()=>{if(done)return;done=true;cancelAnimationFrame(frame);node.textContent=to;node.removeEventListener("click",finish);};
  const tick=now=>{start??=now;const progress=Math.min(1,(now-start)/duration);node.textContent=Math.round(to*(1-(1-progress)**3));if(progress<1)frame=requestAnimationFrame(tick);else finish();};
  frame=requestAnimationFrame(tick);node.addEventListener("click",finish);return finish;
}
