import base64
from datetime import datetime, timedelta
from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
from threading import Thread
import secrets
import unittest
from unittest.mock import patch
import urllib.request
import urllib.error
import http.cookiejar
from zipfile import ZipFile, ZIP_DEFLATED
from zoneinfo import ZoneInfo
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from server import Handler, ThreadingHTTPServer, connect, statistics
from backups import BackupManager
from excel_io import export_book, archive_data, read_table


class AdminDataTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.db=Path(self.temp.name)/'db.sqlite3';connect(self.db).close()
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        self.server.db_path=self.db;self.server.allow_insecure_localhost=True
        self.server.backups=BackupManager(self.db,Path(self.temp.name)/'backups')
        self.server.statistics_backups=BackupManager(self.db,Path(self.temp.name)/'backups/statistics',kind='statistics')
        self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
        Thread(target=self.server.serve_forever,daemon=True).start()
        self.origin=f'http://127.0.0.1:{self.server.server_port}'
        self.client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        password=secrets.token_urlsafe(32);credentials=patch.dict('os.environ',{'PANEL_USERNAME':'qa','PANEL_PASSWORD':password});credentials.start();self.addCleanup(credentials.stop)
        self.post('login',{'username':'qa','password':password})
        self.old={'id':'old','name':'Existing','email':'old@example.com','score':850,'verification':'server-v1','hidden':False,'accuracy':94,'minigameScores':{'picking':90}}
        with connect(self.db) as db:
            db.execute('INSERT INTO runs VALUES (?,?)',('old',json.dumps(self.old)))
            db.execute("INSERT INTO statistics_visits VALUES ('visit',1234)")
            db.execute("INSERT INTO statistics_runs VALUES ('old','Existing','old@example.com')")

    def post(self,path,data):
        req=urllib.request.Request(self.origin+'/api/panel/'+path,json.dumps(data).encode(),{'Content-Type':'application/json'})
        return json.load(self.client.open(req))
    def get(self,path): return json.load(self.client.open(self.origin+'/api/panel/'+path))
    def upload(self,kind,data): return {'kind':kind,'file':base64.b64encode(export_book(kind,data)).decode()}
    def assert_status(self,code,fn):
        with self.assertRaises(urllib.error.HTTPError) as e:fn()
        self.assertEqual(e.exception.code,code)

    def test_visibility_persists_and_is_enforced_by_public_api(self):
        self.post('visibility',{'id':'old','hidden':True})
        self.assertEqual(json.load(urllib.request.urlopen(self.origin+'/api/leaderboard'))['runs'],[])
        self.assertTrue(self.get('results')['runs'][0]['hidden'])
        self.post('visibility',{'id':'old','hidden':False})
        self.assertEqual(len(json.load(urllib.request.urlopen(self.origin+'/api/leaderboard'))['runs']),1)
        self.assert_status(401,lambda:urllib.request.urlopen(urllib.request.Request(self.origin+'/api/panel/visibility',b'{"id":"old","hidden":true}',{'Content-Type':'application/json'})))

    def test_import_preview_atomic_backup_and_private_archive(self):
        upload=self.upload('leaderboard',[{'name':'New <person>','email':'new@example.com','score':720,'hidden':True}])
        preview=self.post('import-preview',upload);self.assertEqual(preview['data'][0]['score'],720)
        self.assertEqual(self.get('results')['runs'][0]['id'],'old')
        self.assert_status(400,lambda:self.post('import',upload))
        result=self.post('import',{**upload,'confirmation':'REPLACE'})
        self.assertEqual(self.get('results')['runs'][0]['name'],'New <person>')
        file=self.server.backups.directory/result['backup']
        self.assertEqual(archive_data(file.read_bytes(),'leaderboard'),[self.old])
        self.assertTrue(self.get('backups?kind=leaderboard')['files'])
        self.assertEqual(self.get('backup?kind=leaderboard&name='+urllib.parse.quote(result['backup']))['data'],[self.old])
        for path in ['backups?kind=statistics','backup/download?kind=leaderboard&name='+urllib.parse.quote(result['backup'])]:
            self.assert_status(401,lambda path=path:urllib.request.urlopen(self.origin+'/api/panel/'+path))
        self.assert_status(400,lambda:self.get('backup?kind=leaderboard&name=../secret.xlsx'))
        self.assert_status(400,lambda:self.get('backups?kind=other'))
        self.assertEqual(self.get('results')['statistics']['games'],1,'leaderboard imports do not invent played games')

    def test_statistics_import_reset_restore_and_midnight(self):
        original=self.get('results')['statistics'];self.assertEqual(original['games'],1)
        reset=self.post('statistics/reset',{'confirmation':'RESET'})
        for _ in range(2):
            current=self.get('results');self.assertEqual(current['statistics']['games'],0);self.assertEqual(current['statistics']['visits'],0);self.assertEqual(len(current['runs']),1)
        file=self.server.statistics_backups.directory/reset['backup']
        self.assertEqual(archive_data(file.read_bytes(),'statistics')['playMs'],1234)
        self.post('import',{**self.upload('statistics',original),'confirmation':'REPLACE'})
        self.assertEqual(self.get('results')['statistics'],original)
        with connect(self.db) as db:
            db.execute("INSERT INTO statistics_runs VALUES ('new','New player','new@example.com')")
        self.assertEqual(self.get('results')['statistics']['games'],2)
        now=datetime(2026,12,27,23,59,tzinfo=ZoneInfo('Europe/Berlin'));m=self.server.statistics_backups
        first=m.daily(now=now);self.assertEqual(m.daily(now=now),first)
        second=m.daily(now=now+timedelta(minutes=1));self.assertNotEqual(first,second)
        self.assertEqual(archive_data((m.directory/second).read_bytes(),'statistics')['games'],2)
        restarted=BackupManager(self.db,m.directory,kind='statistics');self.assertEqual(restarted.daily(now=now),first)

    def test_disk_failure_and_invalid_upload_never_replace_data(self):
        upload=self.upload('leaderboard',[{'name':'New','email':'new@example.com','score':500}])
        with patch.object(self.server.backups,'create',side_effect=OSError('disk full')):
            self.assert_status(503,lambda:self.post('import',{**upload,'confirmation':'REPLACE'}))
        with patch.object(self.server.statistics_backups,'create',side_effect=OSError('disk full')):
            self.assert_status(503,lambda:self.post('statistics/reset',{'confirmation':'RESET'}))
            stats=self.get('results')['statistics']
            self.assert_status(503,lambda:self.post('import',{**self.upload('statistics',stats),'confirmation':'REPLACE'}))
        invalids=[{'kind':'leaderboard','file':'bad'},self.upload('leaderboard',[{'name':'No','email':'n@example.com','score':1001}]),self.upload('statistics',{'visits':0,'playMs':-1,'games':0,'players':[]})]
        for upload in invalids:self.assert_status(400,lambda upload=upload:self.post('import',{**upload,'confirmation':'REPLACE'}))
        self.assertEqual(self.get('results')['runs'],[self.old]);self.assertEqual(self.get('results')['statistics']['games'],1)

    def test_shared_strings_formulas_and_zip_limits(self):
        raw=export_book('leaderboard',[{'name':'Łukasz','email':'l@example.com','score':640}])
        with ZipFile(BytesIO(raw)) as z: files={n:z.read(n) for n in z.namelist()}
        sheet=files['xl/worksheets/sheet1.xml'].decode().replace('<c r="A2" t="inlineStr"><is><t xml:space="preserve">Łukasz</t></is></c>','<c r="A2" t="s"><v>0</v></c>')
        files['xl/worksheets/sheet1.xml']=sheet.encode();files['xl/sharedStrings.xml']=b'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Shared name</t></si></sst>'
        def pack():
            out=BytesIO()
            with ZipFile(out,'w',ZIP_DEFLATED) as z:
                for n,v in files.items():z.writestr(n,v)
            return out.getvalue()
        self.assertEqual(read_table(pack())[1][0],'Shared name')
        files['xl/worksheets/sheet1.xml']=sheet.replace('<v>640</v>','<f>1000+1</f><v>640</v>').encode()
        with self.assertRaises(ValueError):read_table(pack())
        files['huge.xml']=b' '*24_000_001
        with self.assertRaises(ValueError):read_table(pack())

if __name__=='__main__':unittest.main()
