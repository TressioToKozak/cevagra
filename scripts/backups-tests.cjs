const {spawnSync}=require('node:child_process');
for(const file of ['scripts/backup-tests.py','scripts/admin-data-tests.py']){const result=spawnSync('python3',[file],{stdio:'inherit'});if(result.status){process.exitCode=result.status;break;}}
