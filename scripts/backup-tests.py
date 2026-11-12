import http.cookiejar
from datetime import datetime, timedelta
from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
from threading import Thread
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
from xml.etree import ElementTree as ET
from zipfile import ZipFile
from zoneinfo import ZoneInfo
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backups import BackupManager, workbook
from server import Handler, ThreadingHTTPServer, connect


def sheet_values(payload):
    with ZipFile(BytesIO(payload)) as archive:
        assert archive.testzip() is None
        for name in archive.namelist():
            ET.fromstring(archive.read(name))
        sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        return [node.text for node in sheet.findall('.//s:t', ns)], [node.text for node in sheet.findall('.//s:v', ns)]


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Path(self.temp.name) / 'runs.sqlite3'
        self.directory = Path(self.temp.name) / 'leaderboard backups'
        self.rows = [{'id': 'run-1', 'name': 'Łukasz & Anna', 'email': '=text@example.com', 'score': 650, 'accuracy': 90, 'mistakes': 1, 'timestamp': '2026-12-27T12:00:00Z'}, {'id': 'run-2', 'name': 'Marta', 'email': 'm@example.com', 'score': 800, 'accuracy': 95, 'mistakes': 0, 'timestamp': '2026-12-27T12:01:00Z'}]
        with connect(self.db) as db:
            db.executemany('INSERT INTO runs VALUES (?, ?)', [(r['id'], json.dumps(r)) for r in self.rows])
        self.manager = BackupManager(self.db, self.directory)
        self.now = datetime(2026, 12, 27, 23, 59, tzinfo=ZoneInfo('Europe/Berlin'))

    def test_xlsx_preserves_data_and_text(self):
        strings, numbers = sheet_values(workbook(self.rows))
        self.assertIn('Łukasz & Anna', strings)
        self.assertIn('=text@example.com', strings)
        self.assertEqual(numbers, ['800', '650'])

    def test_manual_names_never_overwrite(self):
        first = self.manager.create(self.rows, now=self.now)
        second = self.manager.create(self.rows[:1], now=self.now)
        self.assertEqual(first, 'Leaderboard - 27.12.2026.xlsx')
        self.assertEqual(second, 'Leaderboard - 27.12.2026 (2).xlsx')
        self.assertEqual(len(sheet_values((self.directory / first).read_bytes())[1]), 2)

    def test_midnight_once_per_day_and_restart_catchup(self):
        first = self.manager.daily(now=self.now)
        original = (self.directory / first).read_bytes()
        with connect(self.db) as db:
            db.execute('DELETE FROM runs WHERE id = ?', ('run-1',))
        restarted = BackupManager(self.db, self.directory)
        self.assertEqual(restarted.daily(now=self.now), first)
        self.assertEqual((self.directory / first).read_bytes(), original)
        second = restarted.daily(now=self.now + timedelta(minutes=1))
        self.assertEqual(first, 'Leaderboard BackUp - 27.12.2026.xlsx')
        self.assertEqual(second, 'Leaderboard BackUp - 28.12.2026.xlsx')
        self.assertEqual(sheet_values((self.directory / second).read_bytes())[1], ['800'])
        self.assertEqual(len(list(self.directory.glob('*.xlsx'))), 2)

    def test_delete_api_requires_successful_disk_backup(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.db_path, server.backups = self.db, self.manager
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        origin = f'http://127.0.0.1:{server.server_port}'
        client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        def post(path, data):
            request = urllib.request.Request(origin + path, json.dumps(data).encode(), {'Content-Type': 'application/json'})
            return json.load(client.open(request))
        post('/api/panel/login', {'username': 'ceva', 'password': 'ceva'})
        response = post('/api/panel/delete', {'confirmation': 'DELETE', 'ids': ['run-1']})
        self.assertTrue((self.directory / response['backup']).exists())
        self.assertEqual(sheet_values((self.directory / response['backup']).read_bytes())[1], ['650'])
        with patch.object(self.manager, 'create', side_effect=OSError('disk unavailable')):
            with self.assertRaises(urllib.error.HTTPError) as raised:
                post('/api/panel/delete', {'confirmation': 'DELETE', 'ids': ['run-2']})
            self.assertEqual(raised.exception.code, 503)
        with connect(self.db) as db:
            self.assertEqual(db.execute('SELECT id FROM runs').fetchall(), [('run-2',)])
            self.assertIsNone(db.execute('SELECT id FROM deleted_runs WHERE id = ?', ('run-2',)).fetchone())


if __name__ == '__main__':
    unittest.main()
