# Icons

The application uses **Material Symbols Outlined**, hosted entirely in this directory.
The complete static font is pinned to v372 (24 optical size, 400 weight, unfilled,
zero grade). Its Apache 2.0 licence is included in `LICENSE`; download provenance
is recorded in `material-symbols-outlined.css`.

Use `<span class="material-symbols-outlined" aria-hidden="true">icon_name</span>`
inside a labelled control. Add `action-icon` for the standard 20 px navigation
and reset icons. Translated button labels and tooltips belong on the control,
not on the decorative icon.

| Action | Icon |
| --- | --- |
| Locations / Standorte | `account_tree` |
| Master-data filters | `tune` |
| Reset filters (all entry points) | `restart_alt` |
| Zoom in / out | `add` / `remove` |
| Compass / north | `navigation` |
| Home | `home` |
| Information | `info` |
| Close | `close` |
| Location pin | `location_on` |

The stylesheet also replaces MapLibre's built-in control artwork while retaining
its interactions, compass rotation and accessible labels. The 2D/3D toggle stays
a text label. Print geometry, map data and third-party document/API content are
not application icons.

Each prototype owns its own font, stylesheet and licence. Keep the two copies
identical without importing assets from the other prototype. No Google Fonts
request or additional icon library is needed at runtime.
