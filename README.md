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
`https://tressiotokozak.github.io/cevagra/?organizer=1`. The organizer dialog opens directly; the menu has no organizer button.
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

Final visual polish keeps full-viewport untimed briefings with directional gradients,
physical parcel labels, and persistent Truck pallets. Truck slots use a border-only
placement highlight; they never restart an opacity entrance animation. Quality
Control uses carton damage and shipping fields, without decorative stickers or
issue badges. RELEASE/HOLD share identical visible button geometry. Final Dispatch
uses seeded 80% HOLD / 20% RELEASE scenarios and retains 150/50 scoring.

Run the visual-polish regression (27 briefing captures, 18 conveyor labels and
ghosts, early/late barcode rounds, Truck visibility samples through 500 ms, QC
seeds, equal action geometry, and cursor states):

```bash
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node scripts/polish-tests.cjs
```

Screenshots are written to `/tmp/ceva-*.png`. Set `TEST_ORIGIN` for a local Pages
subdirectory test; Node tests include a 5,000-seed Final distribution check.

Mission Briefings and Mission Reports share the industrial navy/blue/gold HUD.
The briefing is a single configuration-driven template: original background/icon,
nine progress markers, objective/hint, action/time, and a real keyboard-accessible
Ready button. The Results summary and 3×3 cards use CSS Grid and DOM text, without
text-bearing decorative panel assets or absolute positioning of player/rank/score.
Original artwork stays in the repository; unused result panels are no longer preloaded.

Non-editable UI under `#app` and `#modal` prevents text selection. Input, textarea
and contenteditable selection is explicitly restored. Rendered images use
`draggable="false"` and `-webkit-user-drag:none`; a targeted `dragstart` listener
cancels native image drags only. There is no blanket mouse/pointer cancellation.

```bash
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node scripts/mission-tests.cjs
```

This browser suite checks 27 briefing layouts, nine Results scenarios (70/665/1000,
long names and rank #1/#101), consistent cards and progress ratios, rapid clicking
through all nine games, custom drags, native image prevention, name editing/mouse
selection, textarea/contenteditable editing, organizer inputs and keyboard focus.
Set `TEST_ORIGIN` for a local `/cevagra/` deployment. PNG captures use
`/tmp/ceva-mission-*.png` and `/tmp/ceva-report-*.png`; reviewed evidence is kept in
[`docs/mission-ui/report.md`](docs/mission-ui/report.md).

Leaderboard/input polish uses content-sized modals and a flexible, sticky-header
row viewport; long boards fill available height, short boards remain compact.
The player-name field has no autofocus/background jump and uses a gold native
caret. Editable fields retain Christmas mouse artwork. Because native CSS cannot
prevent OS pointer hiding while typing, `editing-cursor.js` supplies an editing-only
visual fallback at the last known mouse position, with native cursor suppression
only while the matching overlay is visible. It never intercepts editing or clicks.

```bash
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node scripts/input-leaderboard-tests.cjs
```

Reviewed before/after captures and limitations: [report](docs/input-leaderboard/report.md).

Gameplay motion uses local feedback with fixed interactive geometry. No entrance
animation delays active targets or stage timers. Decorative animations pause when
the document is hidden and respect reduced motion; Memory still lasts four seconds.

```bash
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node scripts/animation-tests.cjs
```

Set `TEST_ORIGIN` for the local `/cevagra/` path. The suite checks all nine activation
timings at three viewport sizes, records 16 live effect scenes via Chromium CDP,
and verifies neutral classifications, cleanup and reduced motion. Raw frames and
timestamps are saved under `/tmp/ceva-motion/`; the reviewed recording, chapters,
performance measurements and limitations are in [the motion report](docs/motion/report.md).

The Arcade Premium pass adds 180 ms visual presses and 220 ms load settling through
the same `ArcadeEffects`, while keeping control geometry and drag logic unchanged.
Run `node scripts/premium-tests.cjs` for native press geometry, rapid selections,
keyboard activation, neutral feedback, cleanup and reduced-motion checks.
See [the premium report](docs/premium/report.md) for recordings, all-suite results
and measured performance limitations.
