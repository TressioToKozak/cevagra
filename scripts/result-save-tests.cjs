const {spawnSync}=require('node:child_process');
const transport=spawnSync(process.execPath,['scripts/check-save-transport.mjs'],{stdio:'inherit'});if(transport.error)throw transport.error;if(transport.status!==0)process.exit(transport.status??1);
for(const mode of ['1','rejected']){const r=spawnSync(process.execPath,['scripts/verified-flow-tests.cjs'],{stdio:'inherit',env:{...process.env,SAVE_FAULTS:mode}});if(r.error)throw r.error;if(r.status!==0){process.exitCode=r.status??1;break;}}
