const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
// Continuous coverage is earned only where film actually passes during rotation.
export class SealSimulation {
  constructor(){this.elapsed=0;this.y=0;this.target=0;this.anchor=0;this.anchorAt=null;this.topHold=0;this.sealed=false;this.holding=false;this.gap=0;this.broken=false;this.breaks=0;this.waste=0;this.outside=0;this.layers=Array(24).fill(0);}
  hold(value){if(value&&!this.holding){this.gap=0;this.broken=false;}this.holding=value;}
  step(dt,y=this.y){
    if(!Number.isFinite(dt)||dt<=0||this.sealed)return;
    dt=Math.min(dt,.1);this.elapsed+=dt;this.y=y;
    // Nominal trajectory for the recorded demo; never used to penalize player pace.
    this.target=this.anchorAt===null?0:clamp((this.elapsed-this.anchorAt)/11.3);
    if(!this.holding){if(this.anchorAt!==null&&!this.broken){this.gap+=dt;if(this.gap>.35){this.breaks++;this.broken=true;}}return;}
    if(y<-.035||y>1.035){this.outside+=dt;this.topHold=0;return;}
    if(this.anchorAt===null){if(y<=.08){this.anchor+=dt;if(this.anchor>=1)this.anchorAt=this.elapsed;}else this.anchor=Math.max(0,this.anchor-dt*2);}
    if(this.anchorAt!==null||y<=.08)for(let i=0;i<this.layers.length;i++)if(Math.abs(i/(this.layers.length-1)-y)<=.085)this.layers[i]+=dt/1.35;
    // Extra overlapping turns are waste; ordinary overlap is required for a seal.
    if(this.layers[Math.round(clamp(y)*(this.layers.length-1))]>2.1)this.waste+=dt*.6;
    if(this.anchorAt!==null&&this.coverage>=.99&&y>=.94){this.topHold+=dt;if(this.topHold>=.85)this.sealed=true;}else this.topHold=0;
  }
  get coverage(){return this.layers.reduce((sum,n)=>sum+clamp(n),0)/this.layers.length;}
  get score(){return Math.round(clamp(this.coverage*85+(this.anchorAt!==null?5:0)+(this.sealed?10:0)-this.waste*2.5-this.outside*6-this.breaks*6,0,100));}
  get phase(){return this.anchorAt===null?'ANCHOR THE BASE':this.sealed?'PALLET SEALED':this.coverage>=.92?'SEAL THE TOP':'WRAP THE PALLET';}
}
export function createPalletSealing(Base){return class PalletSealing extends Base {
  render(){
    this.sim=new SealSimulation();this.pointer=null;this.keys=new Set();
    const boxes=Array.from({length:9},()=>'<img src="assets/barcode-hunt/boxes/box-front-square-label.webp" alt="" draggable="false">').join('');
    const bands=Array.from({length:24},(_,i)=>`<i data-film="${i}" style="bottom:${i/24*100}%"></i>`).join('');
    const faces=['front','right','back','left'].map(side=>`<div class="seal-face seal-face-${side}"><div class="seal-cartons">${boxes}</div><div class="seal-film">${bands}</div><span class="seal-finish-stamp">✓ SEALED</span><div class="seal-wood"></div></div>`).join('');
    this.root.innerHTML=`<section class="seal-layout" aria-label="Pallet sealing"><div class="seal-arena">

      <div class="seal-workspace"><div class="seal-turntable"><span>CEVA · WRAPPING STATION</span></div><div class="seal-shadow"></div><div class="seal-stack">${faces}<div class="seal-top"></div></div><div class="seal-ribbon"></div><div class="seal-control"><div class="seal-rail"></div><button type="button" class="seal-roll" aria-label="Hold film roll and move only up or down. Space to hold, arrow keys to move." aria-describedby="seal-status"><span class="seal-roll-spool"></span><span class="seal-grip">↕</span></button></div></div>
      <span id="seal-status" class="visually-hidden" role="status" aria-live="polite">Hold the roll at the base for 1 second.</span>
      </div><footer class="seal-meters"><div><span>COVERAGE <b id="seal-coverage">0%</b></span><div class="seal-meter"><i id="seal-coverage-bar"></i></div><small>Wrap the whole pallet, bottom to top.</small></div><div><span>FILM USED <b id="seal-usage">GOOD</b></span><div class="seal-meter seal-film-meter"><i id="seal-usage-bar"></i></div><small id="seal-feedback">Hold continuously for an unbroken seal.</small></div><div class="seal-penalties"><span>FILM BREAKS <b id="seal-breaks">0</b></span><small>Releasing the roll can tear the film.</small></div></footer></section>`;
    this.roll=this.root.querySelector('.seal-roll');this.control=this.root.querySelector('.seal-control');this.stack=this.root.querySelector('.seal-stack');
    this.listen(this.roll,'pointerdown',event=>{if(event.button!==0||this.pointer!==null)return;event.preventDefault();this.pointer=event.pointerId;const r=this.roll.getBoundingClientRect();this.grab=event.clientY-r.top-r.height/2;this.sim.hold(true);this.roll.setPointerCapture?.(event.pointerId);this.paint();});
    this.listen(this.roll,'pointermove',event=>{if(event.pointerId!==this.pointer)return;event.preventDefault();const r=this.control.getBoundingClientRect();this.sim.y=1-(event.clientY-this.grab-r.top)/r.height;this.paint();});
    const release=event=>{if(event.pointerId!==this.pointer)return;const id=this.pointer;this.pointer=null;this.sim.hold(false);if(this.roll.hasPointerCapture?.(id))this.roll.releasePointerCapture(id);this.paint();};
    this.listen(this.roll,'pointerup',release);this.listen(this.roll,'pointercancel',release);this.listen(this.roll,'lostpointercapture',release);
    this.listen(this.roll,'keydown',event=>{if([' ','Enter','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();this.keys.add(event.key);if(event.key===' '||event.key==='Enter')this.sim.hold(true);}});
    this.listen(this.roll,'keyup',event=>{this.keys.delete(event.key);if(event.key===' '||event.key==='Enter'){event.preventDefault();this.sim.hold(false);}});
    this.listen(this.roll,'blur',()=>{this.keys.clear();if(this.pointer===null)this.sim.hold(false);});
    this.cleanups.push(()=>{cancelAnimationFrame(this.raf);this.keys.clear();this.sim.hold(false);if(this.pointer!==null&&this.roll.hasPointerCapture?.(this.pointer))this.roll.releasePointerCapture(this.pointer);this.pointer=null;});this.paint();
  }
  start(){this.last=performance.now();const tick=now=>{if(this.locked||this.ctx.isActive?.()===false)return;const dt=Math.min(.05,Math.max(0,(now-this.last)/1000));this.last=now;if(this.keys.has('ArrowUp'))this.sim.y+=dt*.13;if(this.keys.has('ArrowDown'))this.sim.y-=dt*.13;this.sim.step(dt);this.liveScore=this.score();this.paint();if(this.sim.sealed){this.roll.disabled=true;this.timeout(()=>this.ctx.finish(),650);return;}this.raf=requestAnimationFrame(tick);};this.raf=requestAnimationFrame(tick);}
  paint(){
    const s=this.sim,y=clamp(s.y,-.08,1.08),outside=s.y<-.035||s.y>1.035;
    this.roll.style.bottom=`${y*100}%`;this.roll.classList.toggle('is-held',s.holding);this.roll.setAttribute('aria-pressed',String(s.holding));
    this.stack.style.transform=`rotateX(-11deg) rotateY(${s.elapsed/1.35*360+25}deg)`;
    this.root.querySelectorAll('[data-film]').forEach(n=>{const layer=s.layers[Number(n.dataset.film)];n.style.opacity=String(clamp(layer)*.96);n.classList.toggle('is-overwrapped',layer>2.1);});
    const ribbon=this.root.querySelector('.seal-ribbon');ribbon.style.bottom=`calc(20% + var(--load-height) * ${y})`;ribbon.style.opacity=s.holding&&!outside?'.8':'0';
    this.root.classList.toggle('seal-complete',s.sealed);
    const message=s.sealed?'Pallet sealed. Ready for dispatch.':outside?'Outside the pallet. Move the roll back onto the load.':s.broken?'Film torn. Hold the roll again to continue.':!s.holding?'Hold the roll. Move only up and down.':s.anchorAt===null?`Anchoring… ${Math.min(100,Math.round(s.anchor*100))}%`:s.coverage>=.92?'Hold at the top to seal the film.':s.waste>.6?'Extra layers are using too much film.':'Cover the bare cardboard. Keep a steady overlap.';
    const status=this.root.querySelector('#seal-status');if(status.textContent!==message)status.textContent=message;
    this.root.querySelector('#seal-coverage').textContent=`${Math.round(s.coverage*100)}%`;this.root.querySelector('#seal-coverage-bar').style.width=`${s.coverage*100}%`;
    this.root.querySelector('#seal-usage').textContent=s.waste>2?'EXCESS':s.waste>.6?'HIGH':'GOOD';this.root.querySelector('#seal-usage-bar').style.width=`${Math.min(100,s.layers.reduce((sum,n)=>sum+n,0)/s.layers.length*55)}%`;this.root.querySelector('#seal-usage-bar').classList.toggle('is-excess',s.waste>2);
    this.root.querySelector('#seal-breaks').textContent=String(s.breaks);this.root.classList.toggle('seal-warning',outside||s.broken);
    this.correct=Math.round(s.coverage*24);this.mistakes=s.breaks+Math.floor(s.outside)+Math.floor(s.waste);
  }
  score(){return this.sim?.score||0;}
};}
