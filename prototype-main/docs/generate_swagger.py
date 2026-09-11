"""
Generate the mock OpenAPI 3.0 specification (data/swagger.json) from DATAMODEL.json.

The API is a placeholder for future development: the documented server does not exist.
Schemas, descriptions and examples are derived from the canonical data model and the
mock GeoJSON files so the documentation stays in sync with the prototype data.

Usage:
    python docs/generate_swagger.py

Reads:  docs/DATAMODEL.json, data/buildings.geojson, data/parcels.geojson, data/landcovers.geojson
Writes: data/swagger.json
"""

import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(ROOT, "docs", "DATAMODEL.json")
OUT_PATH = os.path.join(ROOT, "data", "swagger.json")

SERVER_URL = "https://api.bbl-immo.admin.ch/v1"

# Entities exposed by the mock API: model id -> API configuration
ENTITIES = {
    "building": {
        "path": "buildings",
        "tag": "Gebäude",
        "tag_en": "Buildings",
        "singular": "Building",
        "id_field": "bbl_id",
        "filters": ["adr_land", "adr_reg", "adr_ort", "bbl_stat", "bbl_eigen", "bbl_port", "bbl_gbda1", "bfs_gemnr", "kgs_kat"],
    },
    "parcel": {
        "path": "parcels",
        "tag": "Grundstücke",
        "tag_en": "Parcels",
        "singular": "Parcel",
        "id_field": "bbl_id",
        "filters": ["adr_land", "adr_reg", "bfs_gemnr", "bbl_we", "bbl_eigen", "av_egrid"],
    },
    "land_cover": {
        "path": "landcovers",
        "tag": "Bodenabdeckung",
        "tag_en": "Land covers",
        "singular": "LandCover",
        "id_field": "objectid",
        "filters": ["bbl_id", "geb_id", "av_type", "av_egid", "av_egrid"],
    },
}

FORMAT_MAP = {
    # DATAMODEL "format" -> (json type, json format)
    "string": ("string", None),
    "text": ("string", None),
    "integer": ("integer", None),
    "int": ("integer", None),
    "long": ("integer", "int64"),
    "number": ("number", None),
    "float": ("number", "float"),
    "double": ("number", "double"),
    "decimal": ("number", None),
    "boolean": ("boolean", None),
    "bool": ("boolean", None),
    "date": ("string", "date"),
    "datetime": ("string", "date-time"),
    "timestamp": ("string", "date-time"),
    "array": ("array", None),
}

# Code domains referenced by DATAMODEL "value_list" whose complete member list is known
# (from the app configuration and the attribute reference). Other domains are documented
# with example values only, because the mock data does not contain every member.
KNOWN_DOMAINS = {
    "BBL_STATUS": ["Aktiv", "In Renovation", "In Planung", "Verkauft"],
    "ACCURACY": ["Vermessen", "Geschätzt", "AV"],
    "AV_COVER_TYPE": ["Gebaeude", "befestigt", "humusiert", "Gewaesser"],
    "KGS_CATEGORY": ["A", "B", "C"],
    "BBL_HISTORICAL": ["Ja", "Nein"],
    "BBL_ARCHIVAL": ["Ja", "Nein"],
}


def load_json(path):
    with io.open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def json_type(fmt):
    key = (fmt or "").strip().lower()
    if key in FORMAT_MAP:
        return FORMAT_MAP[key]
    print("  ! unknown format %r -> string" % fmt)
    return ("string", None)


def parse_value_list(value_list):
    """Turn an explicit value list (a;b;c) of the data model into an enum (or None)."""
    if not value_list or not isinstance(value_list, str):
        return None
    sep = ";" if ";" in value_list else ("|" if "|" in value_list else ",")
    values = [v.strip() for v in value_list.split(sep)]
    values = [v for v in values if v and len(v) <= 60]
    if len(values) < 2:
        return None
    return values


def observed_values(attr, features, limit=6):
    values = []
    for f in features:
        val = f.get("properties", {}).get(attr["field"])
        if val is None or val == "" or not isinstance(val, str) or val in values:
            continue
        values.append(val)
    return values[:limit]


