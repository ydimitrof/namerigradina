/* Map module: MapLibre GL on OpenFreeMap vector tiles, DOM markers per place. */
"use strict";

const CoopMap = (() => {
  const SOFIA_CENTER = [23.3219, 42.6977];
  const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
  const MARKER_COLORS = ["", "marker--sunny", "marker--teal", "marker--lilac"];
  const MARKER_EMOJI = ["☀️", "🎈", "🐞", "🌈"];

  let map;
  let markers = new Map(); // place.id -> {marker, el}
  let activeId = null;

  function init(onReady) {
    map = new maplibregl.Map({
      container: "map",
      style: STYLE_URL,
      center: SOFIA_CENTER,
      zoom: 11.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", onReady);
    map.on("error", (e) => {
      console.warn("Грешка при зареждане на картата:", e.error ? e.error.message : e);
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
      // Stable per-place color/emoji: hash the id so filtering never reshuffles looks.
      let h = 0;
      for (const ch of place.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const el = document.createElement("button");
      el.type = "button";
      el.className = ("marker " + MARKER_COLORS[h % MARKER_COLORS.length]).trim();
      el.setAttribute("aria-label", place.name);
      const icon = document.createElement("span");
      icon.textContent = MARKER_EMOJI[h % MARKER_EMOJI.length];
      el.appendChild(icon);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setActive(place.id);
        onSelect(place);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
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

  function fitTo(places) {
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

  return { init, setPlaces, setActive, fitTo, panTo };
})();
