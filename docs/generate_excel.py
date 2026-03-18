"""
Generate BBL GIS IMMO Excel from the corrected data model specification.
Matches the color scheme of the original BBL GIS IMMO 01-02-2025.xlsx.

Usage:
    python docs/generate_excel.py
"""

import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

# ---------------------------------------------------------------------------
# Color scheme (matches original theme colors converted to RGB)
# ---------------------------------------------------------------------------
FILLS = {
    "internal_light": PatternFill("solid", fgColor="DEEBF6"),   # theme8 t0.8
    "internal_med":   PatternFill("solid", fgColor="BDD7EE"),   # theme8 t0.6
    "financial":      PatternFill("solid", fgColor="F7CBAC"),   # theme5 t0.6
    "people":         PatternFill("solid", fgColor="9CC3E5"),   # theme8 t0.4
    "address":        PatternFill("solid", fgColor="FBE5D5"),   # theme5 t0.8
    "coordinates":    PatternFill("solid", fgColor="E7E6E6"),   # theme2 t0.0
    "survey":         PatternFill("solid", fgColor="D8D8D8"),   # theme0 t-0.15
    "zoning":         PatternFill("solid", fgColor="FFF2CC"),   # theme7 t0.8
    "heritage":       PatternFill("solid", fgColor="E2EEDA"),   # theme9 t0.8
    "dimensions":     PatternFill("solid", fgColor="FBE5D5"),   # theme5 t0.8
    "other":          PatternFill("solid", fgColor="F2F2F2"),   # theme0 t-0.05
    "dev":            PatternFill("solid", fgColor="ED7D31"),   # theme5 t0.0
    "cleaning":       PatternFill("solid", fgColor="ED7D31"),   # DEV
    "workplaces":     PatternFill("solid", fgColor="ED7D31"),   # DEV
}

# Map: (business_object, merkmal_gruppe, status) -> fill key
def get_fill(biz_obj, gruppe, status, field=None):
    if status == "DEV":
        return FILLS["dev"]

    # Building-specific LIVE colors
    if biz_obj == "Building":
        if gruppe == "Internal Master Data":
            if field and field in ("bbl_awrt", "bbl_bwrt"):
                return FILLS["financial"]
            if field and field in ("bbl_ovtw", "bbl_pvtw"):
                return FILLS["people"]
            return FILLS["internal_light"]
        if gruppe == "Internal Master Data 2":
            if field and field in ("bbl_awrt", "bbl_bwrt"):
                return FILLS["financial"]
            return FILLS["internal_med"]
        if gruppe == "Address":
            return FILLS["address"]
        if gruppe == "Coordinates":
            return FILLS["coordinates"]
        if gruppe == "Official Survey":
            return FILLS["survey"]
        if gruppe == "Zoning":
            return FILLS["zoning"]
        if gruppe == "Heritage Protection":
            return FILLS["heritage"]
        if gruppe in ("Dimensions - SIA 416", "Dimensions - SIA 380"):
            return FILLS["dimensions"]
        if gruppe == "Other":
            return FILLS["other"]

    # Parcel LIVE colors (similar pattern)
    if biz_obj == "Parcel":
        if gruppe == "Internal Master Data":
            if field and field in ("bbl_awrt", "bbl_bwrt"):
                return FILLS["financial"]
            return FILLS["internal_light"]
        if gruppe == "Address":
            return FILLS["address"]
        if gruppe == "Coordinates":
            return FILLS["coordinates"]
        if gruppe == "Official Survey":
            return FILLS["survey"]
        if gruppe == "Zoning":
            return FILLS["zoning"]
        if gruppe in ("Dimensions - SIA 416", "Other Dimensions"):
            return FILLS["dimensions"]
        if gruppe == "Other":
            return FILLS["other"]

    # Land Cover, Building Envelope, Constr. Project
    if gruppe == "Internal Master Data":
        return FILLS["internal_light"]
    if gruppe == "Address":
        return FILLS["address"]
    if gruppe == "Coordinates":
        return FILLS["coordinates"]
    if gruppe == "Official Survey":
        return FILLS["survey"]
    if gruppe in ("Dimensions - SIA 416", "Dimensions - SIA 380",
                   "Dimensions - eBKP-H", "Other Dimensions"):
        return FILLS["dimensions"]
    if gruppe == "Other":
        return FILLS["other"]
    if gruppe == "Project Controlling":
        return FILLS["internal_med"]

    return FILLS["other"]


# ---------------------------------------------------------------------------
# Data rows: (id, status, application, biz_object, gruppe, alias_de, alias_en,
#             field, fmt, vl, source, desc_de, desc_en, key)
# ---------------------------------------------------------------------------
APP = "BBL GIS IMMO"

