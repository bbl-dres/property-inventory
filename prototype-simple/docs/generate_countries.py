"""
Builds assets/countries/ and assets/regions/ of both prototypes from Natural Earth 1:10m (public domain):
one GeoJSON Feature per country (assets/countries/<ISO>.geojson), one per Swiss canton
(assets/regions/CH-<code>.geojson) and assets/countries/index.json with the names and the bounding box per
country and, for Switzerland, per canton. The location tree loads a file only when its country or canton is
selected; regions of other countries zoom to their objects. The apps never query a service for outlines:
everything is generated here and stored under assets/.

Canton geometries come from swissBOUNDARIES3D (swisstopo, open data: source citation required), fetched
by this script through the geo.admin.ch REST API, one request per canton (layer
ch.swisstopo.swissboundaries3d-kanton-flaeche.fill, searchField "ak"). Natural Earth's Admin 1 layer
supplies the codes and German names and is the fallback when the API is unreachable. Cantons are
simplified from 10 m up until they fit MAX_REGION_VERTICES.

- iso = ISO 3166-1 alpha-2 from ISO_A2_EH (ISO_A2 is -99 for France and Norway); features that share a
  code are merged.
- Each country is simplified (shapely, topology preserved) with the smallest tolerance from 50 m up that
  keeps it under MAX_VERTICES: small countries stay detailed (Switzerland ~ 0.0005 deg), the big ones end
  around 1-2 km, which is still exact enough at a country zoom. Coordinates are rounded to 4 decimals
  (~10 m); islands smaller than about 0.2 km2 are dropped.
- The bounding box anchors on the polygon with the most vertices; parts more than 60 deg of longitude /
  40 deg of latitude away or spanning the antimeridian are left out (Hawaii and the Aleutians for the USA),
  so fitBounds() never spans the globe.

Usage:  python docs/generate_countries.py [ne_10m_admin_0_countries.geojson [ne_10m_admin_1_states_provinces.geojson]]
        (from prototype-simple/); without paths the files are downloaded (13 MB and 40 MB) from the
        natural-earth-vector repository.
Needs:  pip install shapely
"""
import io, json, os, sys, urllib.request
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import unary_union

SRC = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson"
SRC_ADMIN1 = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"
SWISSTOPO_FIND = ("https://api3.geo.admin.ch/rest/services/api/MapServer/find?layer=ch.swisstopo.swissboundaries3d-kanton-flaeche.fill"
                  "&searchField=ak&searchText=%s&returnGeometry=true&geometryFormat=geojson&sr=4326")
REGION_COUNTRIES = ["CH"]  # countries whose regions get their own outlines
MAX_REGION_VERTICES = 8000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS = [ROOT, os.path.join(os.path.dirname(ROOT), "prototype-tabs")]
MAX_VERTICES = 6000
MIN_AREA = 2e-5  # deg2, about 0.2 km2 at mid latitudes
PRECISION = 4


def vertices(geom):
    return sum(len(p.exterior.coords) + sum(len(r.coords) for r in p.interiors) for p in polygons(geom))


def polygons(geom):
    if geom.geom_type == "Polygon":
        return [geom]
    if geom.geom_type == "MultiPolygon":
        return list(geom.geoms)
    return [g for g in getattr(geom, "geoms", []) if g.geom_type == "Polygon"]


def simplify(geom, max_vertices=MAX_VERTICES, tol=0.0005):
    out = geom.simplify(tol, preserve_topology=True)
    while vertices(out) > max_vertices:
        tol *= 1.5
        out = geom.simplify(tol, preserve_topology=True)
    return out, tol


def fetch_canton(code):
    """The canton polygon from swissBOUNDARIES3D (WGS84), or None when the API does not answer."""
    try:
        with urllib.request.urlopen(SWISSTOPO_FIND % code, timeout=120) as resp:
            data = json.load(io.TextIOWrapper(resp, encoding="utf-8"))
        results = data.get("results") or []
        return shape(results[0]["geometry"]) if results else None
    except Exception as err:  # offline or throttled: the caller falls back to Natural Earth
        print("  swisstopo", code, "unavailable:", err)
        return None


def rounded(coords):
    seen = []
    for x, y in coords:
        p = [round(x, PRECISION), round(y, PRECISION)]
        if not seen or seen[-1] != p:
            seen.append(p)
    if seen[0] != seen[-1]:
        seen.append(seen[0])
    return seen


def to_rings(geom):
    polys = []
    for p in polygons(geom):
        if p.area < MIN_AREA:
            continue
        rings = [rounded(p.exterior.coords)] + [rounded(r.coords) for r in p.interiors if len(r.coords) >= 4]
        if len(rings[0]) >= 4:
            polys.append(rings)
    return polys


def poly_bbox(rings):
    xs = [c[0] for c in rings[0]]
    ys = [c[1] for c in rings[0]]
    return [min(xs), min(ys), max(xs), max(ys)]


