"""Security regressions for pooled verification, SQLite races and receipt clocks."""
import concurrent.futures
import http.cookiejar
import json
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import urllib.request
import urllib.error
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import server
from backups import BackupManager
from game_sessions import APIError, limit, worker
from verifier_pool import VerifierPool, InvalidTrace, default_workers


class DatabaseConcurrency(unittest.TestCase):
    def test_wal_full_and_atomic_limits(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'test.sqlite3'
            with server.database(path) as db:
                self.assertEqual(db.execute('PRAGMA journal_mode').fetchone()[0],'wal')
                self.assertEqual(db.execute('PRAGMA synchronous').fetchone()[0],2)
            def attempt(_):
                try:
                    with server.database(path) as db:limit(db,'atomic-login',8,600,1000)
                    return True
                except APIError as error:
                    self.assertEqual(error.status,429)
                    return False
            with concurrent.futures.ThreadPoolExecutor(max_workers=32) as pool:
                allowed=list(pool.map(attempt,range(50)))
            self.assertEqual(sum(allowed),8)
            with server.database(path) as db:
                self.assertEqual(db.execute('SELECT count FROM request_limits').fetchone()[0],8)
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')

    def test_workers_are_reused_and_invalid_trace_does_not_poison_next_job(self):
        pool=VerifierPool(workers=2)
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=20) as threads:
                plans=list(threads.map(lambda i:pool.call({'op':'plan','seed':'pooled-'+str(i)}),range(40)))
            self.assertEqual(len(plans),40)
            self.assertLessEqual(len(pool.processes),2)
            pids={p.pid for p in pool.processes}
            with self.assertRaises(InvalidTrace):pool.call({'op':'replay','elapsed':0,'events':[]})
            self.assertEqual(pool.call({'op':'plan','seed':'pooled-0'}),plans[0])
            self.assertEqual({p.pid for p in pool.processes},pids)
        finally:pool.close()


    def test_dead_worker_is_replaced_before_next_verification(self):
        pool=VerifierPool(workers=1)
        try:
            expected=pool.call({'op':'plan','seed':'restart-check'})
            dead=next(iter(pool.processes));dead.kill();dead.wait(timeout=2)
            self.assertEqual(pool.call({'op':'plan','seed':'restart-check'}),expected)
            self.assertEqual(len(pool.processes),1)
            self.assertNotEqual(next(iter(pool.processes)).pid,dead.pid)
        finally:pool.close()


