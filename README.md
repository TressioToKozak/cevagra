# CEVA Christmas Logistics Challenge

A static, English-only competition for one computer and one browser. Nine minigames,
165 seconds of available active gameplay, and a 1,000-point maximum. Briefings and
countdowns are untimed. No server, accounts, online synchronization, practice mode,
or audio. GitHub Pages serves the relative assets directly from `/cevagra/`.

## Run and test

```sh
python3 -m http.server 8002 --bind 127.0.0.1
node tests.mjs
```

Optional Chromium checks use an installed development copy of Playwright:

```sh
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chromium node scripts/browser-tests.cjs
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chromium node scripts/visual-tests.cjs
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chromium node scripts/edge-tests.cjs
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chromium node scripts/interaction-tests.cjs
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chromium node scripts/background-tests.cjs
```

Set `TEST_ORIGIN` to test another local server. Browser tests cover two complete
runs, actual readiness gates, timing, perfect scoring, every stage timeout,
duplicate names, retained results, and 27 desktop stage/viewport combinations.
No test dependency is loaded by the application.

## Randomization and replay

Every normal start creates two independent secure identifiers: `runId` and
`runSeed`. The event identifier is a separate local organizer setting. Changing it
does not fix the task seed. A run seed deterministically determines the eight-game
shuffle (Final Dispatch remains last), tasks, correct positions and visual variants.
To reproduce a saved run, open `?seed=THE-SAVED-RUN-SEED`. This explicitly opts into
fixed debug data; normal participants should use the URL without that parameter.

Conveyor has two parcels per carrier and six shuffled, stable zones. Rapid-answer
positions do not repeat consecutively and are balanced across eligible slots.
Packing has four ten-piece, 30-cell inventories made from supported artwork
sizes; the existing backtracking solver supplies a seeded, non-overlapping rack
layout. WMS always has three mismatches, QC four issues, Memory five gifts and
three decoys, and Truck seven unique delivery stops. Final has either no errors
(RELEASE) or two errors (HOLD); its 150 issue points plus 50 action points remain
capped at 200. Completing perfectly in the first half of a stage earns the full
speed bonus; later completion earns a proportionally smaller bonus.

## Images and readiness

`asset-manifest.js` explicitly includes CSS images and all dynamically selected
artwork for later questions. `asset-loader.js` uses one shared queue with at most
six images at a time.
The menu renders immediately, prioritizes its own artwork and schedules all nine
minigames for silent background preparation using idle time. No full-screen loading
step follows START: the first briefing appears synchronously after run generation.
Current-stage images have HIGH priority, the next stage MEDIUM, and later images
LOW. One queue lane is reserved for urgent work. Promoting a queued or in-flight
image reuses its original promise and request; completed decoded images are cached.

The briefing keeps I'M READY disabled with a small "Preparing challenge..." message
until every current-stage variant and CSS image is decoded. The actual gameplay
DOM, including Conveyor's first parcel, is rendered and measured invisibly beneath
the briefing. Once ready, the message disappears and the button enables. Failures
show RETRY CHALLENGE in the same briefing. Returning to the menu invalidates stale
callbacks while useful background downloads continue. Gameplay reuses the prepared
DOM; its monotonic `StageGuard` and Memory's four-second timer start only after the
countdown. No loading percentage or separate loading screen appears.
All images for later rounds are already decoded. The original PNG artwork and
unused mockups remain in the repository; production uses only the listed assets.

`assets/optimization-report.json` records exact source/output bytes and dimensions
for each runtime asset. Regenerate WebP derivatives and the manifest with:

```sh
python3 scripts/optimize-assets.py
```

This development script requires Pillow, preserves alpha and proportions, and
skips current derivatives. It does not convert reference images or change game
logic. Rebuild an individual derivative by removing that `.webp` and rerunning.

## Local results and organizer tools

The original localStorage keys and v1/v2/v3 result migration remain supported.
Every attempt remains separate, including identical names. Results contain the
run ID, completion timestamp, run seed, event ID, accuracy and individual scores.
CSV includes the seed for reproduction. No name-based personal-best claim is
shown. RETURN TO START clears the participant name.

Organizer Tools are absent from the normal participant menu. Open
`https://tressiotokozak.github.io/cevagra/?organizer=1`, then click ORGANIZER TOOLS.
This deliberate frontend URL prevents accidental access; it is not authentication
or real security. It allows editing the event identifier, exporting CSV and resetting
results. RESET RESULTS first opens a warning and a prominent CSV backup action.
The organizer must type exactly `RESET` and then click DELETE ALL LOCAL RESULTS.
Closing the dialog or clicking CANCEL preserves all results. Existing results are
never automatically cleared. If storage is unavailable, full, or unreadable, a
result remains in page
memory and an English warning asks the organizer to export CSV before closing.
Malformed existing data is not overwritten. In-memory fallback cannot survive a
page reload; use a working persistent browser profile for the event.
