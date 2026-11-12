const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
// Continuous coverage is earned only where film actually passes during rotation.
export class SealSimulation {
  constructor(){this.elapsed=0;this.y=0;this.target=0;this.started=false;this.sealed=false;this.holding=false;this.gap=0;this.broken=false;this.breaks=0;this.waste=0;this.outside=0;this.layers=Array(64).fill(0);}
  hold(value){if(value&&!this.holding){this.gap=0;this.broken=false;}this.holding=value;}
  step(dt,y=this.y){
    if(!Number.isFinite(dt)||dt<=0||this.sealed)return;
    dt=Math.min(dt,.1);this.elapsed+=dt;this.y=y;
    // Reference path for demos only. Players can start and finish at any height.
    this.target=clamp((this.elapsed-1)/11.3);
    if(!this.holding){if(this.started&&!this.broken){this.gap+=dt;if(this.gap>.35){this.breaks++;this.broken=true;}}return;}
    if(y<-.035||y>1.035){this.outside+=dt;return;}
    this.started=true;
    for(let i=0;i<this.layers.length;i++)if(Math.abs(i/(this.layers.length-1)-y)<=.085)this.layers[i]+=dt/1.35;
    if(this.layers[Math.round(clamp(y)*(this.layers.length-1))]>2.1)this.waste+=dt*.6;
    // An average cannot conceal a bare patch: every height needs a full wrap.
    this.sealed=this.layers.every(layer=>layer>=1);
  }
  get coverage(){return this.layers.reduce((sum,n)=>sum+clamp(n),0)/this.layers.length;}
  get score(){return Math.round(clamp(Math.pow(this.coverage,2.4)*70+(this.sealed?30:0)-this.waste*6-this.outside*10-this.breaks*12,0,100));}
}
let ribbonSequence=0;
export function createPalletSealing(Base){return class PalletSealing extends Base {
  render(){
    this.sim=new SealSimulation();this.pointer=null;this.keys=new Set();
    const boxes=Array.from({length:9},()=>'<img src="assets/barcode-hunt/boxes/box-front-square-label.webp" alt="" draggable="false">').join('');
    const ribbonId=`seal-ribbon-${++ribbonSequence}`;
    const faces=['front','right','back','left'].map(side=>`<div class="seal-face seal-face-${side}"><div class="seal-cartons">${boxes}</div><div class="seal-film"></div><span class="seal-finish-stamp">✓ SEALED</span><div class="seal-wood"></div></div>`).join('');
    this.root.innerHTML=`<section class="seal-layout" aria-label="Pallet sealing"><div class="seal-arena">

      <div class="seal-workspace"><div class="seal-turntable"><span>CEVA · WRAPPING STATION</span></div><div class="seal-shadow"></div><div class="seal-stack">${faces}<div class="seal-top"></div></div><svg class="seal-ribbon" aria-hidden="true"><defs><linearGradient id="${ribbonId}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f2faff" stop-opacity=".6"/><stop offset=".4" stop-color="#dce9f1" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity=".5"/></linearGradient><linearGradient id="${ribbonId}-edge" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0"/><stop offset=".12" stop-color="white"/><stop offset="1" stop-color="white"/></linearGradient><mask id="${ribbonId}-blend" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%"><rect width="100%" height="100%" fill="url(#${ribbonId}-edge)"/></mask></defs><g mask="url(#${ribbonId}-blend)"><path class="seal-ribbon-sheet" fill="url(#${ribbonId})"/><path class="seal-ribbon-strands" fill="none" stroke="#f4fbff" stroke-opacity=".55" stroke-width=".65"/></g></svg><div class="seal-control"><div class="seal-rail"></div><button type="button" class="seal-roll" aria-label="Hold film roll and move only up or down. Space to hold, arrow keys to move." aria-describedby="seal-status"><span class="seal-roll-spool"></span><span class="seal-grip">↕</span></button></div></div>
      <span id="seal-status" class="visually-hidden" role="status" aria-live="polite">Hold the roll at any height and cover the whole pallet.</span>
      </div><footer class="seal-meters"><div><span>COVERAGE <b id="seal-coverage">0%</b></span><div class="seal-meter"><i id="seal-coverage-bar"></i></div><small>Cover every part. Start at any height.</small></div><div><span>FILM USED <b id="seal-usage">GOOD</b></span><div class="seal-meter seal-film-meter"><i id="seal-usage-bar"></i></div><small id="seal-feedback">Hold continuously for an unbroken seal.</small></div><div class="seal-penalties"><span>FILM BREAKS <b id="seal-breaks">0</b></span><small>Releasing the roll can tear the film.</small></div></footer></section>`;
    this.roll=this.root.querySelector('.seal-roll');this.control=this.root.querySelector('.seal-control');this.stack=this.root.querySelector('.seal-stack');
    this.listen(this.control,'pointerdown',event=>{if(event.button!==0||this.pointer!==null)return;event.preventDefault();this.pointer=event.pointerId;const r=this.roll.getBoundingClientRect();this.grab=event.target.closest('.seal-roll')?event.clientY-r.top-r.height/2:0;if(!event.target.closest('.seal-roll')){const rail=this.control.getBoundingClientRect();this.sim.y=clamp(1-(event.clientY-rail.top)/rail.height);}this.sim.hold(true);this.roll.setPointerCapture?.(event.pointerId);this.paint();});
    this.listen(this.roll,'pointermove',event=>{if(event.pointerId!==this.pointer)return;event.preventDefault();const r=this.control.getBoundingClientRect();this.sim.y=1-(event.clientY-this.grab-r.top)/r.height;this.paint();});
    const release=event=>{if(event.pointerId!==this.pointer)return;const id=this.pointer;this.pointer=null;this.sim.hold(false);if(this.roll.hasPointerCapture?.(id))this.roll.releasePointerCapture(id);this.paint();};
    this.listen(this.roll,'pointerup',release);this.listen(this.roll,'pointercancel',release);this.listen(this.roll,'lostpointercapture',release);
    this.listen(this.roll,'keydown',event=>{if([' ','Enter','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();this.keys.add(event.key);if(event.key===' '||event.key==='Enter')this.sim.hold(true);}});
    this.listen(this.roll,'keyup',event=>{this.keys.delete(event.key);if(event.key===' '||event.key==='Enter'){event.preventDefault();this.sim.hold(false);}});
    this.listen(this.roll,'blur',()=>{this.keys.clear();if(this.pointer===null)this.sim.hold(false);});
    this.cleanups.push(()=>{cancelAnimationFrame(this.raf);this.keys.clear();this.sim.hold(false);if(this.pointer!==null&&this.roll.hasPointerCapture?.(this.pointer))this.roll.releasePointerCapture(this.pointer);this.pointer=null;});this.paint();
  }
  start(){this.last=performance.now();const tick=now=>{if(this.locked||this.ctx.isActive?.()===false)return;const dt=Math.min(.05,Math.max(0,(now-this.last)/1000));this.last=now;if(this.keys.has('ArrowUp'))this.sim.y+=dt*.13;if(this.keys.has('ArrowDown'))this.sim.y-=dt*.13;this.sim.step(dt);this.liveScore=this.score();this.paint();if(this.sim.sealed){this.ctx.finish();return;}this.raf=requestAnimationFrame(tick);};this.raf=requestAnimationFrame(tick);}
  paint(){
    const s=this.sim,y=clamp(s.y,-.08,1.08),outside=s.y<-.035||s.y>1.035;
    this.roll.style.bottom=`${y*100}%`;this.roll.classList.toggle('is-held',s.holding);this.roll.setAttribute('aria-pressed',String(s.holding));
    this.stack.style.transform=`rotateX(-11deg) rotateY(${s.elapsed/1.35*360+25}deg)`;
    const stops=s.layers.map((layer,i)=>`rgba(0,0,0,${(clamp(layer)*.96).toFixed(3)}) ${(i/(s.layers.length-1)*100).toFixed(2)}%`).join(',');
    this.root.querySelectorAll('.seal-film').forEach(n=>{n.style.maskImage=`linear-gradient(to top,${stops})`;n.style.webkitMaskImage=n.style.maskImage;});
    this.paintRibbon(s.holding&&!outside);
    this.root.classList.toggle('seal-complete',s.sealed);
    const message=s.sealed?'Pallet sealed. Ready for dispatch.':outside?'Outside the pallet. Move the roll back onto the load.':s.broken?'Film torn. Hold the roll again to continue.':!s.holding?'Hold the roll at any height.':s.waste>.6?'Extra layers are using too much film.':'Cover the bare cardboard. Fill every gap.';
    const status=this.root.querySelector('#seal-status');if(status.textContent!==message)status.textContent=message;
    this.root.querySelector('#seal-coverage').textContent=`${s.sealed?100:Math.min(99,Math.floor(s.coverage*100))}%`;this.root.querySelector('#seal-coverage-bar').style.width=`${s.coverage*100}%`;
    this.root.querySelector('#seal-usage').textContent=s.waste>2?'EXCESS':s.waste>.6?'HIGH':'GOOD';this.root.querySelector('#seal-usage-bar').style.width=`${Math.min(100,s.layers.reduce((sum,n)=>sum+n,0)/s.layers.length*55)}%`;this.root.querySelector('#seal-usage-bar').classList.toggle('is-excess',s.waste>2);
    this.root.querySelector('#seal-breaks').textContent=String(s.breaks);this.root.classList.toggle('seal-warning',outside||s.broken);
    this.correct=Math.round(s.coverage*24);this.mistakes=s.breaks+Math.floor(s.outside)+Math.floor(s.waste);
  }
  paintRibbon(visible){
    const svg=this.root.querySelector('.seal-ribbon');svg.style.opacity=visible?'.9':'0';if(!visible)return;
    const world=this.root.querySelector('.seal-workspace'),bounds=world.getBoundingClientRect(),roll=this.roll.getBoundingClientRect();if(!bounds.width||!world.clientWidth)return;
    const scale=bounds.width/world.clientWidth,faces=[...this.stack.querySelectorAll('.seal-face')].map(n=>n.getBoundingClientRect());
    const end=(roll.left+9-bounds.left)/scale,start=(Math.max(...faces.map(r=>r.right))-bounds.left)/scale-3;
    const y=(roll.top+roll.height/2-bounds.top)/scale,width=this.control.clientHeight*.17,mid=(start+end)/2,sag=Math.min(9,(end-start)*.035);
    svg.setAttribute('viewBox',`0 0 ${world.clientWidth} ${world.clientHeight}`);
    const blend=svg.querySelector('linearGradient[id$="-edge"]');blend.setAttribute('x1',start);blend.setAttribute('x2',end);
    const edge=offset=>`M ${start} ${y+offset} Q ${mid} ${y+offset+sag} ${end} ${y+offset}`;
    svg.querySelector('.seal-ribbon-sheet').setAttribute('d',`${edge(-width/2)} L ${end} ${y+width/2} Q ${mid} ${y+width/2+sag} ${start} ${y+width/2} Z`);
    svg.querySelector('.seal-ribbon-strands').setAttribute('d',Array.from({length:9},(_,i)=>edge((i/8-.5)*width)).join(' '));
  }
  score(){return this.sim?.score||0;}
};}
