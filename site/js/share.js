/* Share a place: Web Share API where available, else copy the link. */
"use strict";

const PlaceShare = (() => {
  const COPIED = "✅ Линкът е копиран";
  const RESET_MS = 2000;

  async function share(data, btn) {
    const nav = window.navigator;
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: data.title, text: data.text || undefined, url: data.url });
      } catch (err) {
        if (!err || err.name !== "AbortError") throw err;
      }
      return "shared";
    }
    if (nav.clipboard && typeof nav.clipboard.writeText === "function") {
      await nav.clipboard.writeText(data.url);
      if (btn) {
        const original = btn.textContent;
        btn.textContent = COPIED;
        btn.disabled = true;
        window.setTimeout(() => {
          btn.textContent = original;
          btn.disabled = false;
        }, RESET_MS);
      }
      return "copied";
    }
    window.prompt("Копирай линка:", data.url);
    return "prompted";
  }

  function bind(root) {
    root.querySelectorAll("[data-share-url]").forEach((btn) => {
      if (btn.dataset.shareBound) return;
      btn.dataset.shareBound = "1";
      btn.addEventListener("click", () => {
        share({ title: btn.dataset.shareTitle || document.title,
                text: btn.dataset.shareText || "",
                url: btn.dataset.shareUrl }, btn)
          .catch((err) => console.error("share failed", err));
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bind(document));
  } else {
    bind(document);
  }

  return { share, bind, COPIED };
})();
