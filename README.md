# Намери Градина (namerigradina.com)

Static, mobile-first map of childcare options in Sofia — родителски кооперативи,
частни и общински детски градини — consolidated on one filterable map.
No backend, no build step: MapLibre GL JS + free [OpenFreeMap](https://openfreemap.org/)
vector tiles, with all content driven by JSON files.

Municipal kindergarten data: Столична община / ИСОДЗ (kg.sofia.bg) and
arcgis.sofia.bg, extracted 2026-09-10. Transit stop/line data: Център за
градска мобилност GTFS feed (gtfs.sofiatraffic.bg), CC-BY 4.0 — refresh
with `python3 scripts/build-transit.py`.

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

## Contributing

Contributions are welcome — adding or correcting a place is a JSON edit:

1. Edit `site/data/places.json` (see the field guide above). Coordinates are
   `[longitude, latitude]`; include at least one verifiable source for a new
   place in the PR description, and leave unknown fields `null` — never guess.
2. Validate: `jq . site/data/*.json`, then open the site locally and click your pin.
3. Send a pull request.

Filter changes are `site/data/filters.json` edits; new filter *types* go in
`site/js/filters.js`. Regenerable datasets (`kindergartens.json`,
`transit.json`) are rebuilt by the scripts in `scripts/` — don't hand-edit them.

## License

Code is [MIT](LICENSE). The curated dataset is CC BY 4.0, and bundled
third-party data/code keep their own licenses — see [LICENSE-DATA.md](LICENSE-DATA.md).

## Deploy (Cloudflare Pages)

Project settings: no build command, output directory `site/`. Custom-domain and header
config are described in `docs/PLAN.md`. Only `site/` is published — the `docs/` folder
never reaches the CDN.
