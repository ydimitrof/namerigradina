# Намери Градина (Nameri Gradina)

[Български](README.md) | **English** | [English](README.en.md)

**https://namerigradina.party** — a mobile-first map of childcare options in Sofia,
Bulgaria: родителски кооперативи (parent cooperatives), частни and общински детски
градини — 457 places on one filterable map.

Built as a static site with no backend and no build step: vanilla JS + MapLibre GL,
free [OpenFreeMap](https://openfreemap.org/) vector tiles, and all content driven by
JSON files. Hosted free on Cloudflare (static assets), auto-deployed on every push
to `main`.

## Features

- **457 places**: 15 parent cooperatives (hand-researched), 342 municipal
  kindergartens/nurseries, 100 private kindergartens — color-coded, clustered,
  each with a detail card (ages, schedule, contacts, honest notes on uncertainty).
- **Filters** (all config-driven from JSON): type, child age, yard/outdoor
  space, walking time from your address. Location is filtered spatially —
  by panning the map or via the address pin — rather than a district picker.
- **"Your address" pin**: geocoded address search or tap-to-place, draggable,
  remembered locally. Unlocks the walking-distance filter and per-place travel
  info: walking estimate, driving time (OSRM), Google Maps transit/driving links.
- **Public transport**: nearby stops with their bus/tram/trolley/metro lines, and
  the *direct lines* between your pin and the place — precomputed from the official
  GTFS feed, no runtime API dependency.
- Bulgarian UI, ≥44px touch targets, bottom-sheet layout on phones.

## Data sources & attribution

| Data | Source | Notes |
|---|---|---|
| Parent cooperatives | Manual research from public sources (websites, Facebook, articles, forums) | No official register exists; entries carry honesty notes; curated in `site/data/places.json` |
| Municipal kindergartens | Столична община — ИСОДЗ (kg.sofia.bg) + arcgis.sofia.bg | Extracted 2026-09; attribute Столична община |
| Private kindergartens | МОН НЕИСПУО institutions register (ri.mon.bg) | Extracted 2026-09 |
| Transit stops & lines | Център за градска мобилност GTFS (gtfs.sofiatraffic.bg) | CC BY 4.0; refresh via `scripts/build-transit.py` |
| Map tiles & geocoding | © OpenStreetMap contributors via OpenFreeMap, Photon, Nominatim | ODbL |

Full licensing details: [LICENSE-DATA.md](LICENSE-DATA.md). The site shows this
provenance to users in the ⓘ "За сайта" dialog.

## Repository layout

```
site/          ← the deployed website (everything else is NOT served)
  data/
    places.json         hand-curated cooperatives — edit this to add/fix a place
    kindergartens.json  script-generated (municipal + private) — do not hand-edit
    transit.json        script-generated from GTFS — do not hand-edit
    filters.json        filter definitions rendered in the sidebar
  js/          app.js (bootstrap/UI), map.js (MapLibre), filters.js (filter engine)
  css/, assets/, _headers
scripts/       data regeneration (build-transit.py)
tests/         filter-engine tests (jsdom)
docs/          plan, research notes, decisions log — in the repo, never deployed
```

## Run locally

```sh
cd site && python3 -m http.server 8080
# open http://localhost:8080
```

No dependencies for the site itself. For the tests: `npm install && npm test`.

## Editing content (no code needed)

- **Add/edit a cooperative**: edit `site/data/places.json`. Coordinates are
  `[longitude, latitude]`. Unknown fields stay `null` — never guess; use the
  `note` field for caveats and `approxLocation: true` for uncertain pins.
- **Add/edit a filter**: edit `site/data/filters.json`. Types: `multi-select`
  (chips, optional per-option `color`), `range`, `toggle`, `distance`
  (walking-minutes, needs the user pin). New filter *types* go in `site/js/filters.js`.
- Validate with `jq . site/data/*.json` and `npm test`.

## Contributing

PRs welcome — most contributions are JSON edits (see above). For a new place,
include at least one verifiable source link in the PR description. CI validates
JSON, JS syntax and the filter tests on every push and PR.

## SEO pages

`site/m/` (457 place pages), `site/r/` (district pages) and `sitemap.xml` are
generated — rerun `python3 scripts/build-pages.py` after any data edit (CI fails
if they drift). Deferred follow-up: verify the domain in Google Search Console /
Bing Webmaster (DNS TXT record) and submit `https://namerigradina.party/sitemap.xml`.

## Deploy

Cloudflare Workers static assets: build command `exit 0`, deploy command
`npx wrangler deploy` (config in `wrangler.jsonc`, assets dir `site/`). Pushes to
`main` deploy automatically. `site/_headers` carries CSP and cache rules.

## License

Code: [MIT](LICENSE). Curated dataset: CC BY 4.0. Third-party data and bundled
code keep their own licenses — see [LICENSE-DATA.md](LICENSE-DATA.md).
