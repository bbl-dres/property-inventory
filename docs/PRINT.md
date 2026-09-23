# Print and preview

Both prototypes print the map to PDF from their own `js/print.js` and
`js/print-geometry.js`. The copies are byte-identical and checked by
`node test/check-alignment.js`; nothing is shared at runtime.

## The printed map is the web map

A print renders the web zoom of the chosen scale. The offscreen MapLibre maps
draw that zoom at `dpi / 96` device pixels per CSS pixel (`pixelRatio`), so
every label, marker, halo and line keeps the physical size it has on a 96 dpi
screen, and collision and label density match the screen. The ground scale
stays exact: one CSS pixel is 1/96 inch of paper at the nominal scale, and the
zoom is `log2(metersPerPixel(lat, 0) / (scale × 0.0254 / 96))`, independent of
the resolution. Map containers have whole CSS pixels, so the half-pixel
rounding of the sheet width is folded into the zoom; the sheet covers exactly
its width in millimetres times the scale.

| Element | Screen | Paper, any resolution |
|---|---:|---:|
| Building label, 13 px | 3.4 mm | 3.4 mm |
| Parcel label, 16 px | 4.2 mm | 4.2 mm |
| Building dot radius, 10 px | 2.6 mm | 2.6 mm |

The print style is the live style with the interactive layers removed:
clusters, selection rings, hover highlights, the measure tool and identify
results. Every zoom rule of the data layers stays, because the print zoom is a
web zoom. Object labels and their invisible collision obstacles are the one
exception: with "Objektbeschriftung" ticked they print at any scale. The
obstacle image is added at runtime and is not part of the style JSON, so each
offscreen map answers `styleimagemissing` with the live map's image.

## Scale, preview and view

**Automatisch** prints the current view: the largest round scale denominator
(1, 2, 2.5, 5 × 10ⁿ) whose map area fits the visible map. Explicit scales are
exact. Choosing a format or scale eases the map so the page fills the view;
opening the print item zooms out only when the page would not fit.

The crop on the map is the exact printed area, centred on the map centre, and
is never scaled down. When it reaches beyond the map, the badge above it says
so. The badge shows format, orientation and the resolved scale.

The print keeps the map's bearing: the offscreen maps, the tile offsets, the
corner coordinates and the north arrow all turn with the view, so the crop
stays an upright rectangle on screen. Paper maps are flat: opening the print
item eases a tilted view back to pitch 0, and a view tilted afterwards is
printed flat and flagged in the badge.

## Tiles, bleed and encoding

Pages larger than one WebGL canvas are rendered in tiles of at most 4096
device pixels, or less when the GPU reports a smaller `MAX_TEXTURE_SIZE`.
Tiles are defined in CSS pixels; each tile is rendered with a bleed of 128 CSS
pixels beyond every edge and cropped to its interior, so symbols near a seam
see the same neighbours from both sides. Tile centres are offset in world
pixels, which keeps shared edges exact at every latitude and under a bearing.
Placement is still decided per tile, so a label whose competitors lie further
than the bleed away can differ between two tiles.

Pages up to about six megapixels are embedded as PNG, larger pages as JPEG at
quality 0.92. Each tile is encoded and released before the next one renders.

The header carries the web app's two-line title, organisation above product
name, with the date and the prototype notice. The legend lists the operating
status in the interface language and the visible external layers; its height
on the page grows with those layers. The default resolution is 150 dpi.

## Verification

```powershell
node test/print-geometry.js                 # scale, tiling, seams, bearing, preview parity, print style
node test/all.js                            # both prototypes: preview badge, automatic scale, fit, tilt
node test/print-rendering.js                # real WebGL prints (needs the repository served on :8123)
```

The browser test prints the live style at 150 dpi and a known dot at 300 and
150 dpi with the view turned by 30 degrees. It checks the pixel ratio, bearing
and canvas limit of every offscreen map, that a 16 CSS px dot measures 50 and
25 device pixels, that tiles meet without gaps, that the preview crop equals
the printed extent, and that `offsetMapCenter` matches `map.unproject`.
