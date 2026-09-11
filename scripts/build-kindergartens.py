#!/usr/bin/env python3
"""Rebuild site/data/kindergartens.json from the three official sources.

Layers:
  municipal  ИСОДЗ live API (kg.sofia.bg) + arcgis.sofia.bg coords (layers 1, 2)
  private    МОН НЕИСПУО register — browser harvest JSON (see below)
  nurseries  СРЗИ private-nursery PDF published on kg.sofia.bg (pypdf required)

МОН harvest: ri-api.mon.bg is behind a Cloudflare JS challenge for plain
clients, so the register is harvested in a logged-in browser: paste the
ri-harvest console script (documented in docs/data-research.md) on ri.mon.bg,
click one "детайли" row, and the script fetches every (instid, procID) pair's
record and downloads ri-details.json. Pass that file via --mon-harvest.

СРЗИ PDF: the file id is hand-published on kg.sofia.bg/#/manual and changes
when СРЗИ issue a new list — pass a new id via --srzi-file-id when it does.

Geocoding is two-pass (Photon, then Nominatim; second pass strips
"вх./ет./ап." apartment tails) and cached in scripts/geocode-cache.json.
Entries whose id already exists in the current kindergartens.json keep their
coordinates verbatim (manual fixes are never regressed); use --re-geocode to
override.

Usage:
  python3 scripts/build-kindergartens.py [--mon-harvest PATH]
      [--srzi-file-id ID | --srzi-pdf PATH] [--re-geocode]
"""
import argparse
import io
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "kindergartens.json"
CACHE_PATH = ROOT / "scripts" / "geocode-cache.json"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}

ISODZ_URL = ("https://kg.sofia.bg/api/public/kg/type/kinderGarden/all"
             "?filterType=by_region&kgType=0&regionId=0")
ARC_URL = ("https://arcgis.sofia.bg/arcgis/rest/services/School_AllPublic/"
           "Schools_AllPublic/MapServer/{layer}/query?where=1%3D1&outFields=*&outSR=4326&f=json")
SRZI_URL = "https://kg.sofia.bg/api/public/file/{file_id}"
SRZI_DEFAULT_FILE_ID = "99c25e1365684262ba9ebe720bb3bad2"

RAYON_SLUG = {
    "Банкя": "bankya", "Витоша": "vitosha", "Връбница": "vrabnitsa",
    "Възраждане": "vazrazhdane", "Изгрев": "izgrev", "Илинден": "ilinden",
    "Искър": "iskar", "Красна поляна": "krasna-polyana", "Красно село": "krasno-selo",
    "Кремиковци": "kremikovtsi", "Лозенец": "lozenets", "Люлин": "lyulin",
    "Младост": "mladost", "Надежда": "nadezhda", "Нови Искър": "novi-iskar",
    "Оборище": "oborishte", "Овча купел": "ovcha-kupel", "Панчарево": "pancharevo",
    "Подуяне": "poduyane", "Сердика": "serdika", "Слатина": "slatina",
    "Средец": "sredets", "Студентски": "studentski", "Триадица": "triaditsa",
}
CYR = {"а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ж": "zh",
       "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n",
       "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f",
       "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sht", "ъ": "a",
       "ь": "", "ю": "yu", "я": "ya"}


def slug(text):
    text = "".join(CYR.get(c, c) for c in text.lower())
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:60] or "place"


def get_json(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def in_sofia(lng, lat):
    return 23.0 < lng < 23.8 and 42.4 < lat < 42.95


# ---------------------------------------------------------------- geocoding

def load_cache():
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text())
    return {}


def save_cache(cache):
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=0, sort_keys=True) + "\n")


def clean_addr(addr, aggressive):
    a = re.sub(r"^(гр\.\s*София[^,]*,\s*)?(р-н|район)\s+[^,]+,\s*", "", addr, flags=re.I)
    a = re.sub(r"^гр\.\s*София,?\s*", "", a)
    a = a.replace("„", "").replace("“", "").replace('"', "").replace("№", "")
    a = re.sub(r"\bж\.?\s*к\.?\s*", "жк ", a)
    a = re.sub(r"\bв\.\s*з\.\s*", "вилна зона ", a)
    if aggressive:
        a = re.split(r",\s*(вх|ет|ап|партер|офис|корпус)\b", a)[0]
    return re.sub(r"\s+", " ", a).strip().strip(",")


