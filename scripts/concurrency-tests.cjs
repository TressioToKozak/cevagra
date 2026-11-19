const {spawnSync}=require('node:child_process');
for(const args of [['python3',['scripts/concurrency-tests.py']],[process.execPath,['scripts/check-game-protocol.mjs']]]){const r=spawnSync(args[0],args[1],{stdio:'inherit'});if(r.status){process.exitCode=r.status;break;}}
