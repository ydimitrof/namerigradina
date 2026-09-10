# Намери Градина (namerigradina.com)

Static, mobile-first map of childcare options in Sofia — родителски кооперативи,
частни и общински детски градини — consolidated on one filterable map.
No backend, no build step: MapLibre GL JS + free [OpenFreeMap](https://openfreemap.org/)
vector tiles, with all content driven by JSON files.

Municipal kindergarten data: Столична община / ИСОДЗ (kg.sofia.bg) and
arcgis.sofia.bg, extracted 2026-09-10.

## Structure

- `site/` — the deployed website (Cloudflare Pages output directory).
  - `site/data/places.json` — the hand-curated cooperatives shown on the map.
  - `site/data/kindergartens.json` — script-generated municipal/private kindergartens (regenerate rather than hand-edit).
  - `site/data/filters.json` — the filter definitions rendered in the sidebar.
- `docs/` — plan, research notes, decisions. **Not deployed** — nothing here gets a public URL.

## Editing content (no code needed)

- **Add/edit a cooperative:** edit `site/data/places.json`. Coordinates are `[longitude, latitude]`.
  Unknown fields are ignored; missing optional fields are simply not shown.
- **Add/edit a filter:** edit `site/data/filters.json`. Supported types: `multi-select`
  (chips with `options`), `range` (`min`/`max`/`unit`, matches places whose array field spans
  the chosen value), `toggle` (requires the place field to be `true`). District labels shown
  in place cards come from the `district` filter's options.

Validate after editing: `jq . site/data/*.json`

## Run locally

```sh
cd site && python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy (Cloudflare Pages)

Project settings: no build command, output directory `site/`. Custom-domain and header
config are described in `docs/PLAN.md`. Only `site/` is published — the `docs/` folder
never reaches the CDN.
