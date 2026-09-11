# Data licensing

## Curated dataset (ours)

The hand-curated dataset of parent cooperatives — `site/data/places.json` and the
research notes under `docs/` — is licensed under
[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
Attribute as: **"Намери Градина (namerigradina.com)"**.

## Third-party datasets (keep their own licenses)

Our license applies only to our curated additions. The following data ships with
or feeds the site under its own terms, and reuse must preserve these attributions:

| Data | File | Source & license |
|---|---|---|
| Municipal kindergartens & nurseries | `site/data/kindergartens.json` | Столична община — ИСОДЗ (kg.sofia.bg) and arcgis.sofia.bg; open municipal data, attribute Столична община |
| Private nurseries (частни ясли) | `site/data/kindergartens.json` | Столична РЗИ register, published via kg.sofia.bg (ИСОДЗ); attribute Столична РЗИ / Столична община |
| Public transport stops & lines | `site/data/transit.json` | Център за градска мобилност GTFS feed (gtfs.sofiatraffic.bg), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Geocoded coordinates | embedded in the place files | Derived via Nominatim/Photon from © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors ([ODbL](https://opendatacommons.org/licenses/odbl/)) |
| Map tiles (runtime) | — | [OpenFreeMap](https://openfreemap.org/) / © OpenStreetMap contributors |

## Bundled third-party code and fonts (MIT-licensed repo code aside)

| Component | Files | License |
|---|---|---|
| MapLibre GL JS 5.24.0 | `site/js/maplibre-gl.js`, `site/css/maplibre-gl.css` | [BSD-3-Clause](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt) |
| Nunito (variable font) | `site/assets/fonts/*.woff2` | [SIL Open Font License 1.1](https://fonts.google.com/specimen/Nunito/license) |
