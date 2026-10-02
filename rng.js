export const hashSeed = (text) => {
  let hash=2166136261;
  for(const char of String(text)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return hash>>>0;
};

export class SeededRandom {
  constructor(seed){this.seed=String(seed);this.state=hashSeed(seed)||1;}
  next(){let value=this.state+=0x6D2B79F5;value=Math.imul(value^value>>>15,value|1);value^=value+Math.imul(value^value>>>7,value|61);return ((value^value>>>14)>>>0)/4294967296;}
  int(min,max){return Math.floor(this.next()*(max-min+1))+min;}
  pick(items){return items[Math.floor(this.next()*items.length)];}
  shuffle(items){const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=this.int(0,i);[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
  fork(label){return new SeededRandom(`${this.seed}:${label}`);}
}