# fmt: off
ROWS = [
    # ==================== 1. Building ====================
    # 1.1 Internal Master Data
    (1, "LIVE", APP, "Building", "Internal Master Data", "BBL Status", "BBL Status", "bbl_stat", "String", "BBL_STATUS", "RE-FX Building", "Status entsprechend SAP", "Record status per SAP", ""),
    (2, "LIVE", APP, "Building", "Internal Master Data", "BBL ID", "BBL ID", "bbl_id", "String", "", "RE-FX Building", "Interne BBL ID (Buchungskreis/WE/Teilobjekt)", "Internal BBL ID (company code / economic unit / subobject)", "PK"),
    (3, "LIVE", APP, "Building", "Internal Master Data", "BBL Buchungskreis", "BBL Company Code", "bbl_buch", "String", "", "RE-FX Building", "Buchungskreis entsprechend SAP", "Company code per SAP", ""),
    (4, "LIVE", APP, "Building", "Internal Master Data", "BBL Wirtschaftseinheit", "BBL Economic Unit", "bbl_we", "String", "", "RE-FX Building", "Wirtschaftseinheit, gruppiert Teilobjekte nach kaufmannischer Logik", "Groups subobjects by commercial logic; linked to contracts and cash flows", "FK"),
    (5, "LIVE", APP, "Building", "Internal Master Data", "BBL Teilobjekt", "BBL Subobject", "bbl_tobj", "String", "", "RE-FX Building", "Teilobjekt, pro Wirtschaftseinheit indexiert", "Subobject number, indexed per economic unit (e.g. AF)", ""),
    (6, "LIVE", APP, "Building", "Internal Master Data", "BBL Bezeichnung", "BBL Designation", "bbl_bez", "String", "", "RE-FX Building", "Objektbezeichnung entsprechend SAP", "Object name per SAP", ""),
    # Address
    (7, "LIVE", APP, "Building", "Address", "Land", "Country", "adr_land", "String", "ISO_3166", "RE-FX Building", "Land", "Country", ""),
    (8, "LIVE", APP, "Building", "Address", "Region", "Region", "adr_reg", "String", "REGION", "RE-FX Building", "Region oder Kanton", "Region (international) or Canton (CH)", ""),
    (9, "LIVE", APP, "Building", "Address", "Ort", "City / Town", "adr_ort", "String", "", "RE-FX Building", "Ort", "City or town", ""),
    (10, "LIVE", APP, "Building", "Address", "Postleitzahl", "Postal Code", "adr_plz", "String", "", "RE-FX Building", "Postleitzahl", "Postal code", ""),
    (11, "LIVE", APP, "Building", "Address", "Strasse", "Street", "adr_str", "String", "", "RE-FX Building", "Strasse", "Street name", ""),
    (12, "LIVE", APP, "Building", "Address", "Hausnummer", "House Number", "adr_hsnr", "String", "", "RE-FX Building", "Hausnummer", "House number", ""),
    (13, "LIVE", APP, "Building", "Address", "Adresse", "Address", "adr_conct", "String", "", "Derived", "Verkettet aus Adressfeldern, ohne Trennzeichen", "Concatenated from adr_str + adr_hsnr + adr_plz + adr_ort, no separators", ""),
    # Coordinates
    (14, "LIVE", APP, "Building", "Coordinates", "WGS84 Latitude", "WGS84 Latitude", "wgs84_lat", "Double", "", "RE-FX Building", "Breitengrad WGS84", "WGS84 latitude", ""),
    (15, "LIVE", APP, "Building", "Coordinates", "WGS84 Longitude", "WGS84 Longitude", "wgs84_lon", "Double", "", "RE-FX Building", "Langengrad WGS84", "WGS84 longitude", ""),
    (182, "LIVE", APP, "Building", "Coordinates", "LV95 E", "LV95 E", "lv95_e", "Double", "", "Auto", "LV95 Ost, aus WGS84 hergeleitet", "LV95 easting, derived from WGS84", ""),
    (183, "LIVE", APP, "Building", "Coordinates", "LV95 N", "LV95 N", "lv95_n", "Double", "", "Auto", "LV95 Nord, aus WGS84 hergeleitet", "LV95 northing, derived from WGS84", ""),
    (18, "LIVE", APP, "Building", "Coordinates", "EGM Hohe", "EGM Elevation", "egm_elev", "Double", "", "Elevation Models", "Absolute Hohe in Meter (EGM2008)", "Absolute elevation in meters (EGM2008 geoid)", ""),
    # Internal Master Data 2 (continued, IDs 19-31)
    (19, "LIVE", APP, "Building", "Internal Master Data 2", "BBL Eigentum Art", "BBL Property Type", "bbl_eigen", "String", "BBL_PROP_TYPE", "RE-FX Building", "Eigentum Art entsprechend SAP", "Ownership type per SAP", ""),
    (20, "LIVE", APP, "Building", "Internal Master Data 2", "BBL Objektstrategie", "BBL Object Strategy", "bbl_ostr", "String", "BBL_STRATEGY", "RE-FX Building", "Objektstrategie entsprechend SAP", "Object strategy per SAP", ""),
    (21, "LIVE", APP, "Building", "Internal Master Data 2", "BBL Mietmodell", "BBL Rental Model", "bbl_mietm", "String", "BBL_RENTAL", "RE-FX Building", "Mietmodell entsprechend SAP", "Rental model per SAP", ""),
    (22, "LIVE", APP, "Building", "Internal Master Data 2", "BBL Baujahr", "BBL Construction Year", "bbl_bjahr", "Integer", "", "RE-FX Building", "Baujahr", "Year of construction", ""),
    (23, "LIVE", APP, "Building", "Internal Master Data 2", "BBL Verkaufsjahr", "BBL Sale Year", "bbl_vjahr", "Integer", "", "RE-FX Building", "Verkaufsjahr (leer wenn nicht verkauft)", "Year of sale (null if not sold)", ""),
    (24, "LIVE", APP, "Building", "Internal Master Data 2", "BBL Teilportfolio", "BBL Subportfolio", "bbl_port", "String", "BBL_PORTFOLIO", "RE-FX Building", "Teilportfolio entsprechend SAP", "Subportfolio assignment per SAP", ""),
    (25, "LIVE", APP, "Building", "Internal Master Data 2", "BBL Teilportfoliogruppe", "BBL Subportfolio Group", "bbl_port2", "String", "BBL_PORTF_GRP", "RE-FX Building", "Teilportfoliogruppe entsprechend SAP", "Subportfolio group per SAP", ""),
    (26, "LIVE", APP, "Building", "Internal Master Data 2", "BBL Anschaffungswert", "BBL Acquisition Value", "bbl_awrt", "Double", "", "RE-FX Building", "Anschaffungswert in CHF", "Acquisition value in CHF", ""),
    (27, "LIVE", APP, "Building", "Internal Master Data 2", "BBL Buchwert", "BBL Book Value", "bbl_bwrt", "Double", "", "RE-FX Building", "Buchwert des Gebaudeanlageguts in CHF", "Net book value of building asset in CHF", ""),
    (28, "LIVE", APP, "Building", "Internal Master Data 2", "BBL Gebaudeart 1", "BBL Building Type 1", "bbl_gbda1", "String", "BBL_BLDG_TYP1", "RE-FX Building", "Gebaudeart Stufe 1", "Building type level 1", ""),
    (29, "LIVE", APP, "Building", "Internal Master Data 2", "BBL Gebaudeart 2", "BBL Building Type 2", "bbl_gbda2", "String", "BBL_BLDG_TYP2", "RE-FX Building", "Gebaudeart Stufe 2", "Building type level 2", ""),
    (30, "LIVE", APP, "Building", "Internal Master Data 2", "BBL Objektverantwortlich", "BBL Object Responsible", "bbl_ovtw", "String", "", "RE-FX Building", "Objektverantwortliche Person", "Responsible person per SAP", ""),
    (31, "LIVE", APP, "Building", "Internal Master Data 2", "BBL Portfoliomanager", "BBL Portfolio Manager", "bbl_pvtw", "String", "", "RE-FX Building", "Portfoliomanager entsprechend SAP", "Portfolio manager per SAP", ""),
    # Cleaning (DEV)
    (32, "DEV", APP, "Building", "Cleaning", "Reinigung Gruppe", "Cleaning Group", "bbl_rgrp", "String", "BBL_CLEAN_GRP", "BBL Cleaning Excel", "Reinigungsgruppe", "Cleaning group assignment", ""),
    (33, "DEV", APP, "Building", "Cleaning", "Reinigung Fensterflache", "Cleaning Window Area", "garea_rff", "Double", "", "RE-FX Building", "Fensterflache fur Reinigung in m2", "Window area for cleaning in m2", ""),
    (34, "DEV", APP, "Building", "Cleaning", "Reinigung Glasflache", "Cleaning Glass Area", "garea_rgf", "Double", "", "RE-FX Building", "Glasflache fur Reinigung in m2", "Glass area for cleaning in m2", ""),
    # Official Survey
    (35, "LIVE", APP, "Building", "Official Survey", "AV EGID", "AV EGID", "av_egid", "String", "", "CH Official Survey", "Eidg. Gebaudeidentifikator (nur CH)", "Federal building ID per GWR (CH only)", "FK"),
    (36, "LIVE", APP, "Building", "Official Survey", "AV EGRID", "AV EGRID", "av_egrid", "String", "", "CH Official Survey", "Eidg. Grundstuckidentifikator (nur CH)", "Federal parcel ID per cadastre.ch (CH only)", "FK"),
    (37, "LIVE", APP, "Building", "Official Survey", "BFS Gemeindename", "BFS Municipality Name", "bfs_gem", "String", "", "CH GWR", "BFS Gemeindename", "Municipality name per BFS directory", ""),
    (38, "LIVE", APP, "Building", "Official Survey", "BFS Gemeindennummer", "BFS Municipality Number", "bfs_gemnr", "String", "", "CH GWR", "BFS Gemeindenummer", "Municipality number per BFS directory", "FK"),
    (39, "LIVE", APP, "Building", "Zoning", "AV Bauzone Bezeichnung", "AV Zoning Designation", "av_zbez", "String", "", "CH Zoning", "Bauzonenbezeichnung (ARE / Kantone)", "Construction zone name (ARE / cantonal)", ""),
    (40, "LIVE", APP, "Building", "Zoning", "AV Bauzone Nutzung", "AV Zoning Usage", "av_znut", "String", "", "CH Zoning", "Bauzonennutzung", "Construction zone usage type", ""),
    (41, "DEV", APP, "Building", "Official Survey", "AV Naturgefahren", "AV Natural Hazards", "av_nrisk", "String", "", "CH Zoning", "Naturgefahren-Klassifikation", "Natural hazard classification", ""),
    # Heritage Protection
    (42, "LIVE", APP, "Building", "Heritage Protection", "BBL Historische Ausstattung", "BBL Historical Collection", "bbl_hist", "String", "BBL_HISTORICAL", "RE-FX Building", "Historische Ausstattung", "Historical furnishing classification", ""),
    (43, "LIVE", APP, "Building", "Heritage Protection", "BBL Archivwurdigkeit", "BBL Archival Value", "bbl_arch", "String", "BBL_ARCHIVAL", "RE-FX Building", "Archivwurdigkeit", "Archival value classification", ""),
    (44, "LIVE", APP, "Building", "Heritage Protection", "BABS KGS Kategorie", "BABS KGS Category", "kgs_kat", "String", "KGS_CATEGORY", "CH KGS Inventory", "KGS-Inventar Kategorie", "Cultural property protection category", ""),
    (45, "LIVE", APP, "Building", "Heritage Protection", "BABS KGS Nummer", "BABS KGS Number", "kgs_nr", "Integer", "", "CH KGS Inventory", "KGS-Inventar ID", "Cultural property protection ID", "FK"),
    # Other
    (46, "LIVE", APP, "Building", "Other", "OBJECTID", "OBJECTID", "objectid", "Integer", "", "Auto", "ESRI ID fur GIS-Updates", "ESRI system ID for GIS updates", "UK"),
    # Workplaces (DEV)
    (47, "DEV", APP, "Building", "Workplaces", "Anzahl AP IST", "Count WP Actual", "bbl_api", "Integer", "", "BBL SAP Korasoft", "Aktuelle Anzahl Arbeitsplatze", "Current workplace count", ""),
    (48, "DEV", APP, "Building", "Workplaces", "Anzahl AP Reserve", "Count WP Reserve", "bbl_apr", "Integer", "", "BBL SAP Korasoft", "Anzahl Reserve-Arbeitsplatze", "Reserve workplace count", ""),
    (49, "DEV", APP, "Building", "Workplaces", "Anzahl AP Soll", "Count WP Target", "bbl_aps", "Integer", "", "BBL SAP Korasoft", "Soll-Anzahl Arbeitsplatze", "Target workplace count", ""),
    # Dimensions - SIA 416
    (50, "LIVE", APP, "Building", "Dimensions - SIA 416", "Geschossflache GF", "Floor Area GF", "garea_gf", "Double", "", "RE-FX, Estimate", "Geschossflache GF Total in m2", "Total floor area GF (SIA 416) in m2", ""),
    (51, "LIVE", APP, "Building", "Dimensions - SIA 416", "GF Oberirdisch", "Above-Ground Floor Area", "garea_gfo", "Double", "", "RE-FX, Estimate", "GF Oberirdisch in m2", "Above-ground GF (SIA 416) in m2", ""),
    (52, "LIVE", APP, "Building", "Dimensions - SIA 416", "GF Unterirdisch", "Underground Floor Area", "garea_gfu", "Double", "", "RE-FX, Estimate", "GF Unterirdisch in m2", "Underground GF (SIA 416) in m2", ""),
    (53, "LIVE", APP, "Building", "Dimensions - SIA 416", "Geschossflache Genauigkeit", "Floor Area Accuracy", "garea_acu", "String", "ACCURACY", "RE-FX, Estimate", "Genauigkeit und Datenherkunft", "Accuracy and data origin of area", ""),
    (54, "LIVE", APP, "Building", "Dimensions - SIA 416", "Netto-Geschossflache NGF", "Net Floor Area NGF", "garea_ngf", "Double", "", "RE-FX, Estimate", "Netto-Geschossflache in m2", "Net floor area NGF (SIA 416) in m2", ""),
    (55, "LIVE", APP, "Building", "Dimensions - SIA 416", "Nutzflache NF", "Usable Area NF", "garea_nf", "Double", "", "RE-FX, Estimate", "Nutzflache in m2", "Usable area NF (SIA 416) in m2", ""),
    (56, "LIVE", APP, "Building", "Dimensions - SIA 416", "Hauptnutzflache HNF", "Main Usable Area HNF", "garea_hnf", "Double", "", "RE-FX, Estimate", "Hauptnutzflache in m2", "Main usable area HNF (SIA 416) in m2", ""),
    (57, "LIVE", APP, "Building", "Dimensions - SIA 416", "Nebennutzflache NNF", "Ancillary Area NNF", "garea_nnf", "Double", "", "RE-FX, Estimate", "Nebennutzflache in m2", "Ancillary usable area NNF (SIA 416) in m2", ""),
    (58, "LIVE", APP, "Building", "Dimensions - SIA 416", "Funktionsflache FF", "Functional Area FF", "garea_ff", "Double", "", "RE-FX, Estimate", "Funktionsflache in m2", "Functional area FF (SIA 416) in m2", ""),
    (59, "LIVE", APP, "Building", "Dimensions - SIA 416", "Verkehrsflache VF", "Traffic Area VF", "garea_vf", "Double", "", "RE-FX, Estimate", "Verkehrsflache in m2", "Traffic/circulation area VF (SIA 416) in m2", ""),
    (60, "LIVE", APP, "Building", "Dimensions - SIA 416", "Vermietbare Flache VMF", "Rentable Area VMF", "garea_vmf", "Double", "", "RE-FX, Estimate", "Vermietbare Flache in m2", "Rentable area VMF (SIA 416) in m2", ""),
    (61, "LIVE", APP, "Building", "Dimensions - SIA 380", "Energiebezugsflache EBF", "Energy Reference Area EBF", "garea_ebf", "Double", "", "RE-FX, Estimate", "Energiebezugsflache in m2", "Energy reference area EBF (SIA 380) in m2", ""),
    (62, "LIVE", APP, "Building", "Dimensions - SIA 416", "Gebaudevolumen GV", "Building Volume GV", "gvol_gv", "Double", "", "RE-FX, Estimate", "Gebaudevolumen GV in m3", "Building volume GV (SIA 416) in m3", ""),
    (63, "LIVE", APP, "Building", "Dimensions - SIA 416", "GV Oberirdisch", "Above-Ground Volume", "gvol_gvo", "Double", "", "RE-FX, Estimate", "GV Oberirdisch in m3", "Above-ground volume (SIA 416) in m3", ""),
    (64, "LIVE", APP, "Building", "Dimensions - SIA 416", "GV Unterirdisch", "Underground Volume", "gvol_gvu", "Double", "", "RE-FX, Estimate", "GV Unterirdisch in m3", "Underground volume (SIA 416) in m3", ""),
    (65, "LIVE", APP, "Building", "Dimensions - SIA 416", "Gebaudevolumen Genauigkeit", "Volume Accuracy", "gvol_acu", "String", "ACCURACY", "RE-FX, Estimate", "Genauigkeit und Datenherkunft", "Accuracy and data origin of volume", ""),
    (66, "LIVE", APP, "Building", "Dimensions - SIA 416", "Anzahl Geschosse", "Number of Floors", "gastw", "Integer", "", "RE-FX, Estimate", "Anzahl Geschosse Total", "Total floor count", ""),
    (67, "LIVE", APP, "Building", "Dimensions - SIA 416", "Geschosse Oberirdisch", "Above-Ground Floors", "gastw_og", "Integer", "", "RE-FX, Estimate", "Geschosse Oberirdisch", "Above-ground floor count", ""),
    (68, "LIVE", APP, "Building", "Dimensions - SIA 416", "Geschosse Unterirdisch", "Underground Floors", "gastw_ug", "Integer", "", "RE-FX, Estimate", "Geschosse Unterirdisch", "Underground floor count", ""),
    (69, "LIVE", APP, "Building", "Dimensions - SIA 416", "Geschosse Genauigkeit", "Floor Count Accuracy", "gastw_acu", "String", "ACCURACY", "RE-FX, Estimate", "Genauigkeit und Datenherkunft", "Accuracy and data origin of floor count", ""),
    (70, "LIVE", APP, "Building", "Dimensions - SIA 416", "Gebaudegrundflache GGF", "Building Footprint GGF", "larea_ggf", "Double", "", "CH Official Survey", "Gebaudegrundflache in m2", "Building footprint GGF (SIA 416) in m2", ""),
    (71, "LIVE", APP, "Building", "Dimensions - SIA 416", "Grundstucksflache GSF", "Parcel Area GSF", "larea_gsf", "Double", "", "CH Official Survey", "Grundstucksflache in m2", "Parcel area GSF (SIA 416) in m2", ""),
    (72, "LIVE", APP, "Building", "Dimensions - SIA 416", "Umgebungsflache UF", "Surrounding Area UF", "larea_uf", "Double", "", "CH Official Survey", "Umgebungsflache in m2", "Surrounding area UF (SIA 416) in m2", ""),
    (73, "LIVE", APP, "Building", "Dimensions - SIA 416", "Grundstucksflache Genauigkeit", "Land Area Accuracy", "larea_acu", "String", "ACCURACY", "CH Official Survey", "Genauigkeit und Datenherkunft", "Accuracy and data origin of land area", ""),
    # ETL
    (192, "LIVE", APP, "Building", "Other", "ETL Zeitstempel", "ETL Timestamp", "etl_ts", "Date", "", "Auto", "Zeitstempel der letzten ETL-Synchronisation", "Timestamp of last ETL sync from source systems", ""),

    # ==================== 2. Land Cover ====================
    (74, "LIVE", APP, "Land Cover", "Internal Master Data", "BBL ID", "BBL ID", "bbl_id", "String", "", "RE-FX Building", "Interne BBL ID; Semikolon-getrennt bei Mehrfachzuordnung", "Internal BBL ID; semicolon-delimited if polygon covers multiple buildings", "FK"),
    (75, "LIVE", APP, "Land Cover", "Official Survey", "AV Status", "AV Status", "av_stat", "String", "AV_STATUS", "CH Official Survey", "Status entsprechend GWR (nur CH)", "Building footprint status per GWR (CH only)", ""),
    (76, "LIVE", APP, "Land Cover", "Official Survey", "AV EGID", "AV EGID", "av_egid", "String", "", "CH Official Survey", "Eidg. Gebaudeidentifikator (nur CH)", "Federal building ID per GWR (CH only)", "FK"),
    (77, "LIVE", APP, "Land Cover", "Official Survey", "AV EGRID", "AV EGRID", "av_egrid", "String", "", "CH Official Survey", "Eidg. Grundstuckidentifikator (nur CH)", "Federal parcel ID per cadastre.ch (CH only)", "FK"),
    (78, "LIVE", APP, "Land Cover", "Official Survey", "AV Typ", "AV Type", "av_type", "String", "AV_COVER_TYPE", "CH Official Survey", "Bodenabdeckungstyp", "Land cover type per official survey", ""),
    (79, "LIVE", APP, "Land Cover", "Coordinates", "WGS84 Latitude", "WGS84 Latitude", "wgs84_lat", "Double", "", "CH Official Survey", "Breitengrad WGS84", "WGS84 latitude", ""),
    (80, "LIVE", APP, "Land Cover", "Coordinates", "WGS84 Longitude", "WGS84 Longitude", "wgs84_lon", "Double", "", "CH Official Survey", "Langengrad WGS84", "WGS84 longitude", ""),
    (184, "LIVE", APP, "Land Cover", "Coordinates", "LV95 E", "LV95 E", "lv95_e", "Double", "", "Auto", "LV95 Ost, aus WGS84 hergeleitet", "LV95 easting, derived from WGS84", ""),
    (185, "LIVE", APP, "Land Cover", "Coordinates", "LV95 N", "LV95 N", "lv95_n", "Double", "", "Auto", "LV95 Nord, aus WGS84 hergeleitet", "LV95 northing, derived from WGS84", ""),
    (81, "LIVE", APP, "Land Cover", "Other", "FID", "FID", "fid", "String", "", "Various", "Architektur-Objekt-ID fur externe Geometrie", "External geometry object ID", "FK"),
    (82, "LIVE", APP, "Land Cover", "Other", "FID Quelle", "FID Source", "fid_src", "String", "", "Various", "Quelle der Geometrie", "Source of external geometry", ""),
    (83, "LIVE", APP, "Land Cover", "Other", "OBJECTID", "OBJECTID", "objectid", "Integer", "", "Auto", "ESRI ID fur GIS-Updates", "ESRI system ID for GIS updates", "PK"),
    (193, "LIVE", APP, "Land Cover", "Other", "ETL Zeitstempel", "ETL Timestamp", "etl_ts", "Date", "", "Auto", "Zeitstempel der letzten ETL-Synchronisation", "Timestamp of last ETL sync", ""),

    # ==================== 3. Parcel ====================
    (84, "LIVE", APP, "Parcel", "Internal Master Data", "Status", "BBL Status", "bbl_stat", "String", "BBL_STATUS", "RE-FX Parcel", "Status entsprechend SAP", "Record status per SAP", ""),
    (85, "LIVE", APP, "Parcel", "Internal Master Data", "BBL ID", "BBL ID", "bbl_id", "String", "", "RE-FX Parcel", "Interne BBL ID (Buchungskreis/WE/Teilobjekt)", "Internal BBL ID (company code / economic unit / subobject)", "PK"),
    (86, "LIVE", APP, "Parcel", "Internal Master Data", "BBL Buchungskreis", "BBL Company Code", "bbl_buch", "String", "", "RE-FX Parcel", "Buchungskreis entsprechend SAP", "Company code per SAP", ""),
    (87, "LIVE", APP, "Parcel", "Internal Master Data", "BBL Wirtschaftseinheit", "BBL Economic Unit", "bbl_we", "String", "", "RE-FX Parcel", "Wirtschaftseinheit", "Groups subobjects by commercial logic", "FK"),
    (88, "LIVE", APP, "Parcel", "Internal Master Data", "BBL Teilobjekt", "BBL Subobject", "bbl_tobj", "String", "", "RE-FX Parcel", "Teilobjekt", "Subobject number (e.g. AF)", ""),
    (89, "LIVE", APP, "Parcel", "Internal Master Data", "BBL Bezeichnung", "BBL Designation", "bbl_bez", "String", "", "RE-FX Parcel", "Objektbezeichnung", "Object name per SAP", ""),
    (90, "LIVE", APP, "Parcel", "Internal Master Data", "BBL Teilportfolio", "BBL Subportfolio", "bbl_port", "String", "BBL_PORTFOLIO", "RE-FX Parcel", "Teilportfolio-Zuordnung", "Subportfolio assignment", ""),
    (91, "LIVE", APP, "Parcel", "Internal Master Data", "BBL Mietmodell", "BBL Rental Model", "bbl_mietm", "String", "BBL_RENTAL", "RE-FX Parcel", "Mietmodell entsprechend SAP", "Rental model per SAP", ""),
    (92, "LIVE", APP, "Parcel", "Internal Master Data", "BBL Eigentum Art", "BBL Property Type", "bbl_eigen", "String", "BBL_PROP_TYPE", "RE-FX Parcel", "Eigentum Art entsprechend SAP", "Ownership type per SAP", ""),
    (93, "LIVE", APP, "Parcel", "Address", "Land", "Country", "adr_land", "String", "ISO_3166", "RE-FX Parcel", "Land", "Country", ""),
    (94, "LIVE", APP, "Parcel", "Address", "Region", "Region", "adr_reg", "String", "REGION", "RE-FX Parcel", "Region oder Kanton", "Region (international) or Canton (CH)", ""),
    (95, "LIVE", APP, "Parcel", "Address", "Ort", "City / Town", "adr_ort", "String", "", "RE-FX Parcel", "Ort", "City or town", ""),
    (96, "LIVE", APP, "Parcel", "Address", "Postleitzahl", "Postal Code", "adr_plz", "String", "", "RE-FX Parcel", "Postleitzahl", "Postal code", ""),
    (97, "LIVE", APP, "Parcel", "Address", "Strasse", "Street", "adr_str", "String", "", "RE-FX Parcel", "Strasse", "Street name", ""),
    (98, "LIVE", APP, "Parcel", "Address", "Hausnummer", "House Number", "adr_hsnr", "String", "", "RE-FX Parcel", "Hausnummer", "House number", ""),
    (99, "LIVE", APP, "Parcel", "Address", "Adresse", "Address", "adr_conct", "String", "", "Derived", "Adresse verkettet, ohne Trennzeichen", "Concatenated address, no separators", ""),
    (100, "LIVE", APP, "Parcel", "Coordinates", "WGS84 Latitude", "WGS84 Latitude", "wgs84_lat", "Double", "", "RE-FX Parcel", "Breitengrad WGS84 (Punkt im Polygon)", "WGS84 latitude (point-in-polygon)", ""),
    (101, "LIVE", APP, "Parcel", "Coordinates", "WGS84 Longitude", "WGS84 Longitude", "wgs84_lon", "Double", "", "RE-FX Parcel", "Langengrad WGS84 (Punkt im Polygon)", "WGS84 longitude (point-in-polygon)", ""),
    (186, "LIVE", APP, "Parcel", "Coordinates", "LV95 E", "LV95 E", "lv95_e", "Double", "", "Auto", "LV95 Ost, aus WGS84 hergeleitet", "LV95 easting, derived from WGS84", ""),
    (187, "LIVE", APP, "Parcel", "Coordinates", "LV95 N", "LV95 N", "lv95_n", "Double", "", "Auto", "LV95 Nord, aus WGS84 hergeleitet", "LV95 northing, derived from WGS84", ""),
    (102, "LIVE", APP, "Parcel", "Coordinates", "EGM Hohe", "EGM Elevation", "egm_elev", "Double", "", "Auto", "Absolute Hohe in Meter (EGM2008)", "Absolute elevation in meters (EGM2008 geoid)", ""),
    (103, "LIVE", APP, "Parcel", "Official Survey", "AV Status", "AV Status", "av_stat", "String", "AV_STATUS", "CH Official Survey", "Status Amtliche Vermessung", "Status per official survey", ""),
    (104, "LIVE", APP, "Parcel", "Official Survey", "AV EGRID", "AV EGRID", "av_egrid", "String", "", "CH Official Survey", "Eidg. Grundstuckidentifikator (nur CH)", "Federal parcel ID (CH only)", "FK"),
    (105, "LIVE", APP, "Parcel", "Internal Master Data", "BBL Anschaffungswert", "BBL Acquisition Value", "bbl_awrt", "Double", "", "RE-FX Parcel", "Anschaffungswert in CHF", "Acquisition value in CHF", ""),
    (106, "LIVE", APP, "Parcel", "Internal Master Data", "BBL Buchwert", "BBL Book Value", "bbl_bwrt", "Double", "", "RE-FX Parcel", "Kumulierte Baumassnahmen am Grundstuck in CHF", "Cumulative construction expenditure on parcel in CHF", ""),
    (107, "LIVE", APP, "Parcel", "Internal Master Data", "Historischer Garten", "Historical Garden", "bbl_hgart", "Boolean", "", "BBL SAP Property Inv.", "Kennzeichnung als historischer Garten", "Designated as historical garden", ""),
    (108, "LIVE", APP, "Parcel", "Dimensions - SIA 416", "Gebaudegrundflache GGF", "Building Footprint GGF", "larea_ggf", "Double", "", "CH Official Survey", "Summe Gebaudegrundflache pro Grundstuck in m2", "Sum building footprint per parcel in m2", ""),
    (109, "LIVE", APP, "Parcel", "Dimensions - SIA 416", "Grundstucksflache GSF", "Parcel Area GSF", "larea_gsf", "Double", "", "CH Official Survey", "Grundstucksflache in m2", "Parcel area GSF (SIA 416) in m2", ""),
    (110, "LIVE", APP, "Parcel", "Dimensions - SIA 416", "Umgebungsflache UF", "Surrounding Area UF", "larea_uf", "Double", "", "CH Official Survey", "Umgebungsflache pro Grundstuck in m2", "Surrounding area per parcel in m2", ""),
    (111, "LIVE", APP, "Parcel", "Dimensions - SIA 416", "Bearbeitete Umgebungsflache BUF", "Processed Surrounding BUF", "larea_buf", "Double", "", "CH Official Survey", "Bearbeitete Umgebungsflache in m2", "Processed surrounding area per parcel in m2", ""),
    (112, "LIVE", APP, "Parcel", "Dimensions - SIA 416", "Unbearbeitete Umgebungsflache UUF", "Unprocessed Surrounding UUF", "larea_uuf", "Double", "", "CH Official Survey", "Unbearbeitete Umgebungsflache in m2", "Unprocessed surrounding area per parcel in m2", ""),
    (113, "LIVE", APP, "Parcel", "Dimensions - SIA 416", "Grundstucksflache Genauigkeit", "Land Area Accuracy", "larea_acu", "String", "ACCURACY", "CH Official Survey", "Genauigkeit und Datenherkunft", "Accuracy and data origin", ""),
    (114, "LIVE", APP, "Parcel", "Other Dimensions", "Versiegelte Flache", "Sealed Area", "larea_ver", "Double", "", "CH Official Survey", "Versiegelte Flache pro Grundstuck in m2", "Sealed surface per parcel in m2", ""),
    (115, "LIVE", APP, "Parcel", "Other Dimensions", "Grunflache", "Green Space", "larea_gre", "Double", "", "CH Official Survey", "Grunflachen, Grundlage fur Auswertung", "Green space, basis for nature-oriented care analysis", ""),
    (116, "LIVE", APP, "Parcel", "Official Survey", "BFS Gemeindename", "BFS Municipality Name", "bfs_gem", "String", "", "CH Official Survey", "BFS Gemeindename", "Municipality name per BFS", ""),
    (117, "LIVE", APP, "Parcel", "Official Survey", "BFS Gemeindennummer", "BFS Municipality Number", "bfs_gemnr", "String", "", "CH Official Survey", "BFS Gemeindenummer", "Municipality number per BFS", "FK"),
    (118, "LIVE", APP, "Parcel", "Official Survey", "AV Grundstucksnummer", "AV Parcel Number", "av_nr", "String", "", "CH Official Survey", "Grundstucksnummer pro Gemeinde", "Parcel number per municipality (unique with bfs_gemnr)", "UK"),
    (119, "LIVE", APP, "Parcel", "Zoning", "AV Bauzone Bezeichnung", "AV Zoning Designation", "av_zbez", "String", "", "CH Zoning", "Bauzonenbezeichnung", "Construction zone name (ARE / cantonal)", ""),
    (120, "LIVE", APP, "Parcel", "Zoning", "AV Bauzone Nutzung", "AV Zoning Usage", "av_znut", "String", "", "CH Official Survey", "Bauzonennutzung", "Construction zone usage type", ""),
    (121, "DEV", APP, "Parcel", "Official Survey", "AV Naturgefahren", "AV Natural Hazards", "av_nrisk", "String", "", "CH Zoning", "Naturgefahren-Klassifikation", "Natural hazard classification", ""),
    (122, "LIVE", APP, "Parcel", "Other", "FID", "FID", "fid", "String", "", "CH Official Survey", "Architektur-Objekt-ID fur externe Geometrie", "External geometry object ID", "FK"),
    (123, "LIVE", APP, "Parcel", "Other", "FID Quelle", "FID Source", "fid_src", "String", "", "CH Official Survey", "Quelle der Geometrie", "Source of external geometry", ""),
    (124, "LIVE", APP, "Parcel", "Other", "OBJECTID", "OBJECTID", "objectid", "Integer", "", "Auto", "ESRI ID fur GIS-Updates", "ESRI system ID for GIS updates", "UK"),
    (194, "LIVE", APP, "Parcel", "Other", "ETL Zeitstempel", "ETL Timestamp", "etl_ts", "Date", "", "Auto", "Zeitstempel der letzten ETL-Synchronisation", "Timestamp of last ETL sync", ""),

    # ==================== 4. Building Envelope (all DEV) ====================
    (125, "DEV", APP, "Building Envelope", "Internal Master Data", "BBL ID", "BBL ID", "bbl_id", "String", "", "BBL SAP Property Inv.", "Interne BBL ID; Semikolon-getrennt bei Mehrfachzuordnung", "Internal BBL ID; semicolon-delimited if multiple apply", "FK"),
    (126, "DEV", APP, "Building Envelope", "Official Survey", "AV Status", "AV Status", "av_stat", "String", "AV_STATUS", "CH Official Survey", "Status Amtliche Vermessung", "Status per official survey", ""),
    (127, "DEV", APP, "Building Envelope", "Official Survey", "AV EGID", "AV EGID", "av_egid", "String", "", "CH Official Survey", "Eidg. Gebaudeidentifikator (nur CH)", "Federal building ID per GWR (CH only)", "FK"),
    (128, "DEV", APP, "Building Envelope", "Official Survey", "AV EGRID", "AV EGRID", "av_egrid", "String", "", "CH Official Survey", "Eidg. Grundstuckidentifikator (nur CH)", "Federal parcel ID (CH only)", "FK"),
    (129, "DEV", APP, "Building Envelope", "Address", "Land", "Country", "adr_land", "String", "ISO_3166", "BFS GWR, RE-FX", "Land", "Country", ""),
    (130, "DEV", APP, "Building Envelope", "Address", "Region", "Region", "adr_reg", "String", "REGION", "BFS GWR, RE-FX", "Region oder Kanton", "Region (international) or Canton (CH)", ""),
    (131, "DEV", APP, "Building Envelope", "Address", "Ort", "City / Town", "adr_ort", "String", "", "BFS GWR, RE-FX", "Ort", "City or town", ""),
    (132, "DEV", APP, "Building Envelope", "Address", "Postleitzahl", "Postal Code", "adr_plz", "String", "", "BFS GWR, RE-FX", "Postleitzahl", "Postal code", ""),
    (133, "DEV", APP, "Building Envelope", "Address", "Strasse", "Street", "adr_str", "String", "", "BFS GWR, RE-FX", "Strasse", "Street name", ""),
    (134, "DEV", APP, "Building Envelope", "Address", "Hausnummer", "House Number", "adr_hsnr", "String", "", "BFS GWR, RE-FX", "Hausnummer", "House number", ""),
    (135, "DEV", APP, "Building Envelope", "Address", "Adresse", "Address", "adr_conct", "String", "", "Derived", "Adresse verkettet", "Concatenated address", ""),
    (136, "DEV", APP, "Building Envelope", "Coordinates", "WGS84 Latitude", "WGS84 Latitude", "wgs84_lat", "Double", "", "BFS GWR, RE-FX", "Breitengrad WGS84", "WGS84 latitude", ""),
    (137, "DEV", APP, "Building Envelope", "Coordinates", "WGS84 Longitude", "WGS84 Longitude", "wgs84_lon", "Double", "", "BFS GWR, RE-FX", "Langengrad WGS84", "WGS84 longitude", ""),
    (188, "DEV", APP, "Building Envelope", "Coordinates", "LV95 E", "LV95 E", "lv95_e", "Double", "", "Auto", "LV95 Ost, aus WGS84 hergeleitet", "LV95 easting, derived from WGS84", ""),
    (189, "DEV", APP, "Building Envelope", "Coordinates", "LV95 N", "LV95 N", "lv95_n", "Double", "", "Auto", "LV95 Nord, aus WGS84 hergeleitet", "LV95 northing, derived from WGS84", ""),
    (138, "DEV", APP, "Building Envelope", "Coordinates", "EGM Hohe", "EGM Elevation", "egm_elev", "Double", "", "Elevation Models", "Absolute Hohe in Meter (EGM2008)", "Absolute elevation in meters (EGM2008 geoid)", ""),
    (139, "DEV", APP, "Building Envelope", "Dimensions - SIA 416", "Geschossflache GF", "Floor Area GF", "garea_gf", "Double", "", "RE-FX, Estimate", "Geschossflache GF Total in m2", "Total floor area GF (SIA 416) in m2", ""),
    (140, "DEV", APP, "Building Envelope", "Dimensions - SIA 416", "Geschossflache Genauigkeit", "Floor Area Accuracy", "garea_acu", "String", "ACCURACY", "RE-FX, Estimate", "Genauigkeit und Datenherkunft", "Accuracy and data origin", ""),
    (141, "DEV", APP, "Building Envelope", "Dimensions - SIA 380", "Energiebezugsflache EBF", "Energy Reference Area EBF", "garea_ebf", "Double", "", "RE-FX, Estimate", "Energiebezugsflache in m2", "Energy reference area (SIA 380) in m2", ""),
    (142, "DEV", APP, "Building Envelope", "Dimensions - SIA 416", "Gebaudevolumen GV", "Building Volume GV", "gvol_gv", "Double", "", "RE-FX, Estimate", "Gebaudevolumen GV in m3", "Building volume GV (SIA 416) in m3", ""),
    (143, "DEV", APP, "Building Envelope", "Dimensions - SIA 416", "Gebaudevolumen Genauigkeit", "Volume Accuracy", "gvol_acu", "String", "ACCURACY", "RE-FX, Estimate", "Genauigkeit und Datenherkunft", "Accuracy and data origin", ""),
    (144, "DEV", APP, "Building Envelope", "Dimensions - SIA 416", "Anzahl Geschosse", "Number of Floors", "gastw", "Integer", "", "RE-FX, Estimate", "Anzahl Geschosse Total", "Total floor count", ""),
    (145, "DEV", APP, "Building Envelope", "Dimensions - SIA 416", "Geschosse Genauigkeit", "Floor Count Accuracy", "gastw_acu", "String", "ACCURACY", "RE-FX, Estimate", "Genauigkeit und Datenherkunft", "Accuracy and data origin", ""),
    (146, "DEV", APP, "Building Envelope", "Dimensions - SIA 416", "Gebaudegrundflache GGF", "Building Footprint GGF", "larea_ggf", "Double", "", "CH Official Survey", "Gebaudegrundflache in m2", "Building footprint (SIA 416) in m2", ""),
    (147, "DEV", APP, "Building Envelope", "Dimensions - SIA 416", "Grundstucksflache GSF", "Parcel Area GSF", "larea_gsf", "Double", "", "CH Official Survey", "Grundstucksflache in m2", "Parcel area (SIA 416) in m2", ""),
    (148, "DEV", APP, "Building Envelope", "Dimensions - SIA 416", "Umgebungsflache UF", "Surrounding Area UF", "larea_uf", "Double", "", "CH Official Survey", "Umgebungsflache in m2", "Surrounding area (SIA 416) in m2", ""),
    (149, "DEV", APP, "Building Envelope", "Dimensions - SIA 416", "Grundstucksflache Genauigkeit", "Land Area Accuracy", "larea_acu", "String", "ACCURACY", "CH Official Survey", "Genauigkeit und Datenherkunft", "Accuracy and data origin", ""),
    (150, "DEV", APP, "Building Envelope", "Dimensions - eBKP-H", "Flache Dach DAF", "Roof Area DAF", "garea_daf", "Double", "", "Various", "Dachflache in m2", "Roof area (eBKP-H) in m2", ""),
    (151, "DEV", APP, "Building Envelope", "Dimensions - eBKP-H", "Flache Aussenwand AWF", "Exterior Wall Area AWF", "garea_awf", "Double", "", "Various", "Aussenwandflache in m2", "Exterior wall area (eBKP-H) in m2", ""),
    (152, "DEV", APP, "Building Envelope", "Other", "FID", "FID", "fid", "String", "", "Various", "Architektur-Objekt-ID", "External geometry object ID", "FK"),
    (153, "DEV", APP, "Building Envelope", "Other", "FID Quelle", "FID Source", "fid_src", "String", "", "Various", "Quelle der Geometrie", "Source of external geometry", ""),
    (154, "DEV", APP, "Building Envelope", "Other", "OBJECTID", "OBJECTID", "objectid", "Integer", "", "Auto", "ESRI ID fur GIS-Updates", "ESRI system ID for GIS updates", "PK"),
    (195, "DEV", APP, "Building Envelope", "Other", "ETL Zeitstempel", "ETL Timestamp", "etl_ts", "Date", "", "Auto", "Zeitstempel der letzten ETL-Synchronisation", "Timestamp of last ETL sync", ""),

    # ==================== 5. Construction Project (all DEV) ====================
    (155, "DEV", APP, "Construction Project", "Internal Master Data", "BBL Status", "BBL Status", "bbl_stat", "String", "BBL_STATUS", "BBL SAP Project Ctrl.", "Status entsprechend SAP", "Project status per SAP", ""),
    (156, "DEV", APP, "Construction Project", "Internal Master Data", "BBL ID", "BBL ID", "bbl_id", "String", "", "BBL SAP Project Ctrl.", "Interne BBL ID", "Internal BBL ID", "PK"),
    (157, "DEV", APP, "Construction Project", "Internal Master Data", "BBL Bezeichnung", "BBL Designation", "bbl_bez", "String", "", "BBL SAP Project Ctrl.", "Objektbezeichnung", "Project name per SAP", ""),
    (158, "DEV", APP, "Construction Project", "Internal Master Data", "BBL Buchungskreis", "BBL Company Code", "bbl_buch", "String", "", "BBL SAP Project Ctrl.", "Buchungskreis", "Company code per SAP", ""),
    (159, "DEV", APP, "Construction Project", "Internal Master Data", "BBL Wirtschaftseinheit", "BBL Economic Unit", "bbl_we", "String", "", "BBL SAP Project Ctrl.", "Wirtschaftseinheit", "Economic unit", "FK"),
    (160, "DEV", APP, "Construction Project", "Address", "Land", "Country", "adr_land", "String", "ISO_3166", "BBL SAP Project Ctrl.", "Land", "Country", ""),
    (161, "DEV", APP, "Construction Project", "Address", "Region", "Region", "adr_reg", "String", "REGION", "BBL SAP Project Ctrl.", "Region oder Kanton", "Region (international) or Canton (CH)", ""),
    (162, "DEV", APP, "Construction Project", "Address", "Ort", "City / Town", "adr_ort", "String", "", "BBL SAP Project Ctrl.", "Ort", "City or town", ""),
    (163, "DEV", APP, "Construction Project", "Address", "Postleitzahl", "Postal Code", "adr_plz", "String", "", "BBL SAP Project Ctrl.", "Postleitzahl", "Postal code", ""),
    (164, "DEV", APP, "Construction Project", "Address", "Strasse", "Street", "adr_str", "String", "", "BBL SAP Project Ctrl.", "Strasse", "Street name", ""),
    (165, "DEV", APP, "Construction Project", "Address", "Hausnummer", "House Number", "adr_hsnr", "String", "", "BBL SAP Project Ctrl.", "Hausnummer", "House number", ""),
    (166, "DEV", APP, "Construction Project", "Address", "Adresse", "Address", "adr_conct", "String", "", "Derived", "Adresse verkettet", "Concatenated address", ""),
    (167, "DEV", APP, "Construction Project", "Coordinates", "WGS84 Latitude", "WGS84 Latitude", "wgs84_lat", "Double", "", "BBL SAP Property Inv.", "Breitengrad WGS84", "WGS84 latitude", ""),
    (168, "DEV", APP, "Construction Project", "Coordinates", "WGS84 Longitude", "WGS84 Longitude", "wgs84_lon", "Double", "", "BBL SAP Property Inv.", "Langengrad WGS84", "WGS84 longitude", ""),
    (190, "DEV", APP, "Construction Project", "Coordinates", "LV95 E", "LV95 E", "lv95_e", "Double", "", "Auto", "LV95 Ost, aus WGS84 hergeleitet", "LV95 easting, derived from WGS84", ""),
    (191, "DEV", APP, "Construction Project", "Coordinates", "LV95 N", "LV95 N", "lv95_n", "Double", "", "Auto", "LV95 Nord, aus WGS84 hergeleitet", "LV95 northing, derived from WGS84", ""),
    (169, "DEV", APP, "Construction Project", "Coordinates", "EGM Hohe", "EGM Elevation", "egm_elev", "Double", "", "BBL SAP Property Inv.", "Absolute Hohe in Meter (EGM2008)", "Absolute elevation in meters (EGM2008 geoid)", ""),
    (170, "DEV", APP, "Construction Project", "Project Controlling", "BBL Typ der Auftraggeber", "BBL Client Type", "bbl_ptag", "String", "BBL_CLIENT_TYP", "BBL SAP Project Ctrl.", "Typ des Auftraggebers", "Type of client commissioning the project", ""),
    (171, "DEV", APP, "Construction Project", "Project Controlling", "BBL Art der Bauwerke", "BBL Structure Category", "bbl_partb", "String", "BBL_STRUCT_CAT", "BBL SAP Project Ctrl.", "Art der Bauwerke", "Category of structures in the project", ""),
    (172, "DEV", APP, "Construction Project", "Project Controlling", "BBL Typ der Bauwerke", "BBL Structure Type", "bbl_ptypb", "String", "BBL_STRUCT_TYP", "BBL SAP Project Ctrl.", "Typ der Bauwerke", "Type of structures in the project", ""),
    (173, "DEV", APP, "Construction Project", "Project Controlling", "BBL Projektart", "BBL Project Type", "bbl_part", "String", "BBL_PROJ_TYPE", "BBL SAP Project Ctrl.", "Projektart (Neubau, Sanierung, etc.)", "Project type (new build, renovation, etc.)", ""),
    (174, "DEV", APP, "Construction Project", "Project Controlling", "BBL Projektkosten total", "BBL Total Project Cost", "bbl_pkost", "Double", "", "BBL SAP Project Ctrl.", "Gesamtkosten in CHF", "Total project cost in CHF", ""),
    (175, "DEV", APP, "Construction Project", "Project Controlling", "BBL Datum Baueingabe", "BBL Submission Date", "bbl_pdtin", "Date", "", "BBL SAP Project Ctrl.", "Datum der Baueingabe", "Building submission date", ""),
    (176, "DEV", APP, "Construction Project", "Project Controlling", "BBL Datum Baubewilligung", "BBL Permit Date", "bbl_pdtok", "Date", "", "BBL SAP Project Ctrl.", "Datum der Baubewilligung", "Building permit date", ""),
    (177, "DEV", APP, "Construction Project", "Project Controlling", "BBL Datum Baubeginn", "BBL Construction Start", "bbl_pdtbb", "Date", "", "BBL SAP Project Ctrl.", "Datum des Baubeginns", "Construction start date", ""),
    (178, "DEV", APP, "Construction Project", "Project Controlling", "BBL Datum Bauende", "BBL Construction End", "bbl_pdtbe", "Date", "", "BBL SAP Project Ctrl.", "Geplantes oder tatsachliches Bauende", "Planned or actual construction end date", ""),
    (179, "DEV", APP, "Construction Project", "Project Controlling", "BBL Voraussichtliche Baudauer", "BBL Est. Duration", "bbl_pvbd", "String", "", "BBL SAP Project Ctrl.", "Voraussichtliche Baudauer", "Estimated construction duration", ""),
    (180, "DEV", APP, "Construction Project", "Project Controlling", "BBL Freitextfeld Projekt 1", "BBL Project Text 1", "bbl_ptxt1", "String", "", "BBL SAP Project Ctrl.", "Freitextfeld fur Projektangaben", "Free text for project notes", ""),
    (181, "DEV", APP, "Construction Project", "Project Controlling", "BBL Freitextfeld Projekt 2", "BBL Project Text 2", "bbl_ptxt2", "String", "", "BBL SAP Project Ctrl.", "Freitextfeld fur Projektangaben", "Free text for project notes", ""),
    (196, "DEV", APP, "Construction Project", "Other", "ETL Zeitstempel", "ETL Timestamp", "etl_ts", "Date", "", "Auto", "Zeitstempel der letzten ETL-Synchronisation", "Timestamp of last ETL sync", ""),
]
# fmt: on

