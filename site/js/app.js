/* App bootstrap: load JSON configs, init map, wire filters and the detail card. */
"use strict";

(async () => {
  const panel = document.getElementById("filters-panel");
  const toggleBtn = document.getElementById("filters-toggle");
  const controlsRoot = document.getElementById("filters-controls");
  const clearBtn = document.getElementById("filters-clear");
  const countEl = document.getElementById("results-count");
  const emptyEl = document.getElementById("empty-state");
  const detailEl = document.getElementById("detail-card");
  const detailContent = document.getElementById("detail-content");
  const detailClose = document.getElementById("detail-close");

  let data;
  try {
    const [placesRes, filtersRes, kgRes] = await Promise.all([
      fetch("data/places.json"),
      fetch("data/filters.json"),
      fetch("data/kindergartens.json"),
    ]);
    if (!placesRes.ok || !filtersRes.ok) {
      throw new Error(`HTTP ${placesRes.status}/${filtersRes.status}`);
    }
    // The kindergarten file is optional — the map works without it. Its
    // entries are tagged as bulk: curated places get sticker markers,
    // bulk imports go to the clustered layer, regardless of type.
    const kgPlaces = (kgRes.ok ? (await kgRes.json()).places : []).map((p) => ({ ...p, bulk: true }));
    data = {
      places: [...(await placesRes.json()).places, ...kgPlaces],
      filterConfig: await filtersRes.json(),
    };
  } catch (err) {
    console.error("Данните не се заредиха:", err);
    emptyEl.hidden = false;
    emptyEl.querySelector("p").textContent = "Данните не се заредиха — опитайте пак по-късно.";
    return;
  }

  // Single source of truth for value labels: the filter options, plus the
  // config's standalone `labels` section for fields shown on cards but not
  // filtered on (e.g. district after the district filter was removed).
  const labels = Object.assign({}, data.filterConfig.labels);
  for (const f of data.filterConfig.filters || []) {
    if (!Array.isArray(f.options)) continue;
    labels[f.key] = {};
    for (const o of f.options) labels[f.key][o.value] = o.label;
  }
  const label = (key, value) => (labels[key] && labels[key][value]) || null;

  const escape = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---- User pin ("my address") ---- */

  const PIN_KEY = "namerigradina.pin";
  let userPin = null; // [lng, lat]
  try {
    const saved = JSON.parse(localStorage.getItem(PIN_KEY) || "null");
    if (Array.isArray(saved) && saved.length === 2 &&
        saved.every((n) => typeof n === "number" && isFinite(n))) {
      userPin = saved;
    }
  } catch (_) { /* corrupted storage — start clean */ }

  const locInput = document.getElementById("loc-input");
  const locForm = document.getElementById("loc-form");
  const locPinBtn = document.getElementById("loc-pin-btn");
  const locClear = document.getElementById("loc-clear");
  const locStatus = document.getElementById("loc-status");

  function status(msg) {
    locStatus.hidden = !msg;
    locStatus.textContent = msg || "";
  }

  function setPin(coords, { pan } = {}) {
    userPin = coords;
    try {
      if (coords) localStorage.setItem(PIN_KEY, JSON.stringify(coords));
      else localStorage.removeItem(PIN_KEY);
    } catch (_) { /* private mode — pin just won't persist */ }
    PlaceMap.setUserPin(coords, (moved) => setPin(moved));
    locClear.hidden = !coords;
    if (coords && pan) PlaceMap.panTo({ coords });
    engine.contextChanged();
    refresh();
    // Refresh the open card so travel times appear/update.
    if (!detailEl.hidden && currentPlace) showDetail(currentPlace);
  }

  async function geocodeAddress(q) {
    // Bias results to Sofia and keep only hits inside the city box.
    const url = "https://photon.komoot.io/api/?lang=default&limit=1&lat=42.6977&lon=23.3219&q=" +
      encodeURIComponent(q + ", София");
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const geo = await res.json();
    const f = (geo.features || [])[0];
    if (!f) return null;
    const [lng, lat] = f.geometry.coordinates;
    if (!(23.0 < lng && lng < 23.8 && 42.4 < lat && lat < 42.95)) return null;
    return [lng, lat];
  }

  locForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = locInput.value.trim();
    if (!q) return;
    status("Търсене…");
    try {
      const coords = await geocodeAddress(q);
      if (coords) {
        status("");
        setPin(coords, { pan: true });
      } else {
        status("Адресът не е намерен — опитайте по-точно или посочете пин на картата.");
      }
    } catch (err) {
      console.warn("Геокодиране:", err);
      status("Търсенето не сработи — посочете пин на картата.");
    }
  });

  locPinBtn.addEventListener("click", () => {
    if (PlaceMap.isPlacingPin()) {
      PlaceMap.endPinPlacement();
      locPinBtn.classList.remove("locbar__pin--armed");
      status("");
      return;
    }
    locPinBtn.classList.add("locbar__pin--armed");
    status("Докоснете картата, за да поставите пина.");
    panel.classList.remove("filters--open");
    toggleBtn.setAttribute("aria-expanded", "false");
    PlaceMap.beginPinPlacement((coords) => {
      locPinBtn.classList.remove("locbar__pin--armed");
      status("");
      setPin(coords);
    });
  });

  locClear.addEventListener("click", () => {
    locInput.value = "";
    status("");
    setPin(null);
  });

  /* ---- Travel times (shown in the card when a pin is set) ---- */

  const carCache = new Map(); // place.id -> minutes | null (null = lookup failed)

  async function carMinutes(place) {
    if (carCache.has(place.id)) return carCache.get(place.id);
    try {
      const [flng, flat] = userPin;
      const [tlng, tlat] = place.coords;
      const url = `https://router.project-osrm.org/route/v1/driving/${flng},${flat};${tlng},${tlat}?overview=false`;
      const res = await fetch(url);
      const j = await res.json();
      const mins = j.routes && j.routes[0] ? Math.round(j.routes[0].duration / 60) : null;
      carCache.set(place.id, mins);
      return mins;
    } catch (_) {
      carCache.set(place.id, null);
      return null;
    }
  }

  /* ---- Transit (precomputed from the official CC-BY GTFS feed) ---- */

  let transitData = null; // null = not loaded, false = load failed
  async function loadTransit() {
    if (transitData !== null) return transitData;
    try {
      const res = await fetch("data/transit.json");
      transitData = res.ok ? await res.json() : false;
    } catch (_) {
      transitData = false;
    }
    return transitData;
  }

  function metersBetween(a, b) {
    return (walkingMinutes(a, b) * 78.3) / 1.35;
  }

  function stopsNear(coords, radiusM) {
    return transitData.stops
      .map((s) => ({ coords: [s[0], s[1]], name: s[2], lines: s[3], dist: metersBetween(coords, [s[0], s[1]]) }))
      .filter((s) => s.dist <= radiusM)
      .sort((x, y) => x.dist - y.dist);
  }

  function lineChip(routeIdx) {
    const [name, type] = transitData.routes[routeIdx];
    return `<span class="line line--${type}">${escape(name)}</span>`;
  }

  function renderTransit(place) {
    if (!transitData || !Array.isArray(place.coords)) return "";
    // Within a short walk of the user's pin, transit suggestions are noise.
    if (userPin && walkingMinutes(userPin, place.coords) < 10) return "";
    const near = stopsNear(place.coords, 450).slice(0, 3);
    if (near.length === 0) return "";
    let html = near
      .map((s) => {
        const mins = Math.max(1, Math.round((s.dist * 1.35) / 78.3));
        const lines = [...new Set(s.lines)].map(lineChip).join("");
        return `<p class="detail__stop">🚏 ${escape(titleCase(s.name))} <em>(~${mins} мин)</em> ${lines}</p>`;
      })
      .join("");
    if (userPin) {
      const mine = new Set(stopsNear(userPin, 500).flatMap((s) => s.lines));
      const direct = [...new Set(near.flatMap((s) => s.lines))].filter((l) => mine.has(l));
      html = (direct.length
        ? `<p class="detail__stop detail__stop--direct">⭐ Директно от теб: ${direct.map(lineChip).join("")}</p>`
        : `<p class="detail__stop">Няма директна линия от твоя пин — виж 🚌 Маршрут по-горе.</p>`) + html;
    }
    return `<div class="detail__transit"><span class="filter__label">Градски транспорт</span>${html}</div>`;
  }

  function titleCase(s) {
    // GTFS stop names arrive ALL-CAPS; make them readable.
    return s.toLowerCase().replace(/(^|[\s"„(-])(\S)/g, (m, p, c) => p + c.toUpperCase());
  }

  function fillTransit(place) {
    const holder = document.getElementById("transit-holder");
    if (!holder) return;
    loadTransit().then(() => {
      const still = document.getElementById("transit-holder");
      if (!still || currentPlace !== place) return;
      still.outerHTML = renderTransit(place);
    });
  }

  function travelHtml(place) {
    if (!userPin || !Array.isArray(place.coords)) return "";
    const walk = Math.round(walkingMinutes(userPin, place.coords));
    const gmBase = `https://www.google.com/maps/dir/?api=1&origin=${userPin[1]},${userPin[0]}` +
      `&destination=${place.coords[1]},${place.coords[0]}`;
    return `
      <div class="detail__travel">
        <span class="fact">🚶 ~${walk} мин пеша</span>
        <span class="fact" id="travel-car">🚗 …</span>
        <a class="fact fact--link" href="${gmBase}&travelmode=transit" target="_blank" rel="noopener">🚌 Маршрут</a>
        <a class="fact fact--link" href="${gmBase}&travelmode=driving" target="_blank" rel="noopener">🗺️ С кола</a>
      </div>`;
  }

  function fillCarTime(place) {
    if (!userPin) return;
    const el = document.getElementById("travel-car");
    if (!el) return;
    carMinutes(place).then((mins) => {
      const still = document.getElementById("travel-car");
      if (!still) return;
      if (mins === null) still.remove();
      else still.textContent = `🚗 ~${mins} мин`;
    });
  }

  let currentPlace = null;

  function showDetail(place) {
    currentPlace = place;
    const facts = [];
    const typeLabel = label("type", place.type);
    if (typeLabel) facts.push({ text: escape(typeLabel), cls: "fact--type-" + escape(place.type) });
    if (Array.isArray(place.ages)) facts.push({ text: `👶 ${place.ages[0]}–${place.ages[1]} г.` });
    if (place.priceRange) facts.push({ text: `💰 ${escape(place.priceRange)}` });
    if (place.schedule) facts.push({ text: `🕗 ${escape(place.schedule)}` });
    if (place.outdoorSpace) facts.push({ text: "🌳 двор", yes: true });
    const factsHtml = facts
      .map((f) => `<span class="fact${f.yes ? " fact--yes" : ""}${f.cls ? " " + f.cls : ""}">${f.text}</span>`)
      .join("");

    const contacts = [];
    const c = place.contacts || {};
    if (c.phone) contacts.push(`<a href="tel:${escape(c.phone.replace(/\s/g, ""))}">📞 Обади се</a>`);
    if (c.email) contacts.push(`<a href="mailto:${escape(c.email)}" class="detail__contact--alt">✉️ Имейл</a>`);
    if (c.facebook) contacts.push(`<a href="${escape(c.facebook)}" target="_blank" rel="noopener">👥 Facebook</a>`);
    if (c.website) contacts.push(`<a href="${escape(c.website)}" target="_blank" rel="noopener" class="detail__contact--alt">🌐 Сайт</a>`);

    const addressBits = [place.address, label("district", place.district)].filter(Boolean).map(escape);
    const approxNote = place.approxLocation
      ? `<p class="detail__note">📍 Местоположението е приблизително — точният адрес не е публично известен.</p>`
      : "";
    const noteHtml = place.note ? `<p class="detail__note">ℹ️ ${escape(place.note)}</p>` : "";

    detailContent.innerHTML = `
      ${place.photo ? `<img class="detail__photo" src="${escape(place.photo)}" alt="${escape(place.name)}">` : ""}
      <h2>${escape(place.name)}</h2>
      ${place.sample ? `<span class="detail__sample">примерен запис</span>` : ""}
      ${addressBits.length ? `<p class="detail__address">📍 ${addressBits.join(", ")}</p>` : ""}
      ${travelHtml(place)}
      ${facts.length ? `<div class="detail__facts">${factsHtml}</div>` : ""}
      ${place.description ? `<p class="detail__desc">${escape(place.description)}</p>` : ""}
      <div id="transit-holder"></div>
      ${approxNote}${noteHtml}
      ${contacts.length ? `<div class="detail__contacts">${contacts.join("")}</div>` : ""}
    `;
    detailEl.hidden = false;
    panel.classList.remove("filters--open");
    toggleBtn.setAttribute("aria-expanded", "false");
    // Shareable deep link; replaceState so Back never walks through cards.
    history.replaceState(null, "", "?place=" + encodeURIComponent(place.id));
    fillCarTime(place);
    fillTransit(place);
  }

  function hideDetail() {
    detailEl.hidden = true;
    currentPlace = null;
    PlaceMap.setActive(null);
    if (location.search) history.replaceState(null, "", location.pathname);
  }
  detailClose.addEventListener("click", hideDetail);

  const onSelect = (place) => {
    PlaceMap.panTo(place);
    showDetail(place);
  };

  const engine = Filters.build(data.filterConfig, controlsRoot, refresh, {
    getPin: () => userPin,
  });

  function refresh() {
    const visible = engine.apply(data.places);
    PlaceMap.setPlaces(visible.filter((p) => !p.bulk), onSelect);
    PlaceMap.setClustered(visible.filter((p) => p.bulk), onSelect);
    const n = engine.activeCount();
    countEl.textContent = `${visible.length} ${visible.length === 1 ? "място" : "места"}`;
    document.getElementById("filters-summary").textContent = n ? `Филтри (${n})` : "Филтри";
    clearBtn.hidden = n === 0;
    emptyEl.hidden = visible.length > 0;
    if (visible.length > 0 && n > 0) PlaceMap.fitTo(visible);
  }

  clearBtn.addEventListener("click", () => {
    engine.clearAll();
    refresh();
  });

  /* ---- About dialog ---- */
  const aboutDialog = document.getElementById("about-dialog");
  document.getElementById("about-open").addEventListener("click", () => aboutDialog.showModal());
  document.getElementById("about-close").addEventListener("click", () => aboutDialog.close());
  aboutDialog.addEventListener("click", (e) => {
    // A click on the backdrop targets the dialog element itself.
    if (e.target === aboutDialog) aboutDialog.close();
  });

  toggleBtn.addEventListener("click", () => {
    // Toggle only matters in the mobile bottom-sheet layout; harmless on desktop.
    if (window.matchMedia("(min-width: 768px)").matches) return;
    const open = panel.classList.toggle("filters--open");
    toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) hideDetail();
  });

  // No initial fitTo: the dataset spans the whole municipality (Банкя to
  // Панчарево) and fitting it would zoom out past the city. The default
  // center/zoom already frames Sofia proper.
  PlaceMap.init(() => {
    if (userPin) {
      PlaceMap.setUserPin(userPin, (moved) => setPin(moved));
      locClear.hidden = false;
      engine.contextChanged();
    }
    refresh();
    // ?place=<id> deep link (from generated place pages and shared links).
    const wanted = new URLSearchParams(location.search).get("place");
    if (wanted) {
      const place = data.places.find((p) => p.id === wanted);
      if (place) {
        PlaceMap.setActive(place.id);
        onSelect(place);
      }
    }
  });
})();
