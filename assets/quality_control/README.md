# Quality Control — Codex-ready asset pack

This pack contains **separate PNG files**, not sprite sheets.  
The intended repository destination is:

`assets/quality-control/`

The goal is to rebuild the existing `QualityControl` minigame visually while preserving its current mechanics, scoring, seed behavior, timer and selection logic.

## Important integration rule

Dynamic information must stay in HTML/CSS:

- `GIFT-1` … `GIFT-8`
- carrier name
- SKU
- `SKU-ERROR`
- selected state
- issue state

Do **not** bake run-specific values into the images.

## Suggested parcel composition

Each parcel can be assembled in layers:

1. `boxes/box_*.png`
2. optional `damage/damage_*.png`
3. `labels/label_base.png` or `labels/label_paper.png`
4. a carrier badge from `labels/carrier_*.png`
5. dynamic DOM text for GIFT ID and SKU
6. optional issue icon from `issues/`
7. interaction frame from `states/`

## Mapping to the current code

Current issue values in `tasks.js` / `minigames.js`:

- `dented` → add one damage overlay and `issues/issue_damage.png`
- `wrong-label` → use `labels/carrier_other.png`
- `missing` → blank/missing SKU and `issues/issue_missing_data.png`
- `wrong-sku` → show `SKU-ERROR` and `issues/issue_wrong_sku.png`
- `null` → clean parcel

Do not reveal whether a selected parcel is correct before `LOCK QUALITY CHECK`.

During gameplay use:
- hover/highlight → `states/box_highlight.png`
- selected → `states/box_selected.png`

Reserve `box_success`, `box_error`, check/cross and scan effects for post-confirm feedback if Codex adds that presentation without changing scoring/mechanics.

## Existing background

The game already has:

`assets/backgrounds/08_quality_control.png`

Prefer keeping it. The file in `examples/quality_control_reference.png` is a visual reference, not a mandatory replacement background.

## Folders

- `boxes/` — clean package bases
- `damage/` — composable damage textures
- `labels/` — carrier badges, label paper and shipping icons
- `issues/` — issue indicators
- `states/` — hover/selected/feedback frames
- `ui/` — optional buttons/panels/progress assets
- `decor/` — Christmas decorative elements
- `scene/` — optional warehouse scene pieces
- `examples/` — reference visualization
- `manifest.json` — machine-readable mapping for Codex

All generated gameplay assets are PNGs with alpha where practical.
