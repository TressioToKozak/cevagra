const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
exports.startBackend=async(options={})=>{
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ceva-secure-')),username='qa-admin',password=crypto.randomBytes(24).toString('hex');
 const env={...process.env,PANEL_USERNAME:username,PANEL_PASSWORD:password,...options.env};if(options.unconfigured){delete env.PANEL_PASSWORD;delete env.PANEL_USERNAME;}
 const child=spawn('python3',['server.py','--port',String(port),'--db',path.join(dir,'db.sqlite3'),'--backup-dir',path.join(dir,'backups'),...(options.secure?[]:['--allow-insecure-localhost'])],{cwd:path.resolve(__dirname,'..'),env,stdio:'ignore'});
 const origin=`http://127.0.0.1:${port}`;for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)return {origin,username,password,dir,db:path.join(dir,'db.sqlite3'),child,async close(){child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});}};}catch{}await new Promise(r=>setTimeout(r,50));}child.kill();throw Error('Backend failed to start');
};
