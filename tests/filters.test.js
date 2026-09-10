"use strict";
const { JSDOM } = require("jsdom");
const fs = require("fs");
const assert = require("assert");

const path = require("path");
const SITE = path.join(__dirname, "..", "site");
const dom = new JSDOM("<!doctype html><body><div id='root'></div></body>", { runScripts: "outside-only" });
global.document = dom.window.document;
global.window = dom.window;

dom.window.eval(fs.readFileSync(SITE + "/js/filters.js", "utf8") + "\n;window.Filters = Filters; window.walkingMinutes = walkingMinutes;");
const Filters = dom.window.Filters;

const filterConfig = JSON.parse(fs.readFileSync(SITE + "/data/filters.json", "utf8"));
const places = [
  ...JSON.parse(fs.readFileSync(SITE + "/data/places.json", "utf8")).places,
  ...JSON.parse(fs.readFileSync(SITE + "/data/kindergartens.json", "utf8")).places,
];

let changes = 0;
const root = dom.window.document.getElementById("root");
const engine = Filters.build(filterConfig, root, () => changes++);

// 1. No filters active: all places pass
assert.strictEqual(engine.apply(places).length, places.length, "all pass with no active filters");
assert.strictEqual(engine.activeCount(), 0);

// 2. Toggle outdoorSpace: only places with outdoorSpace true
const toggles = [...root.querySelectorAll(".filter--toggle input")];
assert.strictEqual(toggles.length, 1, "one toggle filter rendered");
toggles[0].checked = true;
toggles[0].dispatchEvent(new dom.window.Event("change"));
const withYard = engine.apply(places);
assert.ok(withYard.every((p) => p.outdoorSpace === true), "toggle filters to outdoorSpace");
assert.ok(withYard.length > 0 && withYard.length < places.length);
toggles[0].checked = false;
toggles[0].dispatchEvent(new dom.window.Event("change"));

// 3. Type multi-select: cooperative chip selects all current places
const chips = [...root.querySelectorAll(".chip")];
const coopChip = chips.find((c) => c.textContent === "Родителски кооператив");
assert.ok(coopChip, "type chip exists");
assert.ok(coopChip.style.getPropertyValue("--chip-color"), "type chip carries its color");
coopChip.click();
assert.strictEqual(engine.apply(places).length, 15, "15 cooperatives");
const publicChip = chips.find((c) => c.textContent === "Общинска градина");
coopChip.click(); // off
publicChip.click();
assert.strictEqual(engine.apply(places).length, 342, "342 municipal kindergartens");
assert.ok(engine.apply(places).every((p) => p.type === "public"));
publicChip.click(); // off

// 4. District chip combines with type chip (AND)
const lozChip = chips.find((c) => c.textContent === "Лозенец");
lozChip.click();
coopChip.click();
let res = engine.apply(places);
assert.ok(res.length > 0, "a Lozenets cooperative exists");
assert.ok(res.every((p) => p.district === "lozenets" && p.type === "cooperative"), "district AND type combine");
assert.strictEqual(engine.activeCount(), 2);

// 5. Range: age filtering respects span AND is fail-open for places without ages
const slider = root.querySelector(".filter--range input[type=range]");
slider.value = "3";
slider.dispatchEvent(new dom.window.Event("input"));
engine.clearAll();
slider.value = "6";
slider.dispatchEvent(new dom.window.Event("input"));
res = engine.apply(places);
assert.ok(res.every((p) => !Array.isArray(p.ages) || (p.ages[0] <= 6 && 6 <= p.ages[1])),
  "range excludes only places whose known span misses the age");
assert.ok(res.some((p) => !Array.isArray(p.ages)), "places with unknown ages stay visible (fail-open)");

// 6. Range clear + clearAll
root.querySelector(".filter--range .filter__range-clear").click();
assert.strictEqual(engine.activeCount(), 0, "range cleared");
engine.clearAll();
assert.strictEqual(engine.apply(places).length, places.length);

// 6b. Distance filter: inactive without a pin; filters by walking time with one
{
  let pin = null;
  const droot = dom.window.document.createElement("div");
  const dengine = Filters.build(
    { filters: [{ key: "walk", label: "Пеша", type: "distance", max: 30 }] },
    droot, () => {}, { getPin: () => pin });
  const dslider = droot.querySelector("input[type=range]");
  assert.ok(dslider.disabled, "distance slider disabled without pin");
  dslider.value = "10";
  dslider.dispatchEvent(new dom.window.Event("input"));
  assert.strictEqual(dengine.apply(places).length, places.length, "no pin => pass-through");
  pin = [23.32405, 42.68457]; // Светулки и Щурчета
  dengine.contextChanged();
  assert.ok(!dslider.disabled, "slider enabled once pin set");
  const near = dengine.apply(places);
  assert.ok(near.length > 0 && near.length < places.length, "distance filters some places");
  assert.ok(near.every((pl) => dom.window.walkingMinutes(pin, pl.coords) <= 10), "all within 10 min walk");
  assert.ok(near.some((pl) => pl.id === "svetulki-i-shturcheta"), "the pinned-on place itself is within range");
}

// 7. Unknown filter type is skipped, not a crash
const engine2 = Filters.build({ filters: [{ key: "x", label: "X", type: "nope" }] },
  dom.window.document.createElement("div"), () => {});
assert.strictEqual(engine2.apply(places).length, places.length, "unknown type is fail-open");

// 8. onChange fired on interactions
assert.ok(changes >= 5, "onChange fired");

console.log("ALL FILTER TESTS PASSED");
