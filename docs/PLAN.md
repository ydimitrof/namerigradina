# Plan: Parent Cooperatives Map — Sofia (static website)

## Context

Parent cooperatives (родителски кооперативи) — small, parent-run childcare collectives — are hard to discover in Sofia: information lives in scattered Facebook groups and word of mouth. The goal is a small static website where parents (mostly mothers, mostly on phones) can find cooperatives on a map of Sofia, tap a point for details, and filter by criteria. The site must be free to run, data-driven via JSON files editable without code changes, playful/colorful in tone, and mobile-first. First scope: Sofia; architecture should not preclude other cities later.

Decisions already made with the user:
- **Language:** Bulgarian only (English later if ever).
- **Stack:** Vanilla HTML/CSS/JS, no framework, no build step.
- **Hosting:** Cloudflare Pages (free, custom domains, fast).
- **Private docs:** `docs/` stays in the GitHub repo but is **excluded from the deployed site** — nothing under the public domain serves it. The data/config JSONs are necessarily public (the browser fetches them).
- **Data:** a research phase compiles real Sofia cooperatives; site is built against 3–5 sample entries first.

## Map technology (researched)

**Choice: MapLibre GL JS + OpenFreeMap vector tiles.**
- OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`) is free, unlimited, keyless, no registration, no credit card; open-source and self-hostable. Caveat: donation-funded single-maintainer instance — acceptable risk given the fallback below.
- MapLibre GL (~230KB gz) renders crisp retina vector tiles with the best mobile pinch-zoom feel; clustering is built in (not needed at 10–100 points); playful custom markers are plain DOM elements (`maplibregl.Marker({element})`).
- **Fallback (documented, not built):** self-hosted Protomaps PMTiles Sofia extract (~20–80MB single static file). Note: Cloudflare Pages does not serve HTTP Range requests, so the fallback file would go in a free Cloudflare R2 bucket (10GB free, zero egress) — a style-URL swap, no code changes.
- Rejected: raw OSM raster tiles (blurry on retina, usage-policy risk), MapTiler/Stadia free tiers (session caps), Google/Mapbox (credit card + key exposure).

## Domain (researched, Sept 2026 prices)

| TLD | Where | First year | Renewal | Eligibility |
|---|---|---|---|---|
| **.bg** | Register.BG / SuperHosting.BG / Jump.BG | ~58 BGN (≈€30) incl VAT | same | Any EU citizen or EU entity — no Bulgarian company needed |
| **.coop** | Gandi ($78) / EnCirca ($85) / 101domain ($89) | ~$78–90 | ~$78–100 | **Cooperatives / co-op-serving orgs only, individuals not eligible.** Self-certify at purchase, registry verifies in ~5 business days, no refund if it fails |
| **.org** | Porkbun ($7.98) / Cloudflare ($8.50) | ~$8–10 | ~$11–12 | none |
| **.net** | Cloudflare / Porkbun | ~$12 | ~$12 | none |
| `x.a.bg` third-level | Register.BG | ~€12 incl VAT | same | cheap .bg variant, unusual-looking |
| .site / .space / .info | Porkbun et al. | $2–5 | **$22–35 (renewal trap)** | avoid |

Notes:
- **.coop** is the dream TLD but risky here: eligibility requires being (or principally serving) a formal cooperative, individuals can't register, and a failed verification is non-refundable. If a formal организация behind the site materializes later, `roditeli.coop` can be added then — email identity.coop first to confirm eligibility.
- **Recommendation: start with a .bg (~€30/yr) as the primary** — it signals local trust to Sofia parents — optionally paired with a cheap **.org (~$11/yr)** redirect. Cloudflare Registrar does not sell .bg or .coop, but Cloudflare's free DNS (required for Pages custom domains) accepts any TLD, so a .bg bought at Jump.BG/SuperHosting works fine with Cloudflare Pages. Avoid the Cyrillic **.бг** (punycode headaches on hosting platforms).
- **Name candidates** (availability NOT yet verified — check at register.bg / registrar search before buying): `detski-kooperativi.bg`, `karta-kooperativi.bg`, `koopkarta.org`, `roditelski-kooperativi.org`, `kooperativite.org`, `sofiacoops.org`, `decakoop.org`, and `roditeli.coop` if eligibility ever clears. Final pick is the user's call at deploy time (phase 6).

## Repository layout

```
cooperatives/
├── docs/                     # NOT deployed (plan, research notes, decisions)
│   ├── PLAN.md               # this plan, committed
│   ├── data-research.md      # cooperative research notes & sources
│   └── decisions.md          # running decisions log
├── site/                     # ← the deploy root for Cloudflare Pages
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── app.js            # boot: load config + data, init map, wire filters
│   │   ├── map.js            # MapLibre init, markers, popups
│   │   └── filters.js        # render filter UI from config, apply predicate
│   ├── data/
│   │   ├── places.json       # the cooperatives (public by necessity)
│   │   └── filters.json      # filter definitions (public by necessity)
│   ├── assets/               # logo, marker SVGs, favicon
│   └── _headers              # Cloudflare Pages headers (security, caching)
└── README.md
```

Cloudflare Pages is pointed at `site/` as the build output directory (no build command). Everything outside `site/` — including all of `docs/` — never reaches the CDN, so it has no URL at all.

## JSON contracts (the configurable core)

### `data/places.json`
```json
{
  "version": 1,
  "updated": "2026-09-10",
  "places": [
    {
      "id": "slatina-kooperativ",
      "name": "Родителски кооператив „Слънчице“",
      "coords": [23.3219, 42.6977],
      "address": "ул. Пример 12, кв. Слатина",
      "district": "slatina",
      "ages": [1, 4],
      "priceRange": "600-800",
      "schedule": "Пон–Пет, 8:00–18:00",
      "languages": ["bg"],
      "outdoorSpace": true,
      "openSpots": true,
      "description": "Кратко описание…",
      "contacts": { "phone": "+359…", "email": "…", "facebook": "https://…", "website": null },
      "photo": "assets/places/slatina.jpg"
    }
  ]
}
```

### `data/filters.json`
Filters are declared, not hard-coded — adding a filter is a JSON edit:
```json
{
  "version": 1,
  "filters": [
    { "key": "district", "label": "Квартал", "type": "multi-select",
      "options": [ { "value": "slatina", "label": "Слатина" } ] },
    { "key": "ages", "label": "Възраст на детето", "type": "range", "min": 0, "max": 7, "unit": "г." },
    { "key": "openSpots", "label": "Свободни места", "type": "toggle" },
    { "key": "outdoorSpace", "label": "Двор / открито пространство", "type": "toggle" }
  ]
}
```
`filters.js` renders each `type` (`multi-select`, `range`, `toggle`) generically and builds one combined predicate over `places`. Unknown keys in a place are ignored; unknown filter types log a console warning and are skipped (fail-open).

## UI / UX (mobile-first)

- **Layout:** full-viewport map. On phones the filter panel is a **bottom sheet** (collapsed pill "Филтри (N)" → drag/tap to expand); place details open as a bottom card (not a tiny map popup). On ≥768px the filters become a left sidebar and details a side panel. One CSS file, `min-width` media queries (mobile styles are the base).
- **Markers:** playful custom SVG pins (rounded, sticker-like, e.g. a sun/balloon motif), scaled for touch (≥44px tap targets). Active marker enlarges/bounces.
- **Theme:** colorful but legible — warm background, 4–5 saturated accents (coral, sunny yellow, teal, lilac) as CSS custom properties in `:root`; rounded corners, chunky friendly type (a Google Font with full Cyrillic support, e.g. **Nunito** — self-hosted woff2 in `assets/` to avoid third-party requests).
- **Empty state:** friendly illustration + "Няма резултати — разхлабете филтрите".
- **Accessibility:** semantic HTML for the filter controls, visible focus, contrast-checked accent usage, `lang="bg"`.

## Implementation phases

1. **Repo + skeleton** — init git repo, layout above, `index.html` with map full-screen on OpenFreeMap tiles centered on Sofia (`[23.3219, 42.6977]`, zoom ~12), README, this plan committed under `docs/`.
2. **Data contracts + samples** — `places.json` / `filters.json` schemas as above with 4 sample entries spread across Sofia districts.
3. **Markers + details card** — render places as custom markers; tap → bottom card (mobile) / side panel (desktop) with all place fields, tel:/mailto:/Facebook links.
4. **Filter engine** — config-driven filter UI (bottom sheet + sidebar), combined predicate, live marker updates, result count, empty state.
5. **Theme pass** — palette, typography (self-hosted Cyrillic font), playful markers/logo/favicon, polish of sheet animations.
6. **Deploy** — GitHub repo (user creates), Cloudflare Pages project with output dir `site/`, `_headers` (basic security headers + long cache for assets, short for `data/*.json`), verify docs/ is unreachable, connect chosen domain.
7. **Data research** — compile real Sofia parent cooperatives (web + Facebook groups + НПО registries) into `docs/data-research.md` with sources; user verifies; promote verified entries into `places.json`.

## Verification

- `python3 -m http.server` from `site/` — check map loads, markers clickable, each filter type filters correctly, empty state appears.
- Mobile check: browser devtools device mode (375px) + a real phone on LAN — bottom sheet, tap targets, pinch-zoom.
- JSON validity: `jq . site/data/*.json` in CI later; manually at first.
- Post-deploy: confirm `https://<domain>/docs/` and `/docs/PLAN.md` return 404; confirm `data/places.json` loads; Lighthouse mobile pass (target ≥90 performance/accessibility).
