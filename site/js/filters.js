/* Config-driven filter engine.
 * Each filter type defines how to render its control and how to test a place.
 * Adding a new filter is a filters.json edit; adding a new TYPE is one entry here. */
"use strict";

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
            if (!Array.isArray(v) || v.length < 2) return false;
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

  /* Builds all controls into `root`; returns {apply, activeCount, clearAll}. */
  function build(config, root, onChange) {
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
      controls.push(type.render(filter, box, onChange));
      root.appendChild(box);
    }
    return {
      apply: (places) => places.filter((p) => controls.every((c) => c.test(p))),
      activeCount: () => controls.filter((c) => c.isActive()).length,
      clearAll: () => controls.forEach((c) => c.clear()),
    };
  }

  return { build };
})();