def photon(q):
    url = ("https://photon.komoot.io/api/?limit=1&lat=42.6977&lon=23.3219&q="
           + urllib.parse.quote(q + ", София"))
    try:
        d = get_json(url, timeout=15)
        f = d.get("features")
        if f:
            lng, lat = f[0]["geometry"]["coordinates"]
            if in_sofia(lng, lat):
                return [round(lng, 5), round(lat, 5)]
    except Exception:
        pass
    return None


def nominatim(q):
    url = ("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=bg&q="
           + urllib.parse.quote(q + ", София"))
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "namerigradina-build/0.2"})
        d = json.load(urllib.request.urlopen(req, timeout=15))
        if d:
            lng, lat = float(d[0]["lon"]), float(d[0]["lat"])
            if in_sofia(lng, lat):
                return [round(lng, 5), round(lat, 5)]
    except Exception:
        pass
    return None


def geocode(addr, cache):
    if addr in cache:
        return cache[addr]
    coords = None
    for q in (clean_addr(addr, False), clean_addr(addr, True),
              clean_addr(addr, True).split(",")[0]):
        coords = photon(q)
        time.sleep(1.0)
        if coords:
            break
        coords = nominatim(q)
        time.sleep(1.1)
        if coords:
            break
    cache[addr] = coords
    save_cache(cache)
    return coords


# ---------------------------------------------------------------- municipal

def norm_name(s):
    return re.sub(r"[^а-яa-z0-9]+", "", s.lower())


def build_municipal(cache, existing):
    kg = get_json(ISODZ_URL)["items"]["kinderGardens"]
    arc = []
    for layer in (1, 2):
        arc += get_json(ARC_URL.format(layer=layer))["features"]
    by_exact = {norm_name(f["attributes"].get("fullname") or ""): f for f in arc}

    def num_of(name):
        m = re.search(r"№\s*(\d+)", name)
        return m.group(1) if m else None

    by_num = {}
    for f in arc:
        n = num_of(f["attributes"].get("fullname") or "")
        if n:
            by_num.setdefault(n, []).append(f)

    out, seen = [], set()
    for k in kg:
        name = k["nameStr"].strip()
        addr = re.sub(r"^гр\.\s*София,\s*", "", (k.get("address") or "")).strip() or None
        phone = None
        for c in k.get("contacts") or []:
            if (c.get("kindCommunication") or {}).get("label") == "phone" and c.get("fieldValue"):
                phone = c["fieldValue"].replace("/", " ").strip()
                break
        feat = by_exact.get(norm_name(name))
        if not feat:
            n = num_of(name)
            cands = by_num.get(n, [])
            if len(cands) == 1:
                feat = cands[0]
            elif len(cands) > 1 and addr:
                toks = set(re.findall(r"[а-я]{4,}", addr.lower()))
                feat = max(cands, key=lambda f: len(
                    toks & set(re.findall(r"[а-я]{4,}", (f["attributes"].get("fulladdress") or "").lower()))))
        website = (feat["attributes"].get("hyperlink") or "").strip() if feat else ""
        base = "kg-" + slug(name)
        pid, n2 = base, 2
        while pid in seen:
            pid, n2 = f"{base}-{n2}", n2 + 1
        seen.add(pid)
        low = name.lower()
        if low.startswith("сдя") or "детска ясла" in low:
            ages = [0, 3]
        elif "яслени" in low:
            ages = [1, 7]
        else:
            ages = [3, 7]
        place = {
            "id": pid, "type": "public", "name": name,
            "coords": None, "address": addr,
            "district": RAYON_SLUG.get((k.get("region") or "").strip()),
            "ages": ages,
            "contacts": {"phone": phone, "email": None, "facebook": None,
                         "website": website or None},
        }
        prev = existing.get(pid)
        if prev and prev.get("coords"):
            place["coords"] = prev["coords"]
            if prev.get("approxLocation"):
                place["approxLocation"] = True
        elif feat:
            g = feat["geometry"]
            if in_sofia(g["x"], g["y"]):
                place["coords"] = [round(g["x"], 5), round(g["y"], 5)]
        if place["coords"] is None and addr:
            place["coords"] = geocode(addr, cache)
            if place["coords"] is None and place["district"]:
                place["approxLocation"] = True  # will fall back to centroid below
        out.append(place)
    return out


# ---------------------------------------------------------------- МОН private

