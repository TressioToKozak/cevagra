"""Same-origin game server with persistent SQLite leaderboard (Python 3 only)."""
import argparse
import hashlib
import hmac
from http.cookies import SimpleCookie, CookieError
import secrets
import time
import json
import math
import os
from pathlib import Path
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from backups import BackupManager

ROOT = Path(__file__).resolve().parent


def connect(path):
    db = sqlite3.connect(path, timeout=10)
    db.execute('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS deleted_runs (id TEXT PRIMARY KEY)')
    db.execute('CREATE TABLE IF NOT EXISTS panel_sessions (token_hash TEXT PRIMARY KEY, expires REAL NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS statistics_visits (id TEXT PRIMARY KEY, play_ms INTEGER NOT NULL DEFAULT 0)')
    db.execute('CREATE TABLE IF NOT EXISTS statistics_runs (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS statistics_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    db.execute("INSERT OR IGNORE INTO statistics_meta VALUES ('since', ?)", (time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),))
    db.commit()
    return db


def valid_run(run):
    if not isinstance(run, dict):
        return False
    for key, limit in [('id', 200), ('name', 100), ('timestamp', 100)]:
        if not isinstance(run.get(key), str) or not 0 < len(run[key]) <= limit:
            return False
    for key, maximum in [('score', 1000), ('accuracy', 100), ('mistakes', 100000)]:
        value = run.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= maximum:
            return False
    return True


def statistics(db, rows):
    # Migrate pre-existing results without inventing historical visits or play time.
    db.executemany('INSERT OR IGNORE INTO statistics_runs VALUES (?, ?, ?)', [(r['id'], r.get('name', ''), r.get('email', '') or '') for r in rows])
    visits, play_ms = db.execute('SELECT COUNT(*), COALESCE(SUM(play_ms), 0) FROM statistics_visits').fetchone()
    games = db.execute('SELECT COUNT(*) FROM statistics_runs').fetchone()[0]
    players = {}
    for name, email in db.execute('SELECT name, email FROM statistics_runs ORDER BY id'):
        key = (email or name).strip().casefold()
        if key:
            player = players.setdefault(key, {'name': name, 'email': email, 'count': 0})
            player['count'] += 1
    top = sorted(players.values(), key=lambda p: (-p['count'], p['name']))
    return {'visits': visits, 'playMs': play_ms, 'games': games, 'topPlayer': top[0] if top else None, 'since': db.execute("SELECT value FROM statistics_meta WHERE key = 'since'").fetchone()[0]}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def authenticated(self):
        try:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            token = cookie.get('ceva_panel_session')
            if not token:
                return False
            token_hash = hashlib.sha256(token.value.encode()).hexdigest()
            with connect(self.server.db_path) as db:
                return db.execute('SELECT 1 FROM panel_sessions WHERE token_hash = ? AND expires > ?', (token_hash, time.time())).fetchone() is not None
        except (sqlite3.Error, ValueError, CookieError):
            return False

    def session_cookie(self, token, age):
        secure = '; Secure' if self.headers.get('X-Forwarded-Proto', '').lower() == 'https' else ''
        return f'ceva_panel_session={token}; Path=/api/panel; HttpOnly; SameSite=Strict; Max-Age={age}{secure}'

    def reply(self, status, value, cookie=None):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = self.path.split('?')[0].rstrip('/')
        if route == '/api/panel/session':
            self.reply(200 if self.authenticated() else 401, {'authenticated': self.authenticated()})
            return
        if route.startswith('/api/panel/') and not self.authenticated():
            self.reply(401, {'error': 'Sign in required'})
            return
        if route in {'/test', '/tests'}:
            self.path = route + '/index.html'
        if route == '/panel':
            self.path = '/panel/index.html'
        if route in {'/api/leaderboard', '/api/panel/results'}:
            try:
                with connect(self.server.db_path) as db:
                    rows = [json.loads(row[0]) for row in db.execute('SELECT payload FROM runs')]
                    deleted = [row[0] for row in db.execute('SELECT id FROM deleted_runs')]
                    stats = statistics(db, rows) if route == '/api/panel/results' else None
                if route == '/api/panel/results':
                    self.reply(200, {'runs': rows, 'statistics': stats})
                else:
                    self.reply(200, {'runs': [{key: value for key, value in row.items() if key not in {'email', 'playerEmail'}} for row in rows], 'deleted': deleted})
            except sqlite3.Error:
                self.reply(503, {'error': 'Database unavailable'})
            return
        # Serve only public game files; never expose databases, source control or tests.
        path = Path(self.translate_path(self.path)).resolve()
        if path.is_relative_to(self.server.backups.directory):
            self.send_error(404)
            return
        if not path.is_relative_to(ROOT) or any(part.startswith('.') for part in path.relative_to(ROOT).parts) or (path != ROOT and path.parts[len(ROOT.parts)] not in {'assets'} and path.suffix not in {'.html', '.css', '.js', '.webmanifest', '.ico'}):
            self.send_error(404)
            return
        if path.is_dir() and path != ROOT:
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        self.send_error(405)

    def do_POST(self):
        if self.path not in {'/api/leaderboard', '/api/statistics', '/api/panel/delete', '/api/panel/login', '/api/panel/logout'}:
            self.reply(404, {'error': 'Not found'})
            return
        # JSON-only, same-origin requests; no permissive CORS.
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json' or self.headers.get('Sec-Fetch-Site') == 'cross-site':
            self.reply(403, {'error': 'Forbidden'})
            return
        if self.path in {'/api/panel/delete', '/api/panel/logout'} and not self.authenticated():
            self.reply(401, {'error': 'Sign in required'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1_000_000:
                raise ValueError()
            data = json.loads(self.rfile.read(length))
            if self.path == '/api/statistics':
                visit_id, play_ms = data.get('id'), data.get('playMs')
                if not isinstance(visit_id, str) or not 0 < len(visit_id) <= 200 or type(play_ms) is not int or not 0 <= play_ms <= 31536000000:
                    raise ValueError()
                with connect(self.server.db_path) as db:
                    db.execute('INSERT INTO statistics_visits VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET play_ms = MAX(play_ms, excluded.play_ms)', (visit_id, play_ms))
                self.reply(200, {'saved': True})
                return
            if self.path == '/api/panel/login':
                if not isinstance(data, dict):
                    raise ValueError()
                username, password = data.get('username'), data.get('password')
                if not isinstance(username, str) or not isinstance(password, str):
                    raise ValueError()
                expected_user = os.environ.get('PANEL_USERNAME', 'ceva')
                expected_password = os.environ.get('PANEL_PASSWORD', 'ceva')
                if not (hmac.compare_digest(username.encode(), expected_user.encode()) and hmac.compare_digest(password.encode(), expected_password.encode())):
                    self.reply(401, {'error': 'Incorrect username or password.'})
                    return
                token = secrets.token_urlsafe(32)
                with connect(self.server.db_path) as db:
                    db.execute('DELETE FROM panel_sessions WHERE expires <= ?', (time.time(),))
                    db.execute('INSERT INTO panel_sessions VALUES (?, ?)', (hashlib.sha256(token.encode()).hexdigest(), time.time() + 28800))
                self.reply(200, {'authenticated': True}, self.session_cookie(token, 28800))
                return
            if self.path == '/api/panel/logout':
                cookie = SimpleCookie(self.headers.get('Cookie', ''))
                token = cookie.get('ceva_panel_session')
                if token:
                    with connect(self.server.db_path) as db:
                        db.execute('DELETE FROM panel_sessions WHERE token_hash = ?', (hashlib.sha256(token.value.encode()).hexdigest(),))
                self.reply(200, {'authenticated': False}, self.session_cookie('', 0))
                return
            if self.path == '/api/panel/delete':
                if not isinstance(data, dict) or data.get('confirmation') != 'DELETE':
                    raise ValueError()
                ids = data.get('ids')
                if not isinstance(ids, list) or len(ids) > 100000 or not all(isinstance(id, str) and 0 < len(id) <= 200 for id in ids):
                    raise ValueError()
                with connect(self.server.db_path) as db:
                    db.execute('BEGIN IMMEDIATE')
                    statistics(db, [json.loads(row[0]) for row in db.execute('SELECT payload FROM runs')])
                    selected = set(ids)
                    deleted_rows = [json.loads(row[0]) for row in db.execute('SELECT payload FROM runs') if json.loads(row[0]).get('id') in selected]
                    backup = self.server.backups.create(deleted_rows) if deleted_rows else None
                    db.executemany('INSERT OR IGNORE INTO deleted_runs (id) SELECT id FROM runs WHERE id = ?', [(id,) for id in ids])
                    db.executemany('DELETE FROM runs WHERE id = ?', [(id,) for id in ids])
                self.reply(200, {'deleted': len(deleted_rows), 'backup': backup})
                return
            runs = data.get('runs')
            if not isinstance(runs, list) or len(runs) > 100 or not all(valid_run(run) for run in runs):
                raise ValueError()
        except (sqlite3.Error, OSError):
            self.reply(503, {'error': 'Backup or database unavailable; results have not been deleted'})
            return
        except (ValueError, AttributeError):
            self.reply(400, {'error': 'Invalid results'})
            return
        try:
            with connect(self.server.db_path) as db:
                db.executemany('INSERT OR IGNORE INTO runs (id, payload) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM deleted_runs WHERE id = ?)', [(run['id'], json.dumps(run, ensure_ascii=False), run['id']) for run in runs])
                statistics(db, [json.loads(row[0]) for row in db.execute('SELECT payload FROM runs')])
            self.reply(200, {'saved': [run['id'] for run in runs]})
        except sqlite3.Error:
            self.reply(503, {'error': 'Database unavailable'})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8002)
    parser.add_argument('--db', default=os.environ.get('LEADERBOARD_DB', str(ROOT / 'data' / 'leaderboard.sqlite3')))
    parser.add_argument('--backup-dir', default=os.environ.get('LEADERBOARD_BACKUP_DIR', str(ROOT / 'leaderboard backups')))
    parser.add_argument('--backup-timezone', default=os.environ.get('BACKUP_TIMEZONE', 'Europe/Berlin'))
    args = parser.parse_args()
    db_path = Path(args.db).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with connect(db_path):
        pass
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.db_path = db_path
    server.backups = BackupManager(db_path, args.backup_dir, args.backup_timezone)
    server.backups.start()
    print(f'Game: http://{args.host}:{args.port}', flush=True)
    try:
        server.serve_forever()
    finally:
        server.backups.stopped.set()
        server.server_close()


if __name__ == '__main__':
    main()
