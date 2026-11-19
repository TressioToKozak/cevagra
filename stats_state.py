"""Resettable statistics: an imported baseline plus server-observed activity."""
import json
import time


def snapshot(db):
    row = db.execute("SELECT value FROM statistics_meta WHERE key='admin_baseline'").fetchone()
    base = json.loads(row[0]) if row else {}
    visits, play_ms = db.execute('SELECT COUNT(*),COALESCE(SUM(play_ms),0) FROM statistics_visits').fetchone()
    games = db.execute('SELECT COUNT(*) FROM statistics_runs').fetchone()[0]
    players = {}
    for player in base.get('players', []):
        key = (player['email'] or player['name']).strip().casefold()
        players[key] = dict(player)
    for name, email in db.execute('SELECT name,email FROM statistics_runs ORDER BY id'):
        key = (email or name).strip().casefold()
        if key:
            player = players.setdefault(key, {'name': name, 'email': email, 'count': 0})
            player['count'] += 1
    ordered = sorted(players.values(), key=lambda p: (-p['count'], p['name']))
    since = db.execute("SELECT value FROM statistics_meta WHERE key='since'").fetchone()
    return {'visits': base.get('visits', 0)+visits, 'playMs': base.get('playMs', 0)+play_ms, 'games': base.get('games', 0)+games, 'players': ordered, 'topPlayer': ordered[0] if ordered else None, 'since': since[0] if since else ''}


def replace(db, value):
    # Existing cookies remain valid, but visits and completions start a new epoch.
    db.execute('DELETE FROM statistics_visits')
    db.execute('DELETE FROM statistics_runs')
    db.execute("INSERT OR REPLACE INTO statistics_meta VALUES ('admin_baseline',?)", (json.dumps(value),))
    db.execute("INSERT OR REPLACE INTO statistics_meta VALUES ('since',?)", (value.get('since') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),))
    db.execute('UPDATE public_sessions SET seen=?,last_write=0', (time.time(),))
