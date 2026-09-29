const destinations = ["Reykjavik Hub", "Oslo North", "Helsinki DC", "Edinburgh Depot", "Toronto East", "Boston Gateway", "Copenhagen Central", "Zurich Alpine"];
const carriers = ["Polar Freight", "Arctic Express", "NorthStar Cargo", "SleighLine", "Aurora Transit"];
const choice = (a, rng = Math.random) => a[Math.floor(rng() * a.length)];
const int = (min, max, rng = Math.random) => Math.floor(rng() * (max - min + 1)) + min;
const shuffle = (a, rng = Math.random) => [...a].sort(() => rng() - .5);
const digits = (n, rng = Math.random) => String(int(10 ** (n - 1), 10 ** n - 1, rng));
const sku = (rng) => `SKU-${digits(5, rng)}`;
const serial = (rng) => `SN-${digits(6, rng)}`;
const location = (rng) => `${choice("ABCD", rng)}${String(int(1, 12, rng)).padStart(2,"0")}-${String(int(1,6,rng)).padStart(2,"0")}-${String(int(1,5,rng)).padStart(2,"0")}`;
const id = (prefix, rng) => `${prefix}-${digits(prefix === "SHP" ? 6 : 5, rng)}`;
const uniqueValues = (count, factory) => { const values=[]; while(values.length<count){const value=factory();if(!values.includes(value))values.push(value);} return values; };
const mutate = (value) => {
  const chars = [...value]; const indexes = chars.map((c,i) => /\d/.test(c) ? i : -1).filter(i => i >= 0);
  const at = indexes[Math.floor(Math.random() * indexes.length)]; chars[at] = String((Number(chars[at]) + int(1,8)) % 10); return chars.join("");
};
const table = (title, columns, rows, selectable = false) => ({ type: "table", title, columns, rows, selectable });
const list = (title, items, selectable = false) => ({ type: "list", title, items, selectable });

export class DifficultyManager {
  static forRound(round) {
    const tier = Math.min(4, Math.ceil(round / 3));
    const timers = [32, 25, 20, 16];
    return { tier, rows: 4 + tier * 2, errors: tier < 3 ? 1 : tier - 1, time: timers[tier - 1] };
  }
}

export class TaskGenerator {
  constructor(rng = Math.random) { this.rng = rng; }
  base(type, title, instruction, difficulty) { return { type, title, instruction, difficulty, panels: [], selectable: [], solution: [], mode: "select", submitLabel: "VERIFY", penalty: 35 }; }

  picking(d) {
    const target = sku(this.rng), rows = [], correct = [], needed = int(8, 15, this.rng);
    const first = needed - int(2, 5, this.rng), second = needed - first;
    const uniqueLocation = () => { let key; do { key = location(this.rng); } while (rows.some((row) => row.key === key)); return key; };
    [first, second].forEach((qty) => { const key = uniqueLocation(); correct.push(key); rows.push({ key, cells:[key,target,qty,"PICKABLE"] }); });
    while(rows.length < d.rows) { const s = this.rng() < .35 ? target : sku(this.rng); const loc = uniqueLocation(); rows.push({key:loc,cells:[loc,s,int(2,18,this.rng),s===target?"BLOCKED":"PICKABLE"]}); }
    const t=this.base("picking","LOCATION PICKING",`Select the minimum pickable locations to fulfill ${target} × ${needed}.`,d);
    t.panels=[table("AVAILABLE STOCK",["LOCATION","SKU","QTY","STATUS"],shuffle(rows,this.rng),true)]; t.solution=correct; t.selectable=rows.map(r=>r.key); return t;
  }

  inventory(d) {
    const issues=["PHYSICAL SHORTAGE","OVER-ALLOCATION","BLOCKED STOCK COUNTED","PICK EXCEEDS STOCK"];
    const rows=[], solution=[];
    for(let i=0;i<d.rows;i++){ let key;do{key=id("BIN",this.rng);}while(rows.some(row=>row.key===key));const physical=int(5,25,this.rng), picked=int(0,Math.max(0,physical-2),this.rng); let wms=physical, allocated=int(0,physical-picked,this.rng), status="OK";
      if(i<d.errors){ const issue=issues[i%issues.length]; status=issue; if(issue==="PHYSICAL SHORTAGE")wms=physical+int(2,5,this.rng); if(issue==="OVER-ALLOCATION")allocated=physical+2; if(issue==="BLOCKED STOCK COUNTED")status="BLOCKED / AVAILABLE"; if(issue==="PICK EXCEEDS STOCK")rows.push({key,cells:[key,wms,physical,physical+2,allocated,status]}); solution.push(key); }
      if(!rows.some(r=>r.key===key)) rows.push({key,cells:[key,wms,physical,picked,allocated,status]});
    }
    const t=this.base("inventory","INVENTORY CONTROL","Select every record requiring reconciliation.",d); t.panels=[table("WMS INVENTORY",["BIN","WMS","PHYSICAL","PICKED","ALLOCATED","STATE"],shuffle(rows,this.rng),true)];t.solution=solution;t.selectable=rows.map(r=>r.key);return t;
  }

