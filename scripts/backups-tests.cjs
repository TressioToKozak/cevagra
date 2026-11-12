const {spawnSync}=require('node:child_process');
const result=spawnSync('python3',['scripts/backup-tests.py'],{stdio:'inherit'});
process.exitCode=result.status??1;