def display_name(rec):
    for field in (rec.get("abbreviation") or "", rec.get("name") or ""):
        m = re.search(r'[„"“]([^„"“]+)[„"“]', field)
        if m:
            kernel = " ".join(w if (w.isupper() and len(w) <= 3) else w.capitalize()
                              for w in m.group(1).lower().split())
            return f"ЧДГ „{kernel}“"
    return rec.get("abbreviation") or rec.get("name")


def build_mon(path, cache, existing):
    harvest = json.loads(Path(path).expanduser().read_text())
    out = []
    for r in harvest["records"]:
        data = (r.get("body") or {}).get("data") or []
        if not data:
            continue
        rec = data[0]
        code = str(rec["codeNEISPUO"])
        pid = f"chdg-{code}"
        addr = (rec.get("settlementAddress") or "").strip()
        m = re.match(r"(?:София[^,]*,\s*)?(?:р-н|район)\s+([^,]+)", addr, flags=re.I)
        district = RAYON_SLUG.get(m.group(1).strip()) if m else None
        website = (rec.get("website") or "").strip()
        if website and not website.startswith("http"):
            website = "https://" + website
        place = {
            "id": pid, "type": "private", "name": display_name(rec),
            "coords": None, "address": addr or None, "district": district,
            "contacts": {"phone": (rec.get("phoneNumber") or "").strip() or None,
                         "email": (rec.get("email") or "").strip() or None,
                         "facebook": None, "website": website or None},
        }
        prev = existing.get(pid)
        if prev:
            place["coords"] = prev.get("coords")
            place["district"] = place["district"] or prev.get("district")
            if prev.get("approxLocation"):
                place["approxLocation"] = True
            if prev.get("note"):
                place["note"] = prev["note"]
        if place["coords"] is None and addr:
            place["coords"] = geocode(addr, cache)
        out.append(place)
    return out


# ---------------------------------------------------------------- СРЗИ ясли

SRZI_RAYON_RE = "|".join(sorted(RAYON_SLUG, key=len, reverse=True))
# Rows the generic parser cannot split (owner column quirks), keyed by license.
SRZI_ADDR_OVERRIDES = {
    "2229029456": "кв. Горубляне, ул. \"Искър\" № 29А",
    "2229028195": "ул. \"Оборище\" № 78",
    "2229029985": "бул. \"Монтевидео\" № 6",
    "2229027902": "с. Лозен, ул. \"Съединение\" № 54",
    "2229030240": "ул. \"Асен Йорданов\" № 22А",
}


def build_srzi(pdf_bytes, cache, existing, mon_places):
    try:
        from pypdf import PdfReader
    except ImportError:
        raise SystemExit("pypdf is required for the СРЗИ layer: pip3 install pypdf")
    text = "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf_bytes)).pages)
    pattern = re.compile(rf"^(?:(\d{{1,3}}) )?({SRZI_RAYON_RE}) ", re.M)
    bounds = [(m.start(), m.group(1), m.group(2)) for m in pattern.finditer(text)]
    active, gone = [], 0
    for i, (pos, num, ray) in enumerate(bounds):
        end = bounds[i + 1][0] if i + 1 < len(bounds) else len(text)
        blob = re.sub(r"\s+", " ", text[pos:end]).strip()
        if num and "заличена" not in blob:
            active.append((ray, blob))
        else:
            gone += 1

    mon_addr = {norm_name(clean_addr(p["address"], True)): p
                for p in mon_places if p.get("address")}
    out, merged = [], []
    for ray, blob in active:
        lic = re.search(r"\b(2229\d{6})\b", blob)
        lic = lic.group(1) if lic else None
        m = re.search(r'[„"“]([^„"“]{2,60})[„"“]', blob)
        name = m.group(1).strip() if m else None
        if lic in SRZI_ADDR_OVERRIDES:
            addr = SRZI_ADDR_OVERRIDES[lic]
        else:
            a = re.search(
                r'гр\.\s*София,?\s*(.*?)(?=\s*[„"“][^„"“]{2,60}[„"“]\s*(?:ЕООД|ООД|АД|ЕТ)'
                r'|\s*Частна детска (?:градина|ясла)'
                r'|\s*[А-Я][\w\s\d.\-]{1,40}(?:ЕООД|ООД|АД|ЕТ)\b)', blob)
            addr = a.group(1).strip().rstrip(",") if a else None
        cap = re.search(r"(\d+\s+груп[аи](?:\s+(?:от|по)\s+[\d\s,и]+)?\s*деца)", blob)
        dates = re.findall(r"(\d{2}\.\d{2}\.\d{4})", blob)
        if not (name and addr and lic):
            print(f"  SRZI UNPARSED, skipped: {blob[:120]}")
            continue
        key = norm_name(clean_addr(addr, True))
        if key in mon_addr:
            host = mon_addr[key]
            extra = "Има и лицензирана от СРЗИ детска ясла на същия адрес."
            if extra not in (host.get("note") or ""):
                host["note"] = ((host.get("note") + " ") if host.get("note") else "") + extra
            if isinstance(host.get("ages"), list) and host["ages"][0] > 0:
                host["ages"][0] = 0
            merged.append(name)
            continue
        pid = f"chdya-{lic}"
        desc = "Частна детска ясла, лицензирана от Столична РЗИ"
        if cap:
            desc += f" — {cap.group(1)}"
        if dates:
            desc += f". Регистрирана на {dates[-1]} г."
        place = {
            "id": pid, "type": "private", "name": f"ЧДЯ „{name}“",
            "coords": None, "address": addr, "district": RAYON_SLUG.get(ray),
            "ages": [0, 3], "description": desc,
            "contacts": {"phone": None, "email": None, "facebook": None, "website": None},
        }
        prev = existing.get(pid)
        if prev and prev.get("coords"):
            place["coords"] = prev["coords"]
            if prev.get("approxLocation"):
                place["approxLocation"] = True
        if place["coords"] is None:
            place["coords"] = geocode(addr, cache)
        out.append(place)
    print(f"  SRZI: {len(active)} active rows, {gone} заличени skipped, "
          f"{len(merged)} merged into МОН entries: {merged}")
    return out


