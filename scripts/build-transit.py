#!/usr/bin/env python3
"""Rebuild site/data/transit.json from the official Sofia GTFS feed.

Feed: https://gtfs.sofiatraffic.bg/api/v1/static (ЦГМ, CC-BY 4.0, refreshed
daily; includes bus, tram, trolleybus and metro). Emits a compact index:
{"routes": [[short_name, type], ...],
 "stops": [[lng, lat, name, [route_index, ...]], ...]}
Only stops that are actually served (appear in stop_times) are kept.

Usage: python3 scripts/build-transit.py [path/to/gtfs.zip]
Without an argument, downloads the current feed to a temp file first.
"""
import csv
import io
import json
import sys
import tempfile
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

FEED_URL = "https://gtfs.sofiatraffic.bg/api/v1/static"
OUT = Path(__file__).resolve().parent.parent / "site" / "data" / "transit.json"
TYPE_MAP = {"0": "tram", "1": "metro", "3": "bus", "11": "trolley", "800": "trolley"}


def fetch_feed() -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    print(f"downloading {FEED_URL} …")
    with urllib.request.urlopen(FEED_URL, timeout=120) as r:
        while chunk := r.read(1 << 20):
            tmp.write(chunk)
    tmp.close()
    return tmp.name


def main() -> None:
    zip_path = sys.argv[1] if len(sys.argv) > 1 else fetch_feed()
    zf = zipfile.ZipFile(zip_path)

    def rows(name):
        with zf.open(name) as f:
            yield from csv.DictReader(io.TextIOWrapper(f, "utf-8-sig"))

    routes = {}
    for r in rows("routes.txt"):
        rtype = TYPE_MAP.get(r["route_type"].strip(), "bus")
        name = r["route_short_name"].strip() or r["route_long_name"].strip()
        routes[r["route_id"]] = (name, rtype)

    trip2route = {r["trip_id"]: r["route_id"] for r in rows("trips.txt")}

    stop_routes = defaultdict(set)
    for r in rows("stop_times.txt"):
        rid = trip2route.get(r["trip_id"])
        if rid:
            stop_routes[r["stop_id"]].add(rid)

    route_list, route_idx = [], {}

    def idx_of(rid):
        key = routes[rid]
        if key not in route_idx:
            route_idx[key] = len(route_list)
            route_list.append([key[0], key[1]])
        return route_idx[key]

    stops_out = []
    for s in rows("stops.txt"):
        sid = s["stop_id"]
        if sid not in stop_routes:
            continue
        try:
            lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
        except ValueError:
            continue
        lines = sorted({idx_of(r) for r in stop_routes[sid]})
        stops_out.append([round(lon, 5), round(lat, 5), s["stop_name"].strip(), lines])

    doc = {
        "updated": date.today().isoformat(),
        "attribution": "Транспортни данни: Център за градска мобилност (gtfs.sofiatraffic.bg), CC-BY 4.0",
        "routes": route_list,
        "stops": stops_out,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"{OUT}: {len(route_list)} routes, {len(stops_out)} served stops")


if __name__ == "__main__":
    main()