  serials(d) {
    const count=5+d.tier*3, expected=uniqueValues(count,()=>serial(this.rng)); let scanned=[...expected], bad=[];
    const missing=choice(expected,this.rng); scanned=scanned.filter(x=>x!==missing); bad.push(`MISSING: ${missing}`);
    if(d.tier>=3){const unexpected=mutate(choice(expected,this.rng));scanned.push(unexpected);bad.push(`UNEXPECTED: ${unexpected}`);}
    const options=shuffle([...bad,`MISSING: ${choice(scanned,this.rng)}`,`UNEXPECTED: ${choice(expected,this.rng)}`],this.rng);
    const t=this.base("serials","SERIAL AUDIT","Compare expected and scanned sets. Select every true discrepancy.",d);t.panels=[list("EXPECTED SERIALS",expected),list("SCANNED SERIALS",shuffle(scanned,this.rng)),list("AUDIT FINDINGS",options.map(x=>({key:x,label:x})),true)];t.solution=bad;t.selectable=options;return t;
  }

  labels(d) {
    const shipment=id("SHP",this.rng), pallet=id("PLT",this.rng), dest=choice(destinations,this.rng), carrier=choice(carriers,this.rng), product=sku(this.rng), qty=int(6,20,this.rng), rows=[], solution=[];
    for(let i=0;i<Math.max(4,d.tier+3);i++){const key=`LBL-${i+1}`;const cells=[key,shipment,pallet,dest,carrier,product,qty];if(i<d.errors){cells[3]=choice(destinations.filter(x=>x!==dest),this.rng);solution.push(key);}rows.push({key,cells});}
    const t=this.base("labels","LABEL INSPECTION","Select all labels that do not match the shipment master.",d);t.panels=[table("SHIPMENT MASTER",["SHIPMENT","PALLET","DESTINATION","CARRIER","SKU","QTY"],[{cells:[shipment,pallet,dest,carrier,product,qty]}]),table("PRINTED LABELS",["LABEL","SHIPMENT","PALLET","DESTINATION","CARRIER","SKU","QTY"],shuffle(rows,this.rng),true)];t.solution=solution;t.selectable=rows.map(r=>r.key);return t;
  }

  packing(d) {
    const weight=int(14,28,this.rng), fragile=this.rng()>.4, cold=d.tier>2&&this.rng()>.5; const valid=`CTN-${int(100,999,this.rng)}`;
    const cartons=[{key:valid,cells:[valid,weight+int(3,8,this.rng),fragile?"YES":"NO",cold?"YES":"NO","STANDARD"]},{key:"CTN-A",cells:["CTN-A",weight-2,"YES","YES","STANDARD"]},{key:"CTN-B",cells:["CTN-B",weight+8,"NO",cold?"NO":"YES","HAZMAT ONLY"]},{key:"CTN-C",cells:["CTN-C",weight+5,fragile?"YES":"NO","NO","OVERSIZE ONLY"]}];
    const t=this.base("packing","PACKING STATION",`Choose one carton: load ${weight} kg${fragile?", fragile":""}${cold?", cold-chain":""}.`,d);t.panels=[table("CARTON RACK",["CARTON","MAX KG","FRAGILE KIT","INSULATED","CLASS"],shuffle(cartons,this.rng),true)];t.solution=[valid];t.selectable=cartons.map(x=>x.key);return t;
  }

  pallet(d) { return this.orderTask("pallet","PALLET BUILDING","Arrange cartons bottom to top: heaviest first; fragile carton must be top.",d,Array.from({length:4+d.tier},(_,i)=>({key:`C${i+1}`,weight:10+i*4,fragile:i===0})),(a,b)=>a.fragile?1:b.fragile?-1:b.weight-a.weight); }
  loading(d) { const keys=uniqueValues(4+d.tier,()=>id("PLT",this.rng));const items=keys.map((key,i)=>({key,stop:i+1,weight:int(180,600,this.rng)})); return this.orderTask("loading","TRUCK LOADING","Arrange deepest to doors. Last delivery loads first; first delivery stays accessible.",d,items,(a,b)=>b.stop-a.stop); }
  orderTask(type,title,instruction,d,items,sorter){const sorted=[...items].sort(sorter);const t=this.base(type,title,instruction,d);t.mode="order";t.items=shuffle(items,this.rng);t.solution=sorted.map(x=>x.key);t.submitLabel="CONFIRM SEQUENCE";return t;}