# ---------------------------------------------------------------- assemble

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mon-harvest", default="~/Downloads/ri-details5.json")
    ap.add_argument("--srzi-file-id", default=SRZI_DEFAULT_FILE_ID)
    ap.add_argument("--srzi-pdf", help="local PDF path instead of downloading")
    ap.add_argument("--re-geocode", action="store_true",
                    help="ignore existing coords and re-geocode everything")
    args = ap.parse_args()

    existing = {}
    if OUT.exists() and not args.re_geocode:
        existing = {p["id"]: p for p in json.loads(OUT.read_text())["places"]}
    cache = load_cache()
    # seed the cache from current data so known addresses never re-geocode
    for p in existing.values():
        if p.get("address") and p.get("coords") and p["address"] not in cache:
            cache[p["address"]] = p["coords"]

    print("municipal (ИСОДЗ + arcgis)…")
    municipal = build_municipal(cache, existing)
    print(f"  {len(municipal)} municipal")
    print("private (МОН harvest)…")
    mon = build_mon(args.mon_harvest, cache, existing)
    print(f"  {len(mon)} МОН private")
    print("nurseries (СРЗИ PDF)…")
    if args.srzi_pdf:
        pdf = Path(args.srzi_pdf).read_bytes()
    else:
        req = urllib.request.Request(SRZI_URL.format(file_id=args.srzi_file_id), headers=UA)
        pdf = urllib.request.urlopen(req, timeout=30).read()
    srzi = build_srzi(pdf, cache, existing, mon)

    # centroid fallback for anything still coordless
    from collections import defaultdict
    cent = defaultdict(list)
    for p in municipal:
        if p.get("coords") and p.get("district"):
            cent[p["district"]].append(p["coords"])
    centroid = {d: [round(sum(c[0] for c in v) / len(v), 5),
                    round(sum(c[1] for c in v) / len(v), 5)] for d, v in cent.items()}
    dropped = 0
    places = []
    for p in municipal + mon + srzi:
        if p["coords"] is None:
            if p.get("district") in centroid:
                p["coords"] = centroid[p["district"]]
                p["approxLocation"] = True
            else:
                print(f"  DROPPED (no coords, no district): {p['name']}")
                dropped += 1
                continue
        places.append(p)

    doc = {
        "version": 4,
        "updated": date.today().isoformat(),
        "attribution": ("Данни: Столична община/ИСОДЗ и arcgis.sofia.bg (общински), "
                        "МОН/НЕИСПУО (частни градини), Столична РЗИ чрез kg.sofia.bg "
                        "(частни ясли)."),
        "places": places,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
    save_cache(cache)
    types = {}
    for p in places:
        types[p["type"]] = types.get(p["type"], 0) + 1
    print(f"written {OUT.name}: {types}, dropped {dropped}")


if __name__ == "__main__":
    main()
