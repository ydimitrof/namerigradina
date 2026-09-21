"use strict";
const { JSDOM } = require("jsdom");
const fs = require("fs");
const assert = require("assert");
const path = require("path");

const SITE = path.join(__dirname, "..", "site");
const SRC = fs.readFileSync(SITE + "/js/share.js", "utf8") + "\n;window.PlaceShare = PlaceShare;";

async function boot(navigatorPatch) {
  const dom = new JSDOM(
    `<!doctype html><body>
      <button id="b" data-share-url="https://namerigradina.party/m/x" data-share-title="Тест" data-share-text="ул. Тест 1">🔗 Сподели</button>
    </body>`,
    { runScripts: "outside-only", url: "https://namerigradina.party/" });
  const w = dom.window;
  for (const [k, v] of Object.entries(navigatorPatch)) {
    Object.defineProperty(w.navigator, k, { value: v, configurable: true });
  }
  w.eval(SRC);
  // JSDOM is still "loading" here; share.js binds on DOMContentLoaded.
  if (w.document.readyState === "loading") {
    await new Promise((r) => w.document.addEventListener("DOMContentLoaded", r));
  }
  return w;
}
const tick = () => new Promise((r) => setTimeout(r, 0));
// Payloads are created inside the JSDOM realm; strip their prototype before deep-comparing.
const plain = (arr) => arr.map((o) => JSON.parse(JSON.stringify(o)));

(async () => {
  // 1. Web Share API present: called with the data-* values, nothing else.
  {
    const calls = [];
    const w = await boot({ share: async (d) => calls.push(d), clipboard: undefined });
    w.document.getElementById("b").click();
    await tick();
    assert.deepStrictEqual(plain(calls), [{ title: "Тест", text: "ул. Тест 1", url: "https://namerigradina.party/m/x" }]);
    assert.strictEqual(w.document.getElementById("b").textContent, "🔗 Сподели", "label untouched after share sheet");
  }

  // 2. User dismisses the share sheet (AbortError): swallowed, not rethrown.
  {
    const abort = new Error("cancelled"); abort.name = "AbortError";
    const w = await boot({ share: async () => { throw abort; }, clipboard: undefined });
    const r = await w.PlaceShare.share({ title: "t", url: "u" });
    assert.strictEqual(r, "shared");
  }

  // 3. No Web Share, clipboard available: URL copied, label flips then restores.
  {
    const copied = [];
    const w = await boot({ share: undefined, clipboard: { writeText: async (t) => copied.push(t) } });
    const btn = w.document.getElementById("b");
    const r = await w.PlaceShare.share({ title: "Тест", url: "https://namerigradina.party/m/x" }, btn);
    assert.strictEqual(r, "copied");
    assert.deepStrictEqual(copied, ["https://namerigradina.party/m/x"]);
    assert.strictEqual(btn.textContent, w.PlaceShare.COPIED);
    assert.strictEqual(btn.disabled, true);
    await new Promise((res) => setTimeout(res, 2100));
    assert.strictEqual(btn.textContent, "🔗 Сподели", "label restored");
    assert.strictEqual(btn.disabled, false);
  }

  // 4. Neither API: falls back to window.prompt with the URL.
  {
    const prompts = [];
    const w = await boot({ share: undefined, clipboard: undefined });
    w.prompt = (msg, val) => prompts.push(val);
    const r = await w.PlaceShare.share({ title: "t", url: "https://namerigradina.party/m/y" });
    assert.strictEqual(r, "prompted");
    assert.deepStrictEqual(prompts, ["https://namerigradina.party/m/y"]);
  }

  // 5. bind() is idempotent: binding twice yields one handler.
  {
    const calls = [];
    const w = await boot({ share: async (d) => calls.push(d), clipboard: undefined });
    w.PlaceShare.bind(w.document);
    w.PlaceShare.bind(w.document);
    w.document.getElementById("b").click();
    await tick();
    assert.strictEqual(calls.length, 1, "one share call despite three bind() passes");
  }

  console.log("share.test.js: all assertions passed");
})().catch((err) => { console.error(err); process.exit(1); });
