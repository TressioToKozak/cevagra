# Memory Challenge — Codex Ready Assets v2

This pack contains **separate transparent PNG assets** for the Memory Challenge minigame.

## What is included
### scene/
- `memory_conveyor_platform.png` — main festive conveyor display platform with corrected **CEVA LOGISTICS** branding.

### ui/
- `phase1_instruction_banner.png` — full banner for the memorize phase.
- `phase2_instruction_banner.png` — full banner for the selection phase.
- `gifts_to_remember_label.png` — small section label.
- `gifts_to_select_label.png` — small section label.
- `memory_progress_bar.png` — progress bar art.
- `selected_counter.png` — counter panel art.
- `info_icon.png` — stand-alone info icon.
- `phase_1_2_pill.png` — small phase pill.
- `phase_2_2_pill.png` — small phase pill.
- `selection_card_slot.png` — blank selection card slot for repeated grid usage.
- `confirm_selection_button.png` — call-to-action button art.
- `memory_info_bar.png` — bottom info panel.
- `checkbox_unchecked.png` — unticked select box.
- `checkbox_checked.png` — ticked select box.

### gifts/
10 separate present assets, each as its own transparent PNG.

## Recommended composition
### Phase 1 — memorize
Use `phase1_instruction_banner.png`, `memory_conveyor_platform.png`, 5 gift assets on the platform, and support UI such as `gifts_to_remember_label.png`, `memory_progress_bar.png`, `phase_1_2_pill.png`, `memory_info_bar.png`.

### Phase 2 — select
Use `phase2_instruction_banner.png`, a repeated grid of `selection_card_slot.png`, the 10 gifts, plus `gifts_to_select_label.png`, `selected_counter.png`, `checkbox_unchecked.png`, `checkbox_checked.png`, `phase_2_2_pill.png`, and `confirm_selection_button.png`.

## Keep dynamic in code
Do not bake gameplay logic into the images. Keep these in HTML/CSS/JS:
- timer and score values
- which gifts are correct
- how many gifts are selected
- enabled/disabled state of the confirm button
- actual selection state logic

## Important
This v2 package intentionally excludes screenshot mockups from production asset folders. It is meant to be clean for Codex/front-end integration.
