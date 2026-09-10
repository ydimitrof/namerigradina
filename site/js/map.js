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
      if (!Array.isArray(place.coords) || place.coords.length < 2) continue;
      const style = TYPE_STYLE[place.type] || DEFAULT_STYLE;
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

  return { init, setPlaces, setActive, fitTo, panTo };
})();
