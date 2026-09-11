#!/usr/bin/env python3
"""Generate the crawlable static pages from the site's JSON data.

Outputs (all committed, regenerated after data edits):
  site/m/<id>.html      one page per place (457)
  site/r/<district>.html one page per district, plus site/r/index.html
  site/sitemap.xml

Deterministic: all dates come from the JSON `updated` fields, so CI can
verify the committed output matches the data (drift guard).

Usage: python3 scripts/build-pages.py
"""
import html
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "site"
BASE = "https://namerigradina.party"

places_doc = json.loads((ROOT / "data" / "places.json").read_text())
kg_doc = json.loads((ROOT / "data" / "kindergartens.json").read_text())
filters_doc = json.loads((ROOT / "data" / "filters.json").read_text())

DISTRICT = filters_doc.get("labels", {}).get("district", {})
TYPE_LABEL = {}
for f in filters_doc["filters"]:
    if f["key"] == "type":
        TYPE_LABEL = {o["value"]: o["label"] for o in f["options"]}

PLACES = places_doc["places"] + kg_doc["places"]
LASTMOD = max(places_doc.get("updated", ""), kg_doc.get("updated", ""))

e = html.escape

STYLE = """
@font-face{font-family:Nunito;font-weight:200 1000;font-display:swap;
src:url(/assets/fonts/nunito-cyrillic.woff2)format("woff2");
unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:Nunito;font-weight:200 1000;font-display:swap;
src:url(/assets/fonts/nunito-latin.woff2)format("woff2");unicode-range:U+0000-00FF}
body{font-family:Nunito,"Segoe UI",system-ui,sans-serif;background:#fff7ec;color:#35323e;
margin:0;padding:20px;line-height:1.55}
main{max-width:640px;margin:0 auto;background:#fff;border-radius:18px;
padding:24px 22px;box-shadow:0 6px 24px rgba(53,50,62,.12)}
h1{font-size:24px;margin:6px 0 4px}h2{font-size:17px;margin:18px 0 8px}
a{color:#0fb5a6;font-weight:700}
.crumbs{font-size:13px;color:#6d6878}.crumbs a{color:#6d6878}
.tag{display:inline-block;background:#fff7ec;border-radius:8px;padding:3px 10px;
font-size:13px;font-weight:700;margin:2px 6px 2px 0}
.tag-cooperative{background:#ffe3e3;color:#b23b3b}
.tag-private{background:#ece7fb;color:#5f4bb6}
.tag-public{background:#dff5f2;color:#0b7c6f}
.cta{display:inline-block;background:#ff6b6b;color:#fff;text-decoration:none;
border-radius:999px;padding:12px 22px;font-weight:800;margin:14px 0}
.note{background:#fff7ec;border-radius:10px;padding:9px 12px;font-size:14px}
ul{padding-left:20px}li{margin-bottom:7px}
footer{max-width:640px;margin:14px auto;font-size:12px;color:#6d6878;text-align:center}
"""


def page(title, desc, canonical, body, jsonld=None):
    ld = f'<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>' if jsonld else ""
    return f"""<!DOCTYPE html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{canonical}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{canonical}">
<meta property="og:type" content="website">
<meta property="og:locale" content="bg_BG">
<meta property="og:site_name" content="Намери Градина">
<meta property="og:image" content="{BASE}/assets/og.png">
<meta name="theme-color" content="#fff7ec">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
{ld}
<style>{STYLE}</style>
</head>
<body>
<main>
{body}
</main>
<footer>«Намери Градина» е доброволен проект с отворен код ·
<a href="/">Карта</a> · <a href="/r/index.html">Всички райони</a> ·
<a href="https://github.com/ydimitrof/namerigradina">GitHub</a></footer>
</body>
</html>
"""


