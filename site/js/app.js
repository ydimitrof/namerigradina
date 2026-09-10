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
    const [placesRes, filtersRes] = await Promise.all([
      fetch("data/places.json"),
      fetch("data/filters.json"),
    ]);
    if (!placesRes.ok || !filtersRes.ok) {
      throw new Error(`HTTP ${placesRes.status}/${filtersRes.status}`);
    }
    data = {
      places: (await placesRes.json()).places,
      filterConfig: await filtersRes.json(),
    };
  } catch (err) {
    console.error("Данните не се заредиха:", err);
    emptyEl.hidden = false;
    emptyEl.querySelector("p").textContent = "Данните не се заредиха — опитайте пак по-късно.";
    return;
  }

  // Single source of truth for district labels: the filter options.
  const districtLabels = {};
  for (const f of data.filterConfig.filters || []) {
    if (f.key === "district") {
      for (const o of f.options || []) districtLabels[o.value] = o.label;
    }
  }

  const escape = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function showDetail(place) {
    const facts = [];
    if (Array.isArray(place.ages)) facts.push({ text: `👶 ${place.ages[0]}–${place.ages[1]} г.` });
    if (place.priceRange) facts.push({ text: `💰 ${escape(place.priceRange)}` });
    if (place.schedule) facts.push({ text: `🕗 ${escape(place.schedule)}` });
    if (place.outdoorSpace) facts.push({ text: "🌳 двор", yes: true });
    if (place.openSpots) facts.push({ text: "✅ свободни места", yes: true });
    const factsHtml = facts
      .map((f) => `<span class="fact${f.yes ? " fact--yes" : ""}">${f.text}</span>`)
      .join("");

    const contacts = [];
    const c = place.contacts || {};
    if (c.phone) contacts.push(`<a href="tel:${escape(c.phone.replace(/\s/g, ""))}">📞 Обади се</a>`);
    if (c.email) contacts.push(`<a href="mailto:${escape(c.email)}" class="detail__contact--alt">✉️ Имейл</a>`);
    if (c.facebook) contacts.push(`<a href="${escape(c.facebook)}" target="_blank" rel="noopener">👥 Facebook</a>`);
    if (c.website) contacts.push(`<a href="${escape(c.website)}" target="_blank" rel="noopener" class="detail__contact--alt">🌐 Сайт</a>`);

    const addressBits = [place.address, districtLabels[place.district]].filter(Boolean).map(escape);

    detailContent.innerHTML = `
      ${place.photo ? `<img class="detail__photo" src="${escape(place.photo)}" alt="${escape(place.name)}">` : ""}
      <h2>${escape(place.name)}</h2>
      ${place.sample ? `<span class="detail__sample">примерен запис</span>` : ""}
      ${addressBits.length ? `<p class="detail__address">📍 ${addressBits.join(", ")}</p>` : ""}
      ${facts.length ? `<div class="detail__facts">${factsHtml}</div>` : ""}
      ${place.description ? `<p class="detail__desc">${escape(place.description)}</p>` : ""}
      ${contacts.length ? `<div class="detail__contacts">${contacts.join("")}</div>` : ""}
    `;
    detailEl.hidden = false;
    panel.classList.remove("filters--open");
    toggleBtn.setAttribute("aria-expanded", "false");
  }

  function hideDetail() {
    detailEl.hidden = true;
    CoopMap.setActive(null);
  }
  detailClose.addEventListener("click", hideDetail);

  const onSelect = (place) => {
    CoopMap.panTo(place);
    showDetail(place);
  };

  const engine = Filters.build(data.filterConfig, controlsRoot, refresh);

  function refresh() {
    const visible = engine.apply(data.places);
    CoopMap.setPlaces(visible, onSelect);
    const n = engine.activeCount();
    countEl.textContent = `${visible.length} ${visible.length === 1 ? "място" : "места"}`;
    document.getElementById("filters-summary").textContent = n ? `Филтри (${n})` : "Филтри";
    clearBtn.hidden = n === 0;
    emptyEl.hidden = visible.length > 0;
    if (visible.length > 0 && n > 0) CoopMap.fitTo(visible);
  }

  clearBtn.addEventListener("click", () => {
    engine.clearAll();
    refresh();
  });

  toggleBtn.addEventListener("click", () => {
    // Toggle only matters in the mobile bottom-sheet layout; harmless on desktop.
    if (window.matchMedia("(min-width: 768px)").matches) return;
    const open = panel.classList.toggle("filters--open");
    toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) hideDetail();
  });

  CoopMap.init(() => {
    refresh();
    CoopMap.fitTo(data.places);
  });
})();