def enum_from_data(attr, features):
    """Return an enum for the attribute when its value domain is completely known:
    either an explicit list in value_list (a;b;c) or a domain listed in KNOWN_DOMAINS."""
    explicit = parse_value_list(attr.get("value_list"))
    if explicit:
        return explicit
    domain = (attr.get("value_list") or "").strip()
    if domain in KNOWN_DOMAINS:
        return list(KNOWN_DOMAINS[domain])
    return None


def value_list_note(attr, features):
    """Description suffix for attributes with a code domain that is not fully known."""
    domain = (attr.get("value_list") or "").strip()
    if not domain or domain in KNOWN_DOMAINS or parse_value_list(domain):
        return ""
    examples = observed_values(attr, features)
    note = "Werteliste `%s`" % domain
    if examples:
        note += " (Beispiele: %s)" % ", ".join(examples)
    return note


def example_value(features, field):
    """First non-null value of a property across the mock features."""
    for f in features:
        val = f.get("properties", {}).get(field)
        if val is not None and val != "":
            return val
    return None


def build_properties_schema(entity, features):
    props = {}
    required = []
    for attr in sorted(entity["attributes"], key=lambda a: a.get("sort", 0)):
        if attr.get("status") != "LIVE":
            continue  # DEV attributes are not part of the mock API yet
        field = attr["field"]
        jtype, jformat = json_type(attr.get("format"))
        schema = {"type": jtype}
        if jformat:
            schema["format"] = jformat
        if jtype == "array":
            schema["items"] = {"type": "string", "format": "uri"}
        title = attr.get("alias_de") or field
        desc_de = attr.get("description_de") or ""
        desc_en = attr.get("description_en") or ""
        schema["title"] = title
        description = desc_de
        if desc_en and desc_en != desc_de:
            description += ("\n\n" if description else "") + "EN: " + desc_en
        note = value_list_note(attr, features)
        if note:
            description += ("\n\n" if description else "") + note
        if description:
            schema["description"] = description
        enum = enum_from_data(attr, features)
        if enum:
            schema["enum"] = enum
        if attr.get("value_list"):
            schema["x-value-list"] = attr["value_list"]
        key = (attr.get("key") or "").strip().upper()
        if key == "PK":
            required.append(field)
        else:
            schema["nullable"] = True
        ex = example_value(features, field)
        if ex is not None:
            schema["example"] = ex
        if attr.get("group"):
            schema["x-group"] = attr["group"]
        if attr.get("source"):
            schema["x-source"] = attr["source"]
        if key:
            schema["x-key"] = key
        props[field] = schema
    return {"type": "object", "required": required, "properties": props}


def geometry_ref(geometry):
    return {"$ref": "#/components/schemas/" + ("PointGeometry" if geometry == "Point" else "PolygonGeometry")}


def feature_example(features):
    if not features:
        return None
    f = features[0]
    return {"type": "Feature", "geometry": f.get("geometry"), "properties": f.get("properties")}


def filter_parameter(entity, field, features):
    attr = next((a for a in entity["attributes"] if a["field"] == field), None)
    if not attr:
        return None
    jtype, jformat = json_type(attr.get("format"))
    schema = {"type": jtype}
    if jformat:
        schema["format"] = jformat
    enum = enum_from_data(attr, features)
    if enum:
        schema["enum"] = enum
    ex = example_value(features, field)
    if ex is not None:
        schema["example"] = ex
    desc = "Filter: %s" % (attr.get("alias_de") or field)
    if attr.get("description_de"):
        desc += " – " + attr["description_de"]
    note = value_list_note(attr, features)
    if note:
        desc += ". " + note
    return {"name": field, "in": "query", "required": False, "description": desc, "schema": schema}


def common_list_parameters():
    return [
        {
            "name": "bbox",
            "in": "query",
            "required": False,
            "description": "Räumlicher Filter als Begrenzungsrechteck in WGS84: `minLon,minLat,maxLon,maxLat`.",
            "schema": {"type": "string", "example": "7.40,46.90,7.50,47.00"},
        },
        {
            "name": "limit",
            "in": "query",
            "required": False,
            "description": "Maximale Anzahl Ergebnisse pro Antwort.",
            "schema": {"type": "integer", "minimum": 1, "maximum": 1000, "default": 100},
        },
        {
            "name": "offset",
            "in": "query",
            "required": False,
            "description": "Anzahl zu überspringender Ergebnisse (Paginierung).",
            "schema": {"type": "integer", "minimum": 0, "default": 0},
        },
    ]