  wms(d) { const cases=[{problem:"Allocated stock is BLOCKED",answer:"Remove allocation and escalate stock hold",wrong:["Confirm pick from blocked stock","Force shipment to READY"]},{problem:"Duplicate scan detected after carton close",answer:"Reverse duplicate scan and recount carton",wrong:["Print another label","Ignore scan and release"]},{problem:"Physical stock is below WMS quantity",answer:"Freeze location and perform cycle count",wrong:["Increase physical count","Allocate remaining demand"]}];const c=choice(cases,this.rng), opts=shuffle([c.answer,...c.wrong],this.rng);const t=this.base("wms","WMS EXCEPTION",c.problem,d);t.panels=[list("SELECT OPERATIONAL ACTION",opts.map(x=>({key:x,label:x})),true)];t.solution=[c.answer];t.selectable=opts;return t; }
  scanner(d){const orders=uniqueValues(2+d.tier,()=>sku(this.rng));const distractors=uniqueValues(2+d.tier,()=>{let value;do{value=sku(this.rng);}while(orders.includes(value));return value;});const scans=shuffle([...orders,...distractors],this.rng);const t=this.base("scanner","SCANNER CHALLENGE","Select only scanned SKUs present on the order.",d);t.panels=[list("ORDER SKU LIST",orders),list("SCAN STREAM",scans.map((x,i)=>({key:`${i}:${x}`,label:x})),true)];t.solution=scans.map((x,i)=>orders.includes(x)?`${i}:${x}`:null).filter(Boolean);t.selectable=scans.map((x,i)=>`${i}:${x}`);return t;}
  quality(d){const rows=[],solution=[];for(let i=0;i<d.rows-1;i++){let key;do{key=id("SHP",this.rng);}while(rows.some(row=>row.key===key));const valid=i%3!==0;rows.push({key,cells:[key,valid?"MATCH":"MISMATCH",valid?"VERIFIED":"MISSING",valid?"CLEAR":"HOLD",valid?"READY":"EXCEPTION"]});if(valid)solution.push(key);}const t=this.base("quality","QUALITY CONTROL","Select every shipment safe to release.",d);t.panels=[table("RELEASE QUEUE",["SHIPMENT","QTY","SERIALS","QC","WMS"],shuffle(rows,this.rng),true)];t.solution=solution;t.selectable=rows.map(x=>x.key);return t;}

  generate(type,d){return this[type](d);}
  generateFinal(){const d={tier:5,errors:3,time:42}, shipment=id("SHP",this.rng), product=sku(this.rng), pallet=id("PLT",this.rng), dest=choice(destinations,this.rng);const expected=uniqueValues(12,()=>serial(this.rng));const scanned=expected.slice(1);const issues=["MISSING SERIAL","QUANTITY MISMATCH","WRONG DESTINATION"];const all=[...issues,"DAMAGED STOCK","WRONG PALLET","INVALID WMS STATUS","DUPLICATE SCAN"];
    return {type:"final",title:"FINAL DISPATCH",instruction:"Identify every critical issue, then make the release decision.",difficulty:d,mode:"final",solution:issues,action:"HOLD",selectable:all,penalty:120,panels:[table("SHIPMENT DOSSIER",["SHIPMENT","SKU","ORDER QTY","SCANNED","PALLET","DESTINATION","LABEL DEST.","WMS"],[{cells:[shipment,product,expected.length,scanned.length,pallet,dest,choice(destinations.filter(x=>x!==dest),this.rng),"READY"]}]),list("EXPECTED SERIALS",expected),list("SCANNED SERIALS",scanned),list("CRITICAL FINDINGS",shuffle(all,this.rng).map(x=>({key:x,label:x})),true)]}; }
}

export const TASK_TYPES=["picking","inventory","serials","labels","packing","pallet","loading","wms","scanner","quality"];
export const taskIsCorrect=(task,selected,order=[],action=null)=>{const a=task.mode==="order"?order:selected;return a.length===task.solution.length&&a.every((x,i)=>task.mode==="order"?x===task.solution[i]:task.solution.includes(x))&&(!task.action||task.action===action);};
