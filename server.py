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
from urllib.parse import urlsplit
from game_sessions import SCHEMA, APIError, handle as gameplay_api, limit as rate_limit
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
    db.executescript(SCHEMA)
    db.commit()
    return db


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
        if not os.environ.get('PANEL_USERNAME') or len(os.environ.get('PANEL_PASSWORD', '')) < 12:
            return False
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

    def make_cookie(self, name, token, age, path='/api/panel'):
        # TLS is deployment configuration, never an untrusted request header.
        local = getattr(self.server, 'allow_insecure_localhost', False)
        secure = '' if local else '; Secure'
        return f'{name}={token}; Path={path}; HttpOnly; SameSite=Strict; Max-Age={age}{secure}'

    def session_cookie(self, token, age):
        return self.make_cookie('ceva_panel_session', token, age)

    def end_headers(self):
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        if not getattr(self.server, 'allow_insecure_localhost', False):
            self.send_header('Strict-Transport-Security', 'max-age=31536000')
        super().end_headers()

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
        route = urlsplit(self.path).path.rstrip('/')
        if route == '/api/game/capabilities':
            self.reply(200, {'protocol': 1, 'verifiedScores': True})
            return
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
                    self.reply(200, {'runs': [{key: value for key, value in row.items() if key not in {'email', 'playerEmail', 'runSeed'}} for row in rows if row.get('verification') == 'server-v1'], 'deleted': deleted})
            except sqlite3.Error:
                self.reply(503, {'error': 'Database unavailable'})
            return
        # Serve only public game files; never expose databases, source control or tests.
        path = Path(self.translate_path(self.path)).resolve()
        if path in {self.server.db_path, Path(str(self.server.db_path)+'-wal'), Path(str(self.server.db_path)+'-shm')} or path.is_relative_to(self.server.backups.directory):
            self.send_error(404)
            return
        if path.is_relative_to(ROOT) and not any(part.startswith('.') for part in path.relative_to(ROOT).parts) and not path.exists() and not Path(route).suffix and route.split('/')[1:2] not in [['api'], ['assets'], ['data'], ['scripts'], ['work'], ['node_modules'], ['panel'], ['test'], ['tests']]:
            self.send_response(302)
            self.send_header('Location', '/')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
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
        if self.path not in {'/api/leaderboard', '/api/session', '/api/statistics', '/api/game/start', '/api/game/stage', '/api/game/events', '/api/game/end', '/api/game/finish', '/api/panel/delete', '/api/panel/login', '/api/panel/logout'}:
            self.reply(404, {'error': 'Not found'})
            return
        if self.path == '/api/leaderboard':
            self.reply(410, {'error': 'Direct score uploads disabled; use a verified game session'})
            return
        try:
            with connect(self.server.db_path) as db:
                rate_limit(db, ('login:' if self.path == '/api/panel/login' else 'write:')+self.client_address[0], 8 if self.path == '/api/panel/login' else 3000, 600 if self.path == '/api/panel/login' else 60, time.time())
        except APIError as error:
            self.reply(error.status, {'error': error.message})
            return
        except sqlite3.Error:
            self.reply(503, {'error': 'Database unavailable'})
            return
        origin = self.headers.get('Origin')
        expected = getattr(self.server, 'public_origin', None) or ('http' if getattr(self.server, 'allow_insecure_localhost', False) else 'https')+'://'+self.headers.get('Host', '')
        if origin and origin != expected:
            self.reply(403, {'error': 'Origin not allowed'})
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
            if self.path in {'/api/session', '/api/statistics', '/api/game/start', '/api/game/stage', '/api/game/events', '/api/game/end', '/api/game/finish'}:
                with connect(self.server.db_path) as db:
                    db.execute('BEGIN IMMEDIATE')
                    value, cookie = gameplay_api(db, self, self.path, data)
                self.reply(200, value, cookie)
                return
            if self.path == '/api/panel/login':
                if not isinstance(data, dict):
                    raise ValueError()
                username, password = data.get('username'), data.get('password')
                if not isinstance(username, str) or not isinstance(password, str):
                    raise ValueError()
                expected_user = os.environ.get('PANEL_USERNAME')
                expected_password = os.environ.get('PANEL_PASSWORD')
                if not expected_user or not expected_password or len(expected_password) < 12:
                    self.reply(503, {'error': 'Administrator sign-in is not configured'})
                    return
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
            self.reply(404, {'error': 'Not found'})
        except APIError as error:
            self.reply(error.status, {'error': error.message})
            return
        except (sqlite3.Error, OSError):
            self.reply(503, {'error': 'Backup or database unavailable; results have not been deleted'})
            return
        except (ValueError, AttributeError):
            self.reply(400, {'error': 'Invalid results'})
            return


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8002)
    parser.add_argument('--db', default=os.environ.get('LEADERBOARD_DB', str(ROOT / 'data' / 'leaderboard.sqlite3')))
    parser.add_argument('--backup-dir', default=os.environ.get('LEADERBOARD_BACKUP_DIR', str(ROOT / 'leaderboard backups')))
    parser.add_argument('--backup-timezone', default=os.environ.get('BACKUP_TIMEZONE', 'Europe/Berlin'))
    parser.add_argument('--allow-insecure-localhost', action='store_true', help='Development only: non-Secure cookies on loopback HTTP')
    parser.add_argument('--public-origin', default=os.environ.get('PUBLIC_ORIGIN'), help='Canonical HTTPS origin behind the TLS proxy')
    args = parser.parse_args()
    if args.allow_insecure_localhost and args.host not in {'127.0.0.1', '::1', 'localhost'}:
        parser.error('Insecure development cookies require a loopback bind address')
    if args.public_origin:
        origin = urlsplit(args.public_origin)
        if origin.scheme != 'https' or not origin.hostname or origin.username or origin.password or origin.query or origin.fragment or origin.path not in {'', '/'}:
            parser.error('PUBLIC_ORIGIN must be a canonical HTTPS origin')
    db_path = Path(args.db).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with connect(db_path) as db:
        epoch = hashlib.sha256((os.environ.get('PANEL_USERNAME', '')+'\0'+os.environ.get('PANEL_PASSWORD', '')).encode()).hexdigest()
        previous = db.execute("SELECT value FROM statistics_meta WHERE key='admin_auth_epoch_v2'").fetchone()
        if not previous or previous[0] != epoch:
            db.execute('DELETE FROM panel_sessions')
            db.execute("INSERT OR REPLACE INTO statistics_meta VALUES ('admin_auth_epoch_v2', ?)", (epoch,))
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.allow_insecure_localhost = args.allow_insecure_localhost
    server.public_origin = args.public_origin.rstrip('/') if args.public_origin else None
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