def country_bbox(polys):
    polys = sorted(polys, key=lambda p: -len(p[0]))
    boxes = [poly_bbox(p) for p in polys]
    ax, ay = (boxes[0][0] + boxes[0][2]) / 2, (boxes[0][1] + boxes[0][3]) / 2
    w, s, e, n = boxes[0]
    for b in boxes[1:]:
        if b[2] - b[0] > 90:
            continue
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        if abs(cx - ax) > 60 or abs(cy - ay) > 40:
            continue
        w, s, e, n = min(w, b[0]), min(s, b[1]), max(e, b[2]), max(n, b[3])
    return [round(v, PRECISION) for v in (w, s, e, n)]


def load_source(path, url):
    if path:
        with io.open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    with urllib.request.urlopen(url, timeout=600) as resp:
        return json.load(io.TextIOWrapper(resp, encoding="utf-8"))


def build_feature(key, props, geoms, max_vertices=MAX_VERTICES, tol=0.0005):
    geom = geoms[0] if len(geoms) == 1 else unary_union(geoms)
    simple, tol = simplify(geom, max_vertices, tol)
    polys = to_rings(simple)
    if not polys:
        return None, None
    geometry = {"type": "Polygon", "coordinates": polys[0]} if len(polys) == 1 else {"type": "MultiPolygon", "coordinates": polys}
    bbox = country_bbox(polys)
    feature = {"type": "Feature", "bbox": bbox, "properties": dict(props, key=key), "geometry": geometry}
    return json.dumps(feature, ensure_ascii=False, separators=(",", ":")), bbox


def write_files(subdir, files):
    for app in APPS:
        target = os.path.join(app, "assets", subdir)
        os.makedirs(target, exist_ok=True)
        for old in os.listdir(target):
            os.remove(os.path.join(target, old))
        for name, text in files.items():
            with io.open(os.path.join(target, name), "w", encoding="utf-8", newline="\n") as fh:
                fh.write(text)
        print("wrote", len(files), "files to", target)


def main():
    countries = load_source(sys.argv[1] if len(sys.argv) > 1 else None, SRC)
    by_iso = {}
    for f in countries["features"]:
        p = f["properties"]
        iso = p.get("ISO_A2_EH") or p.get("ISO_A2")
        if not iso or iso == "-99":
            continue
        entry = by_iso.setdefault(iso, {"name": p["NAME"], "name_de": p.get("NAME_DE") or p["NAME"], "geoms": []})
        entry["geoms"].append(shape(f["geometry"]))

    index = {}
    files = {}
    for iso in sorted(by_iso):
        e = by_iso[iso]
        text, bbox = build_feature(iso, {"iso": iso, "name": e["name"], "name_de": e["name_de"]}, e["geoms"])
        if not text:
            continue
        files[iso + ".geojson"] = text
        index[iso] = {"name": e["name"], "name_de": e["name_de"], "bbox": bbox}

    # Regions (Swiss cantons): key CH-BE, code BE; the tree matches a region filter value by code, name or name_de.
    # Geometry from swissBOUNDARIES3D (detailed), codes and German names from Natural Earth (also the fallback).
    admin1 = load_source(sys.argv[2] if len(sys.argv) > 2 else None, SRC_ADMIN1)
    region_files = {}
    for f in sorted(admin1["features"], key=lambda f: f["properties"].get("iso_3166_2") or ""):
        p = f["properties"]
        iso = p.get("iso_a2")
        if iso not in REGION_COUNTRIES or iso not in index:
            continue
        key = p["iso_3166_2"]                      # CH-BE
        code = key.split("-", 1)[1]
        props = {"iso": iso, "code": code, "name": p["name"], "name_de": p.get("name_de") or p["name"]}
        detailed = fetch_canton(code) if iso == "CH" else None
        if detailed is not None:
            props["source"] = "swisstopo"
            text, bbox = build_feature(key, props, [detailed], MAX_REGION_VERTICES, 0.0001)
        else:
            props["source"] = "naturalearth"
            text, bbox = build_feature(key, props, [shape(f["geometry"])])
        if not text:
            continue
        region_files[key + ".geojson"] = text
        index[iso].setdefault("regions", {})[code] = {"name": p["name"], "name_de": p.get("name_de") or p["name"], "bbox": bbox}
    files["index.json"] = json.dumps(index, ensure_ascii=False, separators=(",", ":"))

    write_files("countries", files)
    write_files("regions", region_files)
    total = sum(len(t.encode("utf-8")) for t in list(files.values()) + list(region_files.values()))
    biggest = sorted(((len(t.encode("utf-8")), n) for n, t in list(files.items()) + list(region_files.items())), reverse=True)[:5]
    print("%d countries, %d regions, %d KB in total; largest: %s" % (len(files) - 1, len(region_files), round(total / 1024),
          ", ".join("%s %d KB" % (n, s // 1024) for s, n in biggest)))


if __name__ == "__main__":
    main()