def error_response(description):
    return {
        "description": description,
        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Error"}}},
    }


def main():
    model = load_json(MODEL_PATH)
    entities_by_id = {e["id"]: e for e in model["entities"]}

    spec = {
        "openapi": "3.0.3",
        "info": {
            "title": "BBL GIS IMMO API (Prototyp)",
            "version": model.get("version", "1.0.0"),
            "description": (
                "**Prototyp – fiktive Daten.** Diese API ist ein Platzhalter für zukünftige Entwicklung: "
                "der dokumentierte Server existiert nicht, die Beispiele stammen aus den Mock-Daten des Prototyps.\n\n"
                "Die API bietet lesenden Zugriff auf Gebäude, Grundstücke und Bodenabdeckungen des "
                "Bundesimmobilienportfolios. Alle Endpunkte liefern GeoJSON (RFC 7946) mit Koordinaten in WGS84 "
                "(`urn:ogc:def:crs:OGC:1.3:CRS84`). Die Attribute entsprechen dem BBL GIS IMMO Datenmodell "
                "(siehe `docs/DATAMODEL.md`); Feldnamen sind Shapefile-kompatibel (max. 10 Zeichen).\n\n"
                "**Authentifizierung:** API-Key im Header `X-API-Key`. **Rate Limit:** 100 Anfragen pro Minute."
            ),
            "contact": {"name": "Bundesamt für Bauten und Logistik BBL", "email": "immobilien@bbl.admin.ch"},
            "x-prototype": True,
        },
        "servers": [{"url": SERVER_URL, "description": "Platzhalter – nicht erreichbar"}],
        "security": [{"ApiKeyAuth": []}],
        "tags": [],
        "paths": {},
        "components": {
            "securitySchemes": {
                "ApiKeyAuth": {"type": "apiKey", "in": "header", "name": "X-API-Key", "description": "API-Key (Platzhalter)"}
            },
            "schemas": {
                "PointGeometry": {
                    "type": "object",
                    "required": ["type", "coordinates"],
                    "properties": {
                        "type": {"type": "string", "enum": ["Point"]},
                        "coordinates": {
                            "type": "array",
                            "minItems": 2,
                            "maxItems": 3,
                            "items": {"type": "number"},
                            "description": "[Longitude, Latitude] in WGS84",
                            "example": [7.4441, 46.9465],
                        },
                    },
                },
                "PolygonGeometry": {
                    "type": "object",
                    "required": ["type", "coordinates"],
                    "properties": {
                        "type": {"type": "string", "enum": ["Polygon"]},
                        "coordinates": {
                            "type": "array",
                            "description": "Ringe aus [Longitude, Latitude]-Paaren; der erste Ring ist die Aussenkontur.",
                            "items": {"type": "array", "items": {"type": "array", "minItems": 2, "items": {"type": "number"}}},
                        },
                    },
                },
                "Error": {
                    "type": "object",
                    "required": ["code", "message"],
                    "properties": {
                        "code": {"type": "integer", "example": 404},
                        "message": {"type": "string", "example": "Objekt nicht gefunden"},
                    },
                },
            },
            "responses": {
                "BadRequest": error_response("Ungültige Parameter"),
                "Unauthorized": error_response("Fehlender oder ungültiger API-Key"),
                "NotFound": error_response("Objekt nicht gefunden"),
                "TooManyRequests": error_response("Rate Limit überschritten (100 Anfragen / Minute)"),
                "ServerError": error_response("Interner Serverfehler"),
            },
        },
    }

    for model_id, cfg in ENTITIES.items():
        entity = entities_by_id[model_id]
        features = []
        if entity.get("data_file"):
            data = load_json(os.path.join(ROOT, entity["data_file"]))
            features = data.get("features", [])
        print("- %s: %d LIVE attributes, %d mock features" % (
            model_id, sum(1 for a in entity["attributes"] if a.get("status") == "LIVE"), len(features)))

        singular = cfg["singular"]
        tag = cfg["tag"]
        spec["tags"].append({"name": tag, "description": "%s (%s) – Geometrie: %s" % (entity["name_de"], cfg["tag_en"], entity["geometry"])})

        props_schema = build_properties_schema(entity, features)
        spec["components"]["schemas"][singular + "Properties"] = props_schema
        spec["components"]["schemas"][singular + "Feature"] = {
            "type": "object",
            "required": ["type", "geometry", "properties"],
            "properties": {
                "type": {"type": "string", "enum": ["Feature"]},
                "id": {"type": "string", "description": "Entspricht `properties.%s`" % cfg["id_field"]},
                "geometry": geometry_ref(entity["geometry"]),
                "properties": {"$ref": "#/components/schemas/" + singular + "Properties"},
            },
        }
        spec["components"]["schemas"][singular + "FeatureCollection"] = {
            "type": "object",
            "required": ["type", "features"],
            "properties": {
                "type": {"type": "string", "enum": ["FeatureCollection"]},
                "numberMatched": {"type": "integer", "description": "Gesamtzahl der Treffer (vor `limit`/`offset`)", "example": len(features)},
                "numberReturned": {"type": "integer", "description": "Anzahl Features in dieser Antwort", "example": min(len(features), 100)},
                "features": {"type": "array", "items": {"$ref": "#/components/schemas/" + singular + "Feature"}},
            },
        }

        example = feature_example(features)
        id_attr = next((a for a in entity["attributes"] if a["field"] == cfg["id_field"]), None)
        id_type, _ = json_type(id_attr.get("format") if id_attr else "string")
        id_example = example_value(features, cfg["id_field"])
        id_desc = "%s (`%s`)" % ((id_attr or {}).get("alias_de", cfg["id_field"]), cfg["id_field"])
        if id_type == "string" and isinstance(id_example, str) and "/" in id_example:
            id_desc += ". Enthält Schrägstriche und muss URL-codiert werden, z.B. `%s`." % id_example.replace("/", "%2F")

        params = [p for p in (filter_parameter(entity, f, features) for f in cfg["filters"]) if p] + common_list_parameters()

        spec["paths"]["/" + cfg["path"]] = {
            "get": {
                "tags": [tag],
                "operationId": "list" + singular + "s",
                "summary": "%s auflisten" % entity["name_de"],
                "description": "Alle %s als GeoJSON FeatureCollection. Unterstützt Attribut- und Bounding-Box-Filter sowie Paginierung." % entity["name_de"],
                "parameters": params,
                "responses": {
                    "200": {
                        "description": "GeoJSON FeatureCollection",
                        "content": {
                            "application/geo+json": {
                                "schema": {"$ref": "#/components/schemas/" + singular + "FeatureCollection"},
                                "example": {"type": "FeatureCollection", "numberMatched": len(features), "numberReturned": 1, "features": [example] if example else []},
                            }
                        },
                    },
                    "400": {"$ref": "#/components/responses/BadRequest"},
                    "401": {"$ref": "#/components/responses/Unauthorized"},
                    "429": {"$ref": "#/components/responses/TooManyRequests"},
                    "500": {"$ref": "#/components/responses/ServerError"},
                },
            }
        }
        spec["paths"]["/%s/{%s}" % (cfg["path"], cfg["id_field"])] = {
            "get": {
                "tags": [tag],
                "operationId": "get" + singular,
                "summary": "%s nach ID" % entity["name_de"],
                "description": "Einzelnes Objekt als GeoJSON Feature.",
                "parameters": [
                    {
                        "name": cfg["id_field"],
                        "in": "path",
                        "required": True,
                        "description": id_desc,
                        "schema": dict({"type": id_type}, **({"example": id_example} if id_example is not None else {})),
                    }
                ],
                "responses": {
                    "200": {
                        "description": "GeoJSON Feature",
                        "content": {
                            "application/geo+json": {
                                "schema": {"$ref": "#/components/schemas/" + singular + "Feature"},
                                "example": example,
                            }
                        },
                    },
                    "401": {"$ref": "#/components/responses/Unauthorized"},
                    "404": {"$ref": "#/components/responses/NotFound"},
                    "429": {"$ref": "#/components/responses/TooManyRequests"},
                    "500": {"$ref": "#/components/responses/ServerError"},
                },
            }
        }

    with io.open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("wrote %s (%d paths, %d schemas)" % (os.path.relpath(OUT_PATH, ROOT), len(spec["paths"]), len(spec["components"]["schemas"])))


if __name__ == "__main__":
    main()
