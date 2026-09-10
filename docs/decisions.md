# Решения / Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-09-10 | MapLibre GL JS + OpenFreeMap tiles (`styles/liberty`) | Free, unlimited, keyless vector tiles; best mobile pinch-zoom. Fallback documented in PLAN.md: self-hosted Protomaps PMTiles in Cloudflare R2 (Pages lacks Range-request support). |
| 2026-09-10 | Vanilla HTML/CSS/JS, no build step | One-page site; JSON-driven content removes the need for a framework. |
| 2026-09-10 | Cloudflare Pages, output dir `site/` | Free hosting + custom domains; `docs/` stays outside the deploy root so it has no public URL. |
| 2026-09-10 | Bulgarian-only UI | Target audience is Sofia parents; English deferred. |
| 2026-09-10 | Self-hosted assets (MapLibre 5.24.0, Nunito cyrillic/latin woff2) | Only runtime third-party dependency is the tile server; simplifies CSP. |
| 2026-09-10 | Domain: recommend .bg primary (~€30/yr), optional .org redirect (~$11/yr); .coop deferred | .coop requires being/serving a formal cooperative, individuals ineligible, non-refundable verification. Full pricing table in PLAN.md. Final name pending availability check. |
| 2026-09-10 | Sample entries flagged `"sample": true` and badged "примерен запис" in UI | Honesty until the researched real cooperatives are verified and merged. |
