/* Map module: MapLibre GL on OpenFreeMap vector tiles, DOM markers per place. */
"use strict";

const CoopMap = (() => {
  const SOFIA_CENTER = [23.3219, 42.6977];
  const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
  // Marker look is keyed to place.type so the map doubles as a legend
  // (matching the colored chips of the "Вид" filter).
  const TYPE_STYLE = {
    cooperative: { cls: "", emoji: "☀️" },
    private: { cls: "marker--lilac", emoji: "🎈" },
    public: { cls: "marker--teal", emoji: "🏫" },
  };
  const DEFAULT_STYLE = { cls: "marker--sunny", emoji: "🌈" };

  // Kindergartens are rendered as a clustered GeoJSON layer (hundreds of
  // points would make DOM markers janky on phones); cooperatives keep the
  // hand-made sticker markers. Colors match TYPE_STYLE / the filter chips.
  const KG_COLORS = { private: "#9b8ce8", public: "#0fb5a6" };
  const CLUSTER_COLOR = "#ffc94d";

  let map;
  let markers = new Map(); // place.id -> {marker, el}
  let activeId = null;
  let kgIndex = new Map(); // place.id -> place, for layer click lookup
  let kgSelectHandler = null;

  function init(onReady) {
    map = new maplibregl.Map({
      container: "map",
      style: STYLE_URL,
      center: SOFIA_CENTER,
      zoom: 11.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      addKindergartenLayers();
      onReady();
    });
    map.on("error", (e) => {
      console.warn("Грешка при зареждане на картата:", e.error ? e.error.message : e);
    });
  }

  function addKindergartenLayers() {
    map.addSource("kindergartens", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 46,
    });
    map.addLayer({
      id: "kg-clusters",
      type: "circle",
      source: "kindergartens",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": CLUSTER_COLOR,
        "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 25],
        "circle-stroke-width": 3,
        "circle-stroke-color": "#ffffff",
      },
    });
    map.addLayer({
      id: "kg-cluster-count",
      type: "symbol",
      source: "kindergartens",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 13,
      },
      paint: { "text-color": "#35323e" },
    });
    map.addLayer({
      id: "kg-points",
      type: "circle",
      source: "kindergartens",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["match", ["get", "ptype"], "private", KG_COLORS.private, KG_COLORS.public],
        "circle-radius": 9,
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#ffffff",
      },
    });
    map.on("click", "kg-points", (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      const place = kgIndex.get(f.properties.id);
      if (place && kgSelectHandler) kgSelectHandler(place);
    });
    map.on("click", "kg-clusters", async (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      const zoom = await map.getSource("kindergartens").getClusterExpansionZoom(f.properties.cluster_id);
      map.easeTo({ center: f.geometry.coordinates, zoom });
    });
    for (const layer of ["kg-points", "kg-clusters"]) {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    }
  }

  function setKindergartens(places, onSelect) {
    kgSelectHandler = onSelect;
    kgIndex = new Map(places.map((p) => [p.id, p]));
    const src = map.getSource("kindergartens");
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: places
        .filter((p) => Array.isArray(p.coords) && p.coords.length >= 2)
        .map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: p.coords },
          properties: { id: p.id, ptype: p.type },
        })),
    });
  }

  function setPlaces(places, onSelect) {
    const keep = new Set(places.map((p) => p.id));
    for (const [id, entry] of markers) {
      if (!keep.has(id)) {
        entry.marker.remove();
        markers.delete(id);
        if (activeId === id) activeId = null;
      }
    }
    for (const place of places) {
      if (markers.has(place.id)) continue;
      if (!Array.isArray(place.coords) || place.coords.length < 2) continue;
      const style = TYPE_STYLE[place.type] || DEFAULT_STYLE;
      // MapLibre writes its positioning transform onto the element it is
      // given, every frame. Hand it a bare wrapper so the pin's own
      // rotation and transition never fight (and lag behind) the panning.
      const wrapper = document.createElement("div");
      const el = document.createElement("button");
      el.type = "button";
      el.className = ("marker " + style.cls + (place.approxLocation ? " marker--approx" : "")).trim();
      el.setAttribute("aria-label", place.name);
      const icon = document.createElement("span");
      icon.textContent = style.emoji;
      el.appendChild(icon);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setActive(place.id);
        onSelect(place);
      });
      wrapper.appendChild(el);
      const marker = new maplibregl.Marker({ element: wrapper, anchor: "bottom" })
        .setLngLat(place.coords)
        .addTo(map);
      markers.set(place.id, { marker, el });
    }
  }

  function setActive(id) {
    if (activeId && markers.has(activeId)) {
      markers.get(activeId).el.classList.remove("marker--active");
    }
    activeId = id;
    if (id && markers.has(id)) {
      markers.get(id).el.classList.add("marker--active");
    }
  }

  function fitTo(allPlaces) {
    const places = allPlaces.filter((p) => Array.isArray(p.coords) && p.coords.length >= 2);
    if (places.length === 0) return;
    if (places.length === 1) {
      map.flyTo({ center: places[0].coords, zoom: 14 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    for (const p of places) bounds.extend(p.coords);
    map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 600 });
  }

  function panTo(place) {
    map.flyTo({ center: place.coords, zoom: Math.max(map.getZoom(), 13.5), duration: 500 });
  }

  return { init, setPlaces, setKindergartens, setActive, fitTo, panTo };
})();