class HTTPConcurrency(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.path=Path(self.temp.name)/'db.sqlite3'
        with server.database(self.path):pass
        self.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        self.http.db_path=self.path;self.http.allow_insecure_localhost=True
        self.http.backups=BackupManager(self.path,Path(self.temp.name)/'backups')
        self.http.statistics_backups=BackupManager(self.path,Path(self.temp.name)/'backups/statistics',kind='statistics')
        self.addCleanup(self.http.server_close);self.addCleanup(self.http.shutdown)
        threading.Thread(target=self.http.serve_forever,daemon=True).start()
        self.origin=f'http://127.0.0.1:{self.http.server_port}'
        self.client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.post('/api/session',{})

    def post(self,route,data):
        req=urllib.request.Request(self.origin+route,json.dumps(data).encode(),{'Content-Type':'application/json'})
        try:
            with self.client.open(req,timeout=8) as response:return response.status,json.load(response)
        except urllib.error.HTTPError as error:return error.code,json.load(error)

    def start(self):
        code,data=self.post('/api/game/start',{'name':'Concurrency QA','email':'race@example.test'})
        self.assertEqual(code,200,data)
        return data

    def age(self,game,seconds):
        with server.database(self.path) as db:
            state=json.loads(db.execute('SELECT state FROM game_sessions WHERE id=?',(game['id'],)).fetchone()[0])
            state['started']=time.time()-seconds
            db.execute('UPDATE game_sessions SET state=? WHERE id=?',(json.dumps(state),game['id']))

    def test_verification_does_not_hold_the_database_writer(self):
        entered=threading.Event();release=threading.Event();original=server.worker
        def slow(data):entered.set();release.wait(4);return original(data)
        with patch.object(server,'worker',side_effect=slow),concurrent.futures.ThreadPoolExecutor() as pool:
            future=pool.submit(self.start)
            self.assertTrue(entered.wait(3))
            try:
                with sqlite3.connect(self.path,timeout=.1) as db:
                    db.execute('BEGIN IMMEDIATE')
                    db.execute("INSERT INTO statistics_meta VALUES ('writer-unblocked','yes')")
                self.assertFalse(future.done())
            finally:release.set()
            self.assertIn('id',future.result(timeout=5))

    def test_checkpoint_race_cannot_overwrite_new_events_or_advance_twice(self):
        game=self.start();config=game['configs'][0]
        code,stage=self.post('/api/game/stage',{'gameId':game['id'],'id':config['id']});self.assertEqual(code,200)
        self.age(game,config['time']+.02)
        entered=threading.Event();release=threading.Event();original=server.worker
        def slow(data):entered.set();release.wait(4);return original(data)
        with patch.object(server,'worker',side_effect=slow),concurrent.futures.ThreadPoolExecutor() as pool:
            future=pool.submit(self.post,'/api/game/end',{'gameId':game['id'],'nonce':stage['nonce']})
            self.assertTrue(entered.wait(3))
            try:
                code,checkpoint=self.post('/api/game/events',{'gameId':game['id'],'nonce':stage['nonce'],'seq':1,'events':[{'type':'submit','at':config['time']*1000}]})
                self.assertEqual(code,200,checkpoint)
            finally:release.set()
            code,_=future.result(timeout=5);self.assertEqual(code,409)
        with server.database(self.path) as db:
            state=json.loads(db.execute('SELECT state FROM game_sessions WHERE id=?',(game['id'],)).fetchone()[0])
        self.assertTrue(state['active']);self.assertEqual(state['index'],0);self.assertEqual(state['seq'],1);self.assertEqual(len(state['events']),1)
        self.assertEqual(self.post('/api/game/end',{'gameId':game['id'],'nonce':stage['nonce']})[0],409)

    def test_identical_receipts_recover_acknowledgements_without_accepting_changed_payloads(self):
        game=self.start()
        for config in game['configs'][:-1]:
            code,stage=self.post('/api/game/stage',{'gameId':game['id'],'id':config['id']});self.assertEqual(code,200)
            self.age(game,config['time']+.01)
            self.assertEqual(self.post('/api/game/end',{'gameId':game['id'],'nonce':stage['nonce']})[0],200)
        task=game['tasks']['final']
        code,stage=self.post('/api/game/stage',{'gameId':game['id'],'id':'final'});self.assertEqual(code,200)
        events=[{'type':'toggle','value':v,'at':0} for v in task['solution']]+[{'type':'submit','action':task['action'],'at':0}]
        payload={'gameId':game['id'],'nonce':stage['nonce'],'seq':1,'events':events}
        code,checkpoint=self.post('/api/game/events',payload);self.assertEqual(code,200)
        self.assertEqual(self.post('/api/game/events',payload),(200,checkpoint))
        changed={**payload,'events':[dict(e,at=1) for e in events]}
        self.assertEqual(self.post('/api/game/events',changed)[0],409)
        end={'gameId':game['id'],'nonce':checkpoint['nonce']}
        code,result=self.post('/api/game/end',end);self.assertEqual(code,200,result)
        with server.database(self.path) as db:before=db.execute('SELECT state FROM game_sessions WHERE id=?',(game['id'],)).fetchone()[0]
        self.assertEqual(self.post('/api/game/end',end),(200,result))
        self.assertEqual(self.post('/api/game/end',{**end,'nonce':'forged'})[0],409)
        with server.database(self.path) as db:after=db.execute('SELECT state FROM game_sessions WHERE id=?',(game['id'],)).fetchone()[0]
        self.assertEqual(before,after)
        self.assertEqual(len(json.loads(after)['events']),len(events))
        self.assertEqual(json.loads(after)['index'],9)
        self.assertEqual(len(json.loads(after)['results']),9)
        # Possessing a receipt cannot substitute for the owner's HttpOnly cookie.
        outsider=urllib.request.Request(self.origin+'/api/game/end',json.dumps(end).encode(),{'Content-Type':'application/json'})
        with self.assertRaises(urllib.error.HTTPError) as rejected:urllib.request.urlopen(outsider)
        self.assertEqual(rejected.exception.code,401)

    def test_server_received_completion_keeps_score_while_database_is_busy(self):
        game=self.start()
        # Advance timed-out stages in a controlled fixture; the final stage uses live HTTP.
        for config in game['configs'][:-1]:
            code,stage=self.post('/api/game/stage',{'gameId':game['id'],'id':config['id']});self.assertEqual(code,200)
            self.age(game,config['time']+.01)
            code,result=self.post('/api/game/end',{'gameId':game['id'],'nonce':stage['nonce']});self.assertEqual(code,200,result)
        config=game['configs'][-1];task=game['tasks']['final']
        code,stage=self.post('/api/game/stage',{'gameId':game['id'],'id':'final'});self.assertEqual(code,200)
        events=[{'type':'toggle','value':value,'at':0} for value in task['solution']]+[{'type':'submit','action':task['action'],'at':0}]
        code,checkpoint=self.post('/api/game/events',{'gameId':game['id'],'nonce':stage['nonce'],'seq':1,'events':events});self.assertEqual(code,200,checkpoint)
        with server.database(self.path) as db:
            state=json.loads(db.execute('SELECT state FROM game_sessions WHERE id=?',(game['id'],)).fetchone()[0])
        completion=state['last_received']-state['started']
        expected=worker({'op':'replay','config':config,'task':task,'events':events,'elapsed':completion,'completionElapsed':completion})['score']
        entered=threading.Event();original=server.rate_limit
        def observed(*args):entered.set();return original(*args)
        lock=sqlite3.connect(self.path);lock.execute('BEGIN IMMEDIATE')
        try:
            with patch.object(server,'rate_limit',side_effect=observed),concurrent.futures.ThreadPoolExecutor() as pool:
                future=pool.submit(self.post,'/api/game/end',{'gameId':game['id'],'nonce':checkpoint['nonce']})
                self.assertTrue(entered.wait(2));time.sleep(.7)
                lock.commit()
                code,result=future.result(timeout=5);self.assertEqual(code,200,result);self.assertEqual(result['result']['score'],expected)
        finally:lock.close()
        # Neither a claimed clock nor a claimed score can enter this path.
        self.assertEqual(self.post('/api/game/finish',{'gameId':game['id'],'completionElapsed':0})[0],400)
        self.assertEqual(self.post('/api/game/finish',{'gameId':game['id'],'score':1000})[0],400)


if __name__=='__main__':unittest.main()
