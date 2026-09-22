# Catalogue reference data

Reviewed 22 September 2026 against the live public database used by
`data-catalog/prototype-oblique/js/catalog-config.js`.

## Access and reproducibility

The public PostgREST endpoint is
`https://zicluerzbevodlmtbxow.supabase.co/rest/v1/`.
GET requests require the application's **public publishable key** in `apikey` and
`Accept-Profile: catalog`. No user login, bearer token, database password or write
operation is needed. The website's Edge CRUD API is not needed for this task.

The saved [API snapshot](../scripts/reference-data/sources/catalog.json) contains
95 value lists, 2,120 values, 43 business objects and 305 business attributes.
The fetcher paginates with a stable UUID order, checks `Content-Range` totals,
and requires the same `catalog_state.version` before and after all reads. The
timestamp, exact request URLs and revision are retained in the snapshot.

Both prototypes receive byte-identical `data/meta.json` files. They contain 13
relevant catalogue lists and one explicitly local operational-status list,
including string codes, available translations, descriptions, parent IDs,
catalogue IDs, lifecycle status and field bindings for both schemas. Leading
zeros are preserved. Archived lists and values are excluded. The complete raw
snapshot remains evidence, not a browser dependency. Missing translations fall
back to German; no invented translations are presented as catalogue content.

```powershell
python scripts/reference-data/fetch.py     # Public GETs; deliberately explicit refresh
python scripts/reference-data/build.py     # Offline, from the saved snapshot
python scripts/portfolio/generate.py       # Regenerate labels and codes in both schemas
python scripts/reference-data/validate.py
python scripts/portfolio/validate.py
node test/check-alignment.js
```

Normal page loads read local `meta.json`; they never call Supabase. The runtime
uses the shared operational-status labels and presentation mapping for map
colours, badges and legends. Generated categorical labels are resolved from the
same metadata and checked against their stored codes. An explicit refresh and
review, rather than a live dependency, keeps prototype demos reproducible.

## Decisions

| Field | Catalogue vocabulary | Implementation |
|---|---|---|
| Measurement accuracy | `profile-bemessungsgenauigkeit` | Store `accuracyCode` and the exact German label. |
| Measurement standard | `profile-bemessungsstandard` | Store `standardCode` and its label; retain the precise rule and edition in `extensionData.standardDetail`, also shown in the table. |
| Ownership category | `profile-eigentumsart` | Use **Eigentum**, **Anmiete**, **Spezialfall**; these are management categories, not proof of legal ownership. |
| Portfolio | `r-bbl-teilportfolio` | Use codes such as `001`, `002`, `006`, `008` and their exact labels. |
| Building types | `r-bbl-gebaeudeart-1`, `r-bbl-gebaeudeart-2` | Preserve both levels, including `06` / `06.01`, separately from free-text use descriptions. Assignments remain plausible demo scenarios. |
| Rental model | `r-bbl-mietmodell` | Include the real list; leave the building value null because the old “Marktmiete”/“Vollkostenmiete” labels have no unambiguous catalogue mapping. |
| Physical building status | `r-gwr-status` | Add a separate GWR status. All five saved Swiss register responses say `1004` / **Bestehend**. Leave it null abroad. |
| Operational status | No confirmed vocabulary bound to `gebaeude/bewirtschaftungsstatus` | Keep an explicit `local-operating-status` list, consistently **In Betrieb** in both demos. Do not translate operational status into GSTAT or catalogue approval status. |
| Document type | `r-kbob-dokumenttyp` | All six existing KBOB codes and labels match the live catalogue exactly; retain them. |

Building code assignments are in `referenceCodes` (Simple) and
`extensionData.referenceCodes` (Tabs), with shared binding names. The generator
does not claim the mock portfolio classifications are confirmed SAP assignments.
Old Simple URLs with `filter_status=Aktiv` resolve to **In Betrieb**.

## Accuracy is not provenance

The active accuracy values are **Geschätzt**, **Gemessen**, **Aggregiert**,
**Unbekannt** and **Toleranz dokumentiert**. The catalogue description still names
only four; the active child records contain five, so the export retains all five.
These categories do not assert numeric tolerances.

- The 239 modelled demo measurements use `GESCHAETZT` / **Geschätzt**.
- The 22 published GF/GV figures use `UNBEKANNT` / **Unbekannt**: publication alone
  does not establish the original measurement method or accuracy. `bmEstimation`
  is null, not a false assertion that the figure was measured.
- The five Swiss parcel areas use `GEMESSEN` / **Gemessen**, whose catalogue
  definition explicitly includes measuring documented geometry. Their geodesic
  polygon calculation, source and limitations remain recorded separately.

Publication and geometry provenance remain in `extensionData.source`, `sourceUrl`
and `dataStatus`. The table calls this column **Quelle**. Derived parcel area uses
**Andere dokumentierte Regel** with its actual calculation rule, rather than
claiming that the polygon calculation itself follows SIA 416.

RICS Code of Measuring Practice is absent from the standard list. It uses
`ANDERE_REGEL` / **Andere dokumentierte Regel**, retaining the exact RICS edition;
it is not relabelled IPMS. Existing SIA component and RICS measurement codes stay
separate; they are not coerced into the narrower BBL basic-measurement profile.

## Deliberate exclusions

Many BBL vocabularies are marked **draft**, while GWR status is **valid**. The
metadata preserves that distinction; importing a list does not certify a standard.
`profile-bemessungsumfang` is archived/retired. The `bemessung/ermittlungsart`
attribute is archived even though its list still exists. Neither becomes a new
current field or dropdown. These are reasons to inspect bindings and lifecycle
flags, not merely match similar names.

Contract type and ownership-form lists are empty; operational status, contract
status, asset categories, contact roles and several legacy GIS fields have no
confirmed equivalent. Existing mock values stay explicit local scenarios. CRB
eBKP-H classifications are not substituted for the existing BKP work-package
codes. Source geometry, addresses, photographs, people and numeric measurements
are unchanged by vocabulary alignment.
