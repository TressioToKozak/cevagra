const reduced=()=>globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches??false;
export class ArcadeEffects {
  constructor(root){this.root=root;this.shakeTimer=0;}
  feedback(kind,text,anchor=this.root){if(!anchor)return;anchor.classList.remove("feedback-correct","feedback-wrong");void anchor.offsetWidth;anchor.classList.add(kind==="success"?"feedback-correct":"feedback-wrong");const badge=document.createElement("span");badge.className=`action-badge ${kind}`;badge.textContent=`${kind==="success"?"✓":"!"} ${text}`;anchor.append(badge);setTimeout(()=>badge.remove(),650);setTimeout(()=>anchor.classList.remove("feedback-correct","feedback-wrong"),300);if(kind!=="success")this.shake();}
  shake(){if(reduced()||this.shakeTimer||!this.root)return;this.root.classList.add("arcade-shake");this.shakeTimer=setTimeout(()=>{this.root.classList.remove("arcade-shake");this.shakeTimer=0;},160);}
  burst(anchor){if(reduced()||!anchor)return;const burst=document.createElement("span");burst.className="success-burst";burst.innerHTML="<i></i><i></i><i></i><i></i><i></i><i></i>";anchor.append(burst);setTimeout(()=>burst.remove(),600);}
  destroy(){clearTimeout(this.shakeTimer);this.root?.classList.remove("arcade-shake");}
}
export function animateNumber(node,to,duration=800){if(!node)return()=>{};if(reduced()){node.textContent=to;return()=>{};}let frame,start;const tick=now=>{start??=now;const p=Math.min(1,(now-start)/duration);node.textContent=Math.round(to*(1-(1-p)**3));if(p<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);const skip=()=>{cancelAnimationFrame(frame);node.textContent=to;};node.addEventListener("click",skip,{once:true});return skip;}
