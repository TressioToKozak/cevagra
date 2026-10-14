export const ASSET_PRIORITY=Object.freeze({LOW:0,MEDIUM:1,HIGH:2});

/** One global priority queue and decoded-image cache for every loading caller. */
export class AssetLoader {
  constructor({concurrency=6,timeout=15000,imageFactory=()=>new Image()}={}){
    this.concurrency=Math.max(1,concurrency);this.timeout=timeout;this.imageFactory=imageFactory;
    this.cache=new Map();this.jobs=new Map();this.queue=[];this.activeJobs=new Set();this.sequence=0;
  }
  load(path,priority=ASSET_PRIORITY.HIGH){
    if(this.cache.has(path)){
      const job=this.jobs.get(path);
      if(job&&priority>job.priority){job.priority=priority;if(job.image)job.image.fetchPriority=priority===ASSET_PRIORITY.HIGH?"high":"auto";this.pump();}
      return this.cache.get(path);
    }
    let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const job={path,priority,order:this.sequence++,resolve,reject,promise};
    this.cache.set(path,promise);this.jobs.set(path,job);this.queue.push(job);this.pump();return promise;
  }
  pump(){
    this.queue.sort((a,b)=>b.priority-a.priority||a.order-b.order);
    while(this.queue.length&&this.activeJobs.size<this.concurrency){
      const job=this.queue[0],lowCount=[...this.activeJobs].filter(j=>j.priority===ASSET_PRIORITY.LOW).length;
      // Reserve a lane for critical work instead of filling every slot with background images.
      if(job.priority===ASSET_PRIORITY.LOW&&lowCount>=Math.max(1,this.concurrency-1))break;
      this.queue.shift();this.activeJobs.add(job);this.start(job);
    }
  }
  start(job){
    let image,timer,settled=false;
    const done=error=>{
      if(settled)return;settled=true;clearTimeout(timer);
      if(image){image.onload=null;image.onerror=null;if(error)image.removeAttribute?.("src");}
      this.activeJobs.delete(job);this.jobs.delete(job.path);
      if(error){this.cache.delete(job.path);job.reject(new Error(`Could not load ${job.path}`));}else job.resolve(image);
      this.pump();
    };
    try{
      image=job.image=this.imageFactory();timer=setTimeout(()=>done(true),this.timeout);
      image.onload=async()=>{try{if(image.decode)await image.decode();done();}catch{done(true);}};
      image.onerror=()=>done(true);image.decoding="async";image.fetchPriority=job.priority===ASSET_PRIORITY.HIGH?"high":job.priority===ASSET_PRIORITY.LOW?"low":"auto";image.src=job.path;
    }catch{done(true);}
  }
  async preload(paths,onProgress=()=>{},{priority=ASSET_PRIORITY.HIGH}={}){
    const unique=[...new Set(paths)],failed=[];let completed=0;
    onProgress({completed,total:unique.length,failed:0});
    await Promise.all(unique.map(async path=>{try{await this.load(path,priority);}catch{failed.push(path);}completed++;onProgress({completed,total:unique.length,failed:failed.length});}));
    if(failed.length){const error=new Error(`${failed.length} warehouse image${failed.length===1?"":"s"} could not be prepared.`);error.paths=failed;throw error;}
    return unique.length;
  }
  async decodeDom(root){
    await Promise.all([...root.querySelectorAll("img")].map(async image=>{
      await this.load(image.getAttribute("src"));
      if(image.decode){let timer;try{await Promise.race([image.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("A challenge image could not be decoded in time.")),this.timeout);})]);}finally{clearTimeout(timer);}}
    }));
  }
}
export const assetLoader=new AssetLoader();
