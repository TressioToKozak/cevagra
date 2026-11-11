import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resultsWorkbook} from '../excel.js';
const file=resultsWorkbook([{name:'Łukasz & <Anna>',email:'=1+1',score:650},{name:'李雷',email:'test@example.com',score:1000}]);
assert.equal(file.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
const result=spawnSync('python3',['-c',`
import io,sys,zipfile,xml.etree.ElementTree as ET
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:
 assert archive.testzip() is None
 for path in archive.namelist(): ET.fromstring(archive.read(path))
 ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
 sheet=ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
 assert sheet.find('.//s:c[@r="A2"]/s:is/s:t',ns).text=='Łukasz & <Anna>'
 assert sheet.find('.//s:c[@r="B2"]/s:is/s:t',ns).text=='=1+1'
 assert sheet.find('.//s:c[@r="C2"]/s:v',ns).text=='650'
 assert sheet.find('.//s:f',ns) is None
 assert len(sheet.findall('.//s:row',ns))==3
print('PASS: XLSX package, CRCs, XML, Unicode, numeric points and safe text cells')
`],{input:Buffer.from(await file.arrayBuffer()),encoding:'utf8'});
assert.equal(result.status,0,result.stderr);console.log(result.stdout.trim());
