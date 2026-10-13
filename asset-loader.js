/** Shared decoded-image cache. No timer starts until the caller has awaited it. */
export class AssetLoader {
  constructor({concurrency=6,timeout=15000,imageFactory=()=>new Image()}={}){
    this.concurrency=Math.max(1,concurrency);this.timeout=timeout;this.imageFactory=imageFactory;this.cache=new Map();
  }
  load(path){
    if(this.cache.has(path))return this.cache.get(path);
    const image=this.imageFactory();
    const promise=new Promise((resolve,reject)=>{
      let settled=false;const done=error=>{if(settled)return;settled=true;clearTimeout(timer);image.onload=null;image.onerror=null;if(error)reject(new Error(`Could not load ${path}`));else resolve(image);};
      const timer=setTimeout(()=>done(true),this.timeout);
      image.onload=async()=>{try{if(image.decode)await image.decode();done();}catch{done(true);}};
      image.onerror=()=>done(true);image.decoding="async";image.src=path;
    });
    this.cache.set(path,promise);promise.catch(()=>{if(this.cache.get(path)===promise)this.cache.delete(path);});
    return promise;
  }
  async preload(paths,onProgress=()=>{}){
    const unique=[...new Set(paths)],failed=[];let next=0,completed=0;
    onProgress({completed,total:unique.length,failed:0});
    const worker=async()=>{while(next<unique.length&&failed.length<this.concurrency){const path=unique[next++];try{await this.load(path);}catch{failed.push(path);}completed++;onProgress({completed,total:unique.length,failed:failed.length});}};
    await Promise.all(Array.from({length:Math.min(this.concurrency,unique.length)},worker));
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
