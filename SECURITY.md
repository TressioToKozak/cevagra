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
- `VERIFIER_WORKERS` optionally selects 1–4 persistent Node workers. The default
  follows the available CPU quota, capped at four (four workers on a 4-vCPU VPS).

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

## Administrator imports, visibility and archives

The old `?organizer=1` tools and the public `?seed=` override have been removed.
All administrative data changes require the server administrator session.

- **Upload Leaderboard** accepts `.xlsx` (up to 5 MB and 20,000 participant rows).
  Required columns are `Name`, `Email`, `Points` (0–1000). The optional `Hidden`
  column accepts Yes/No. Export Excel downloads a compatible workbook.
- Imports show a preview before replacement. The server validates the workbook
  again, saves the complete previous dataset to disk, and replaces it in one
  database transaction. A backup failure leaves the existing data intact.
  Imported entries are explicitly marked `admin-import`, rather than claiming
  to be server-verified gameplay. Importing a leaderboard does not create games
  or play time in statistics.
- The eye button changes public visibility of one result. Hidden results stay
  in the administrator table, exports and backups; the public API excludes them.
- **BackUps** lists private server workbooks. Open displays a read-only preview
  inside the page; Download retrieves the actual `.xlsx`. Backups retain full
  JSON snapshots, including visibility and original result metadata, inside the
  workbook ZIP. Public users cannot list, preview or download these archives.
- Statistics has its own Export Excel, Upload Statistics, BackUps and Reset.
  Its workbook uses `Metric`, `Value`, `Email`, `Completed games` columns with
  Visits, Play time (ms), Completed games, Since, and optional Player rows.
  Use an exported workbook as the import template. Reset and import back up
  statistics independently; leaderboard results are kept. Imports become a
  baseline, with subsequent observed visits, time and games added to it.
- The server creates both leaderboard and statistics backups after midnight
  in `BACKUP_TIMEZONE` (default Europe/Berlin), checking every 15 seconds and
  catching up on startup. It does not require an open browser. Statistics
  archives live in the private `statistics/` subdirectory of the backup folder.

Only modern `.xlsx` files are supported. Formula cells, encrypted archives,
external worksheet links and oversized/invalid ZIPs are rejected; formulas are
never evaluated. Uploaded workbooks are read from their visible cells, so Excel
edits take effect even if a previous backup's embedded snapshot is still present.

## Concurrency and timing

Node verification uses a bounded worker pool and runs outside SQLite transactions.
Before applying a result, the server rechecks the owner, expiry and exact session
state; concurrent/replayed verification cannot overwrite newer checkpoints.
SQLite uses WAL, FULL synchronization and short, fair write transactions. Final
result insertion remains atomic and idempotent.

Action freshness is measured when the server finishes receiving the request body,
before database queueing. Completion bonuses use the last accepted server-received
action time only when replay confirms completion. Timeout scoring still uses the
stage deadline; no client completion timestamp or score is accepted.

The browser keeps one checkpoint request in flight and buffers subsequent actions
until its nonce arrives. Stage end waits for all buffered actions. Limits remain:
400 events per checkpoint, 6,000 events per stage, 360 game requests per visitor
per minute, 10 starts per visitor per minute, and 8 login attempts per transport IP
per 10 minutes. Shared-IP admission allows 120 visitors/minute and 600/hour; the
outer write ceiling is 12,000/minute per transport IP. Configure per-client proxy
limits as above, particularly when all traffic reaches Python through one proxy.

Run `node scripts/run-tests.cjs concurrency` for worker reuse, atomic limits,
verification races, server timing and buffered-action delivery checks. The load
benchmark is separate: `node scripts/load-benchmark.cjs` uses disposable local
servers and databases; it cannot target production.

## Lost acknowledgements and result status

The client retries transient failures for checkpoints, stage end and final save
(up to three attempts). The server returns a receipt only for an identical last
checkpoint or the matching completed-stage nonce, after checking the visitor's
server cookie, ownership, expiry and limits. Changed payloads and forged nonces
remain invalid. Receipts cannot append actions, advance a stage twice or resurrect
a deleted result. Concurrent duplicate verification returns the original receipt.

Analytics and gameplay import one version of the visitor-session module, sharing
the same in-flight session request. A failed/timed-out capability probe does not
silently select local practice: starting tries the real server and shows an error
if unavailable. Static hosts returning 404/405 retain clearly labeled practice.

Results say SAVED TO LEADERBOARD only after the final server response. An
unconfirmed official run does not create a local ranking entry or record badge.
Transient final-save failures expose RETRY SAVE and keep the result open; permanent
verification errors are not retried. No client score is uploaded during recovery.
Run `node scripts/run-tests.cjs result-save concurrency security verified-flow` to
check dropped acknowledgements, rejected saves, nonce receipts and normal play.
