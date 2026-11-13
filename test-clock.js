// Scoped to minigame callbacks in /test and /tests. No global browser clocks change.
export class TestGameClock {
  constructor(){this.offset=0;this.paused=false;this.tasks=new Map();this.serial=0;this.timeStopped=false;this.timeOffset=0;}
  now(){return (this.paused?this.pausedAt:performance.now())-this.offset;}
  deadlineNow(){return (this.timeStopped?this.timeStoppedAt:this.now())-this.timeOffset;}
  stopTime(){if(!this.timeStopped){this.timeStoppedAt=this.now();this.timeStopped=true;}}
  resumeTime(){if(this.timeStopped){this.timeOffset+=this.now()-this.timeStoppedAt;this.timeStopped=false;}}
  schedule(callback,delay,type){const id=++this.serial,task={callback,type,due:this.now()+Math.max(0,delay)};this.tasks.set(id,task);if(!this.paused)this.arm(id,task);return id;}
  arm(id,task){
    const run=()=>{task.native=null;if(this.paused||!this.tasks.has(id))return;this.tasks.delete(id);task.callback(task.type==='frame'?this.now():undefined);};
    task.native=task.type==='frame'?requestAnimationFrame(run):setTimeout(run,Math.max(0,task.due-this.now()));
  }
  frame(callback){return this.schedule(callback,0,'frame');}
  timeout(callback,delay){return this.schedule(callback,delay,'timeout');}
  disarm(task){if(task.native!=null)(task.type==='frame'?cancelAnimationFrame:clearTimeout)(task.native);task.native=null;}
  cancel(id){const task=this.tasks.get(id);if(task)this.disarm(task);this.tasks.delete(id);}
  pause(){if(this.paused)return;this.pausedAt=performance.now();this.paused=true;for(const task of this.tasks.values())this.disarm(task);}
  resume(){if(!this.paused)return;this.offset+=performance.now()-this.pausedAt;this.paused=false;for(const [id,task]of this.tasks)this.arm(id,task);}
  clear(){for(const task of this.tasks.values())this.disarm(task);this.tasks.clear();this.paused=false;this.offset=0;this.timeStopped=false;this.timeOffset=0;}
}
