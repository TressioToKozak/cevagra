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

ROOT = Path(__file__).resolve().parent


def connect(path):
    db = sqlite3.connect(path, timeout=10)
    db.execute('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS deleted_runs (id TEXT PRIMARY KEY)')
    db.execute('CREATE TABLE IF NOT EXISTS panel_sessions (token_hash TEXT PRIMARY KEY, expires REAL NOT NULL)')
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
        if route == '/panel':
            self.path = '/panel/index.html'
        if route in {'/api/leaderboard', '/api/panel/results'}:
            try:
                with connect(self.server.db_path) as db:
                    rows = [json.loads(row[0]) for row in db.execute('SELECT payload FROM runs')]
                    deleted = [row[0] for row in db.execute('SELECT id FROM deleted_runs')]
                if route == '/api/panel/results':
                    self.reply(200, {'runs': rows})
                else:
                    self.reply(200, {'runs': [{key: value for key, value in row.items() if key not in {'email', 'playerEmail'}} for row in rows], 'deleted': deleted})
            except sqlite3.Error:
                self.reply(503, {'error': 'Database unavailable'})
            return
        # Serve only public game files; never expose databases, source control or tests.
        path = Path(self.translate_path(self.path)).resolve()
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
        if self.path not in {'/api/leaderboard', '/api/panel/delete', '/api/panel/login', '/api/panel/logout'}:
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
                    db.executemany('INSERT OR IGNORE INTO deleted_runs (id) SELECT id FROM runs WHERE id = ?', [(id,) for id in ids])
                    db.executemany('DELETE FROM runs WHERE id = ?', [(id,) for id in ids])
                self.reply(200, {'deleted': len(ids)})
                return
            runs = data.get('runs')
            if not isinstance(runs, list) or len(runs) > 100 or not all(valid_run(run) for run in runs):
                raise ValueError()
        except sqlite3.Error:
            self.reply(503, {'error': 'Database unavailable'})
            return
        except (ValueError, AttributeError):
            self.reply(400, {'error': 'Invalid results'})
            return
        try:
            with connect(self.server.db_path) as db:
                db.executemany('INSERT OR IGNORE INTO runs (id, payload) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM deleted_runs WHERE id = ?)', [(run['id'], json.dumps(run, ensure_ascii=False), run['id']) for run in runs])
            self.reply(200, {'saved': [run['id'] for run in runs]})
        except sqlite3.Error:
            self.reply(503, {'error': 'Database unavailable'})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8002)
    parser.add_argument('--db', default=os.environ.get('LEADERBOARD_DB', str(ROOT / 'data' / 'leaderboard.sqlite3')))
    args = parser.parse_args()
    db_path = Path(args.db).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with connect(db_path):
        pass
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.db_path = db_path
    print(f'Game: http://{args.host}:{args.port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
