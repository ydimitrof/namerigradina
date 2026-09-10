/* Config-driven filter engine.
 * Each filter type defines how to render its control and how to test a place.
 * Adding a new filter is a filters.json edit; adding a new TYPE is one entry here.
 * Types may read shared context (e.g. the user's pin) via ctx and can expose
 * an update(ctx) hook, called when the context changes. */
"use strict";

/* Walking-time estimate: haversine distance with a 1.35 street-detour
 * factor at ~4.7 km/h. Shared by the distance filter and the detail card. */
function walkingMinutes(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * R * Math.asin(Math.sqrt(s));
  return (meters * 1.35) / 78.3;
}

const Filters = (() => {
  const TYPES = {
    "multi-select": {
      render(filter, container, onChange) {
        const wrap = document.createElement("div");
        wrap.className = "filter__chips";
        const selected = new Set();
        for (const opt of filter.options || []) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "chip";
          btn.textContent = opt.label;
          btn.setAttribute("aria-pressed", "false");
          if (opt.color) btn.style.setProperty("--chip-color", opt.color);
          btn.addEventListener("click", () => {
            if (selected.has(opt.value)) selected.delete(opt.value);
            else selected.add(opt.value);
            btn.setAttribute("aria-pressed", selected.has(opt.value) ? "true" : "false");
            onChange();
          });
          wrap.appendChild(btn);
        }
        container.appendChild(wrap);
        return {
          isActive: () => selected.size > 0,
          test(place) {
            if (selected.size === 0) return true;
            const v = place[filter.key];
            if (Array.isArray(v)) return v.some((x) => selected.has(x));
            return selected.has(v);
          },
          clear() {
            selected.clear();
            wrap.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", "false"));
          },
        };
      },
    },

    "range": {
      render(filter, container, onChange) {
        const wrap = document.createElement("div");
        wrap.className = "filter__range";
        const input = document.createElement("input");
        input.type = "range";
        input.min = String(filter.min ?? 0);
        input.max = String(filter.max ?? 10);
        input.step = "1";
        input.value = input.min;
        input.setAttribute("aria-label", filter.label);
        const out = document.createElement("output");
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "filter__range-clear";
        clearBtn.textContent = "✕";
        clearBtn.setAttribute("aria-label", "Изчисти " + filter.label.toLowerCase());
        let active = false;
        const unit = filter.unit ? " " + filter.unit : "";
        const show = () => {
          out.textContent = active ? input.value + unit : "всички";
          clearBtn.hidden = !active;
        };
        input.addEventListener("input", () => {
          active = true;
          show();
          onChange();
        });
        clearBtn.addEventListener("click", () => {
          active = false;
          input.value = input.min;
          show();
          onChange();
        });
        show();
        wrap.append(input, out, clearBtn);
        container.appendChild(wrap);
        return {
          isActive: () => active,
          test(place) {
            if (!active) return true;
            const v = place[filter.key];
            // Missing data is fail-open: a place with unknown age range stays
            // visible so parents can inquire, rather than silently vanishing.
            if (!Array.isArray(v) || v.length < 2) return true;
            const n = Number(input.value);
            return v[0] <= n && n <= v[1];
          },
          clear() {
            active = false;
            input.value = input.min;
            show();
          },
        };
      },
    },

    "distance": {
      render(filter, container, onChange, ctx) {
        const wrap = document.createElement("div");
        wrap.className = "filter__range";
        const input = document.createElement("input");
        input.type = "range";
        input.min = "5";
        input.max = String(filter.max ?? 30);
        input.step = "5";
        input.value = input.max;
        input.setAttribute("aria-label", filter.label);
        const out = document.createElement("output");
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "filter__range-clear";
        clearBtn.textContent = "✕";
        clearBtn.setAttribute("aria-label", "Изчисти " + filter.label.toLowerCase());
        const hint = document.createElement("p");
        hint.className = "filter__hint";
        hint.textContent = "Първо посочи адрес или пин на картата.";
        let active = false;
        const show = () => {
          const hasPin = !!(ctx && ctx.getPin && ctx.getPin());
          input.disabled = !hasPin;
          hint.hidden = hasPin;
          out.textContent = active && hasPin ? `до ${input.value} мин` : "всички";
          clearBtn.hidden = !(active && hasPin);
        };
        input.addEventListener("input", () => {
          active = true;
          show();
          onChange();
        });
        clearBtn.addEventListener("click", () => {
          active = false;
          input.value = input.max;
          show();
          onChange();
        });
        show();
        wrap.append(input, out, clearBtn);
        container.append(wrap, hint);
        return {
          isActive: () => active && !!(ctx && ctx.getPin && ctx.getPin()),
          test(place) {
            const pin = ctx && ctx.getPin && ctx.getPin();
            if (!active || !pin) return true;
            if (!Array.isArray(place.coords) || place.coords.length < 2) return true;
            return walkingMinutes(pin, place.coords) <= Number(input.value);
          },
          clear() {
            active = false;
            input.value = input.max;
            show();
          },
          update: show,
        };
      },
    },

    "toggle": {
      render(filter, container, onChange) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        const text = document.createElement("span");
        text.textContent = filter.label;
        input.addEventListener("change", onChange);
        label.append(input, text);
        container.appendChild(label);
        return {
          isActive: () => input.checked,
          test: (place) => !input.checked || place[filter.key] === true,
          clear() { input.checked = false; },
        };
      },
    },
  };

  /* Builds all controls into `root`; returns {apply, activeCount, clearAll,
   * contextChanged}. `ctx` is shared read-only state for context-aware types. */
  function build(config, root, onChange, ctx) {
    const controls = [];
    for (const filter of config.filters || []) {
      const type = TYPES[filter.type];
      if (!type) {
        console.warn(`Непознат тип филтър "${filter.type}" (${filter.key}) — пропуснат.`);
        continue;
      }
      const box = document.createElement("div");
      box.className = "filter filter--" + filter.type;
      if (filter.type !== "toggle") {
        const lbl = document.createElement("span");
        lbl.className = "filter__label";
        lbl.textContent = filter.label;
        box.appendChild(lbl);
      }
      controls.push(type.render(filter, box, onChange, ctx));
      root.appendChild(box);
    }
    return {
      apply: (places) => places.filter((p) => controls.every((c) => c.test(p))),
      activeCount: () => controls.filter((c) => c.isActive()).length,
      clearAll: () => controls.forEach((c) => c.clear()),
      contextChanged: () => controls.forEach((c) => c.update && c.update()),
    };
  }

  return { build };
})();