# ---------------------------------------------------------------------------
# Column definitions
# ---------------------------------------------------------------------------
HEADERS = [
    "ID", "Status", "Anwendung", "Geschaeftsobjekt", "Merkmal Gruppe",
    "Merkmal Alias DE", "Merkmal Alias EN", "Merkmal DB", "Merkmal DB Len",
    "Format", "Werteliste", "Herkunft", "Beschreibung DE", "Key",
    "Beschreibung EN",
]

COL_WIDTHS = {
    "A": 6, "B": 8, "C": 16, "D": 22, "E": 30, "F": 35, "G": 40,
    "H": 16, "I": 14, "J": 10, "K": 16, "L": 28, "M": 60, "N": 6,
    "O": 60,
}

HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
HEADER_FILL = PatternFill("solid", fgColor="4472C4")
DATA_FONT = Font(name="Calibri", size=11)
THIN_BORDER = Border(
    left=Side(style="thin", color="D9D9D9"),
    right=Side(style="thin", color="D9D9D9"),
    top=Side(style="thin", color="D9D9D9"),
    bottom=Side(style="thin", color="D9D9D9"),
)


def main():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Attribute"

    # Write headers
    for col_idx, header in enumerate(HEADERS, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center",
                                   wrap_text=True)
        cell.border = THIN_BORDER

    # Set column widths
    for letter, width in COL_WIDTHS.items():
        ws.column_dimensions[letter].width = width

    # Freeze top row
    ws.freeze_panes = "A2"

    # Write data rows
    for row_idx, row_data in enumerate(ROWS, 2):
        (rid, status, app, biz_obj, gruppe, alias_de, alias_en,
         field, fmt, vl, source, desc_de, desc_en, key) = row_data

        field_len = len(field)

        values = [
            rid, status, app, biz_obj, gruppe,
            alias_de, alias_en, field, field_len,
            fmt, vl, source, desc_de, key, desc_en,
        ]

        fill = get_fill(biz_obj, gruppe, status, field)

        for col_idx, value in enumerate(values, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.font = DATA_FONT
            cell.fill = fill
            cell.border = THIN_BORDER
            if col_idx in (1, 2, 9, 14):  # ID, Status, Len, Key
                cell.alignment = Alignment(horizontal="center")
            else:
                cell.alignment = Alignment(vertical="top", wrap_text=True)

    # Add Excel table
    last_row = len(ROWS) + 1
    last_col = get_column_letter(len(HEADERS))
    table_ref = f"A1:{last_col}{last_row}"
    table = Table(displayName="AttributeTable", ref=table_ref)
    style = TableStyleInfo(
        name="TableStyleLight1",
        showFirstColumn=False,
        showLastColumn=False,
        showRowStripes=False,
        showColumnStripes=False,
    )
    table.tableStyleInfo = style
    ws.add_table(table)

    # Add autofilter
    ws.auto_filter.ref = table_ref

    # Create empty Werteliste sheet
    ws2 = wb.create_sheet("Werteliste")
    ws2.cell(row=1, column=1, value="Value List")
    ws2.cell(row=1, column=2, value="Code")
    ws2.cell(row=1, column=3, value="Description EN")
    ws2.cell(row=1, column=4, value="Description DE")
    for col_idx in range(1, 5):
        cell = ws2.cell(row=1, column=col_idx)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL

    # Save
    output_path = "docs/BBL GIS IMMO 01-02-2025.xlsx"
    wb.save(output_path)
    print(f"Saved to {output_path}")
    print(f"  {len(ROWS)} attribute rows written")
    print(f"  {len(HEADERS)} columns")


if __name__ == "__main__":
    main()