def contact_list(p):
    c = p.get("contacts") or {}
    items = []
    if p.get("address"):
        items.append(f"<li>📍 {e(p['address'])}</li>")
    if c.get("phone"):
        tel = c["phone"].replace(" ", "")
        items.append(f'<li>📞 <a href="tel:{e(tel)}">{e(c["phone"])}</a></li>')
    if c.get("email"):
        items.append(f'<li>✉️ <a href="mailto:{e(c["email"])}">{e(c["email"])}</a></li>')
    if c.get("website"):
        items.append(f'<li>🌐 <a href="{e(c["website"])}" rel="nofollow noopener">{e(c["website"])}</a></li>')
    if c.get("facebook"):
        items.append(f'<li>👥 <a href="{e(c["facebook"])}" rel="nofollow noopener">Facebook</a></li>')
    return items


def jsonld_for(p):
    is_nursery = isinstance(p.get("ages"), list) and p["ages"][1] <= 3
    d = {
        "@context": "https://schema.org",
        "@type": "ChildCare" if is_nursery else "Preschool",
        "name": p["name"],
        "address": {
            "@type": "PostalAddress",
            "addressLocality": "София",
            "addressCountry": "BG",
        },
    }
    if p.get("address"):
        d["address"]["streetAddress"] = p["address"]
    if isinstance(p.get("coords"), list) and len(p["coords"]) == 2:
        d["geo"] = {"@type": "GeoCoordinates",
                    "latitude": p["coords"][1], "longitude": p["coords"][0]}
    c = p.get("contacts") or {}
    if c.get("phone"):
        d["telephone"] = c["phone"]
    if c.get("email"):
        d["email"] = c["email"]
    if c.get("website"):
        d["url"] = c["website"]
    if c.get("facebook"):
        d["sameAs"] = [c["facebook"]]
    return d


def place_page(p):
    dl = DISTRICT.get(p.get("district"))
    tl = TYPE_LABEL.get(p["type"], "")
    loc = f"{dl}, София" if dl else "София"
    title = f"{p['name']} — {loc} | Намери Градина"
    desc = (p.get("description")
            or f"„{p['name']}“ — {tl.lower()} в {loc}."
               f"{' Адрес: ' + p['address'] + '.' if p.get('address') else ''}"
               " Контакти и местоположение на картата.")
    crumbs = ['<a href="/">Начало</a>', '<a href="/r/index.html">Райони</a>']
    if dl:
        crumbs.append(f'<a href="/r/{e(p["district"])}.html">{e(dl)}</a>')
    body = [f'<p class="crumbs">{" › ".join(crumbs)}</p>',
            f"<h1>{e(p['name'])}</h1>",
            f'<p><span class="tag tag-{e(p["type"])}">{e(tl)}</span>']
    if isinstance(p.get("ages"), list):
        body.append(f'<span class="tag">👶 {p["ages"][0]}–{p["ages"][1]} г.</span>')
    if p.get("schedule"):
        body.append(f'<span class="tag">🕗 {e(p["schedule"])}</span>')
    if p.get("priceRange"):
        body.append(f'<span class="tag">💰 {e(p["priceRange"])}</span>')
    if p.get("outdoorSpace"):
        body.append('<span class="tag">🌳 двор</span>')
    body.append("</p>")
    if p.get("description"):
        body.append(f"<p>{e(p['description'])}</p>")
    items = contact_list(p)
    if items:
        body.append("<h2>Контакти и адрес</h2><ul>" + "".join(items) + "</ul>")
    if p.get("approxLocation"):
        body.append('<p class="note">📍 Местоположението на картата е приблизително.</p>')
    if p.get("note"):
        body.append(f'<p class="note">ℹ️ {e(p["note"])}</p>')
    body.append(f'<a class="cta" href="/?place={e(p["id"])}">Отвори на картата →</a>')
    return page(title, desc[:300], f"{BASE}/m/{p['id']}.html", "\n".join(body), jsonld_for(p))


