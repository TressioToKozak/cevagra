// One named suite per CI job, or all suites locally. No production dependencies.
const {spawn}=require('node:child_process'),{mkdirSync,createWriteStream,writeFileSync,readdirSync}=require('node:fs'),http=require('node:http');
const root=require('node:path').resolve(__dirname,'..');
const suites=['node',...readdirSync(__dirname).filter(n=>n.endsWith('-tests.cjs')&&n!=='run-tests.cjs').map(n=>n.replace('-tests.cjs','')).sort()];
const selected=process.argv.slice(2);if(selected.some(n=>!suites.includes(n))){console.error('Unknown suite. Choose: '+suites.join(', '));process.exit(1);}
async function ready(url){for(let i=0;i<100;i++){const ok=await new Promise(resolve=>{const req=http.get(url,r=>{r.resume();resolve(r.statusCode===200);});req.on('error',()=>resolve(false));req.setTimeout(500,()=>req.destroy());});if(ok)return;await new Promise(r=>setTimeout(r,100));}throw Error('HTTP server did not become ready');}
(async()=>{mkdirSync(root+'/test-results',{recursive:true});let server,currentChild;const results=[];let interrupted=false;
 const stop=()=>{interrupted=true;currentChild?.kill();server?.kill();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 try{
  const chosen=selected.length?selected:suites;
  const port=process.env.TEST_PORT||'8002',origin=process.env.TEST_ORIGIN||`http://127.0.0.1:${port}/`;
  if(chosen.some(n=>n!=='node')){
   if(!process.env.TEST_ORIGIN){server=spawn('python3',['-m','http.server',port,'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});server.on('error',e=>console.error(e.message));}
   await ready(origin);
  }
  for(const suite of chosen){if(interrupted)throw Error('Interrupted');const log=createWriteStream(root+'/test-results/'+suite+'.log');console.log('\nRunning '+suite);const started=Date.now();const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[suite==='node'?'tests.mjs':`scripts/${suite}-tests.cjs`],{cwd:root,env:{...process.env,TEST_ORIGIN:origin},stdio:['ignore','pipe','pipe']});currentChild=child;child.stdout.on('data',d=>{process.stdout.write(d);log.write(d);});child.stderr.on('data',d=>{process.stderr.write(d);log.write(d);});child.on('error',reject);child.on('close',c=>resolve(c??1));});log.end();results.push({suite,exitCode:code,seconds:Math.round((Date.now()-started)/100)/10});console.log(suite+': '+(code?'FAIL':'PASS'));}
 }finally{server?.kill();writeFileSync(root+'/test-results/results.json',JSON.stringify(results,null,2)+'\n');}
 process.exitCode=results.some(r=>r.exitCode)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
