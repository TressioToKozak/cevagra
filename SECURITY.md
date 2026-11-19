# Secure deployment

The shared competition requires **Python 3.10+ and Node.js 22+**. Node reuses the
same task generators and scoring functions as the game; no additional packages
are needed for the server. Run `python3 server.py` behind a TLS reverse proxy.

Set these environment variables using a protected service environment file
(outside the public directory):

- `PANEL_USERNAME`: explicit administrator username.
- `PANEL_PASSWORD`: unique password of at least 12 characters; prefer a generated
  password of 32+ characters. Missing/short credentials disable administrator
  authentication. No account, password or offline login is built in.
- `PUBLIC_ORIGIN`: the canonical HTTPS origin, without a path or trailing query.
- Optionally `LEADERBOARD_DB`, `LEADERBOARD_BACKUP_DIR`, `BACKUP_TIMEZONE`.

`.env.example` contains empty placeholders; the application does not load `.env`
automatically. Keep actual secrets out of Git. Bind the backend to loopback or a
private network, terminate HTTPS at the proxy, preserve the public Host header,
and serve the UI and `/api/` from the same origin. Do not cache authenticated API
responses. Configure additional per-client throttling at the reverse proxy:
application IP limits use the transport peer, not untrusted forwarded headers.

Production cookies always use **Secure; HttpOnly; SameSite=Strict**. The request's
`X-Forwarded-Proto` cannot downgrade them. For local HTTP tests only, explicitly
run `python3 server.py --allow-insecure-localhost`; this option refuses public
bind addresses. Never use it in production. Existing administrator sessions are
revoked on the first security upgrade and when configured credentials change.

All Python-server responses include CSP, `X-Content-Type-Options: nosniff`, frame
protection and a referrer policy. HSTS is enabled in the secure configuration.
CSP allows inline **styles** because the CSS 3D game uses dynamic style values;
inline/evaluated scripts, plugins and embedding are blocked.

## Verified games

`POST /api/leaderboard` is retired (410). Browser/local-storage results are never
uploaded to the shared ranking. A ranked run requires:

1. A server-generated HttpOnly visitor session and server-generated game ID,
   seed, task set and stage order.
2. Sequential stage starts and live action checkpoints. Checkpoints have
   monotonically increasing sequence numbers and rotating random nonces.
3. Server-time bounds, freshness checks, body/event limits and legal input
   replay for all nine minigames. Memory phase timing, choices, parcel order,
   packing collisions, loading moves and film duration are validated.
4. Server-side score calculation and completion of every stage. The server
   supplies result IDs, timestamps, accuracy and totals. Duplicate final requests
   return the original result, and deleted results cannot be resurrected.

Historical rows are preserved for administrator export/backups. Rows without
`verification: server-v1` are excluded from the public shared ranking because
old client-submitted scores cannot be retrospectively verified. Local practice
results are labeled separately and cannot become official by reconnecting.

This prevents arbitrary score uploads and impossible/replayed gameplay claims.
It is **not proof of human play**: a browser game can still be automated with
legal actions. For prizes/high-stakes events, add organizer oversight or a
separate anti-bot/participant-verification policy.

## Statistics

Visitor identifiers are generated and stored by the server, not accepted from
the browser. Page reloads reuse the visitor cookie. The statistics endpoint
accepts visibility state only; client IDs and play durations are rejected.
Play time is credited from observed server time during active server stages,
bounded by the stage deadline and fresh heartbeat intervals. Idle/hidden and
long disconnected intervals are excluded. Heartbeat writes, new visitor
creation and login attempts are throttled. Test mode does not submit official
runs or activity statistics. Cookie-clearing/distributed bots remain subject
to the practical limitations of anonymous visit analytics.

## Hosting limitation

**GitHub Pages is static hosting. It does not execute `server.py`, set its
security headers, store server sessions or verify scores.** Serve the project
from the backend above (with HTTPS) for the real competition. Static hosting
runs local practice only; `/panel`, `/test` and `/tests` fail closed when server
authentication is unavailable. There is no offline administrator bypass.

Unknown extensionless routes such as `/d12` redirect to `/`. Private paths,
unknown assets and unknown API routes remain unavailable instead of exposing
source, databases or directory listings.

## Checks

- `node scripts/run-tests.cjs security game-proof verified-flow test-access statistics`
- `node scripts/run-tests.cjs` for the complete regression suite.

Tests create disposable databases and random administrator passwords. They
never require production credentials. The verified browser flow checks a full
competition and verifies that injected local scores do not reach the server.
