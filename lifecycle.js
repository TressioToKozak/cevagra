export class StageGuard {
  constructor(now=()=>performance.now()){this.now=now;this.serial=0;this.closed=true;}
  begin(seconds){this.serial++;this.closed=false;this.deadline=this.now()+seconds*1000;return this.serial;}
  remaining(token=this.serial){return token===this.serial&&!this.closed?Math.max(0,(this.deadline-this.now())/1000):0;}
  complete(token){if(token!==this.serial||this.closed)return false;this.closed=true;return true;}
  cancel(){this.closed=true;this.serial++;}
}
