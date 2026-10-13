# Final Dispatch — Codex Ready Assets

This package contains **separate transparent PNG assets** for the Final Dispatch minigame. The art matches the approved festive warehouse inspection mockup.

## Included production assets
### panels/
- `01_order_panel.png` — left comparison panel for customer order details.
- `02_packed_shipment_panel.png` — right comparison panel for actual packed shipment details.

### bars/
- `03_inspect_banner.png` — top instruction banner with INSPECT tab and blank text area.
- `09_info_help_bar.png` — bottom info bar with information icon and blank help area.

### buttons/
- `04_hold_shipment_button.png` — main CTA button.
- `05_issue_wrong_quantity.png`
- `06_issue_wrong_carrier.png`
- `07_issue_wrong_sku.png`
- `08_issue_missing_serials.png`

### cards/
- `10_product_thumbnail_train.png` — product card artwork for the featured shipment example.

### icons/
- `11_icon_carrier_truck_tile.png`
- `12_icon_serials_barcode_tile.png`
- `13_icon_destination_pin_tile.png`
- `14_icon_package_cube_tile.png`
- `15_icon_order_clipboard_tile.png`
- `16_icon_shipment_carton_tile.png`

## Keep dynamic in code / DOM
Do **not** bake gameplay data into the PNGs. These should remain dynamic:
- order number / shipment number
- SKU / item title / description
- quantity
- carrier text or logos
- serial numbers and missing-state text
- destination details
- package summary values
- selected issue state / confirm logic

## Reference
The `reference/` folder contains a full mockup and a preview sheet only for guidance. Production UI should be assembled from the separate PNGs in this pack.
