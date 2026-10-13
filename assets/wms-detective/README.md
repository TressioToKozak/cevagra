# WMS Detective — true Codex-ready asset pack

This pack contains **real separate PNG assets**, not screenshot crops.

Every UI asset is an RGBA PNG with transparent space outside the artwork. Runtime values are intentionally NOT baked into the images.

## Put this folder in
`assets/wms-detective/`

## Dynamic HTML/CSS content
Keep these in the DOM and populate from the existing game data:
- rack/location (A-01, B-02, ...)
- WMS registered SKU
- physical scan SKU
- selected count
- table labels/captions
- button text
- barcodes

Use the existing Code128 helper for barcodes if possible.

## Gameplay rule
Before the user confirms, **never reveal whether a row is actually correct or incorrect**.
- normal -> `rows/row_normal.png`
- hover -> `rows/row_hover.png`
- selected/flagged -> `rows/row_selected.png`

`row_result_error`, `row_result_success`, `status_match`, and `status_mismatch` are optional post-result assets only.

## Main composition
- shared global game HUD stays unchanged
- `ui/instruction_panel_blank.png` + HTML text
- `ui/system_header_blank.png` + HTML WMS title + selected count
- `ui/table_header_blank.png` + HTML column labels
- rows built from blank row PNGs + controls + dynamic text/barcode
- `ui/hint_panel_blank.png` + HTML hint text
- `ui/button_confirm*.png` as button background + HTML button text/icon

## Why blank assets?
The mini-game is seeded and data-driven. A screenshot with fixed SKUs would break the game. These assets provide only visual framing; the live values remain real DOM data.