def district_page(slug, label, members):
    by_type = {"public": [], "private": [], "cooperative": []}
    for p in members:
        by_type.setdefault(p["type"], []).append(p)
    title = f"Детски градини в {label} — общински, частни и кооперативи | Намери Градина"
    counts = []
    for t, hdr in (("public", "общински"), ("private", "частни"), ("cooperative", "кооперативи")):
        if by_type[t]:
            counts.append(f"{len(by_type[t])} {hdr}")
    desc = (f"Всички детски градини и родителски кооперативи в {label}, София: "
            + ", ".join(counts) + ". Адреси, контакти и карта.")
    body = ['<p class="crumbs"><a href="/">Начало</a> › <a href="/r/index.html">Райони</a></p>',
            f"<h1>Детски градини и кооперативи в {e(label)}</h1>",
            f"<p>{e(', '.join(counts).capitalize())} — всички с адрес и контакти, "
            f'подредени на <a href="/">картата на Намери Градина</a>.</p>']
    for t, hdr in (("public", "Общински детски градини"),
                   ("private", "Частни детски градини"),
                   ("cooperative", "Родителски кооперативи")):
        if not by_type[t]:
            continue
        body.append(f"<h2>{hdr}</h2><ul>")
        for p in sorted(by_type[t], key=lambda x: x["name"]):
            addr = f" — {e(p['address'])}" if p.get("address") else ""
            body.append(f'<li><a href="/m/{e(p["id"])}.html">{e(p["name"])}</a>{addr}</li>')
        body.append("</ul>")
    others = [f'<a href="/r/{e(s)}.html">{e(l)}</a>'
              for s, l in sorted(DISTRICT.items(), key=lambda kv: kv[1]) if s != slug and s in used_districts]
    body.append('<h2>Други райони</h2><p>' + " · ".join(others) + "</p>")
    return page(title, desc, f"{BASE}/r/{slug}.html", "\n".join(body))


# ---- generate ----
for sub in ("m", "r"):
    d = ROOT / sub
    if d.exists():
        shutil.rmtree(d)
    d.mkdir()

by_district = {}
for p in PLACES:
    by_district.setdefault(p.get("district"), []).append(p)
used_districts = {d for d in by_district if d in DISTRICT}

for p in PLACES:
    (ROOT / "m" / f"{p['id']}.html").write_text(place_page(p))

for slug in sorted(used_districts):
    (ROOT / "r" / f"{slug}.html").write_text(district_page(slug, DISTRICT[slug], by_district[slug]))

index_body = ['<p class="crumbs"><a href="/">Начало</a></p>',
              "<h1>Детски градини и кооперативи по райони</h1>",
              f"<p>{len(PLACES)} места в София — изберете район или ги разгледайте "
              '<a href="/">на картата</a>.</p><ul>']
for slug, label in sorted(DISTRICT.items(), key=lambda kv: kv[1]):
    if slug in used_districts:
        index_body.append(f'<li><a href="/r/{e(slug)}.html">{e(label)}</a> — {len(by_district[slug])} места</li>')
orphans = [p for d, ms in by_district.items() if d not in DISTRICT for p in ms]
if orphans:
    index_body.append("</ul><h2>Без посочен район</h2><ul>")
    for p in sorted(orphans, key=lambda x: x["name"]):
        index_body.append(f'<li><a href="/m/{e(p["id"])}.html">{e(p["name"])}</a></li>')
index_body.append("</ul>")
(ROOT / "r" / "index.html").write_text(page(
    "Детски градини в София по райони | Намери Градина",
    f"Указател на {len(PLACES)} детски градини и родителски кооперативи в София по райони.",
    f"{BASE}/r/index.html", "\n".join(index_body)))

urls = [f"{BASE}/", f"{BASE}/r/index.html"]
urls += [f"{BASE}/r/{s}.html" for s in sorted(used_districts)]
urls += [f"{BASE}/m/{p['id']}.html" for p in PLACES]
sm = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u in urls:
    sm.append(f"<url><loc>{u}</loc><lastmod>{LASTMOD}</lastmod></url>")
sm.append("</urlset>")
(ROOT / "sitemap.xml").write_text("\n".join(sm) + "\n")

print(f"pages: {len(PLACES)} places, {len(used_districts)} districts (+index), "
      f"sitemap {len(urls)} urls, lastmod {LASTMOD}")
