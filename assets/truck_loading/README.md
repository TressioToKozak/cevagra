# Truck Loading — Codex Ready Assets

This pack contains transparent PNG assets for the Truck Loading minigame.

## Folder structure
- `scene/01_trailer_interior_7_bays.png` — main open trailer scene with 7 positions.
- `scene/02_truck_front_marker.png` — left truck front marker.
- `scene/03_rear_door_marker.png` — right rear door marker.
- `ui/04_pallets_waiting_panel.png` — left side "Pallets Waiting" sign.
- `pallets/05_pallet_crate_base.png` — generic crate-on-pallet asset.
- `pallets/06_blank_label_overlay.png` — blank front label overlay for dynamic city/stop data.
- `ui/07_lock_load_order_button_blank.png` — blank CTA frame for dynamic button text.
- `ui/08_last_delivery_load_first_banner.png` — static top rule banner.
- `overlays/09_single_drop_slot_overlay.png` — reusable single slot overlay if the game wants separate layering.
- `examples/truck_loading_mockup_reference.png` — full visual reference.

## Dynamic content that should stay in code/DOM
Do NOT bake these into final logic assets:
- city names (e.g. Edinburgh, Helsinki, Oslo)
- stop number / delivery number / order hints
- button label text if you prefer HTML
- position state / selected / correct / wrong state text

## Suggested composition
1. Render the trailer interior as the main loading area.
2. Place truck front marker on the far left.
3. Place rear door marker on the far right.
4. Place the pallets waiting panel to the left of the queue.
5. For each draggable pallet card, use `05_pallet_crate_base.png` as the object base and optionally overlay `06_blank_label_overlay.png`, then draw dynamic text in HTML/CSS.
6. Use `07_lock_load_order_button_blank.png` as the button art and render text above it.
7. Use `08_last_delivery_load_first_banner.png` as the top instruction banner.
8. If you prefer more DOM control, use `09_single_drop_slot_overlay.png` for per-position overlays instead of the baked-in guides inside the trailer.
