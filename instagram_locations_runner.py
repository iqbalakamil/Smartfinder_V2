#!/usr/bin/env python3
"""
Run Instagram location search using the standalone Instagram Locator module.

This keeps the runtime behavior aligned with the working folder version.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

# Fix UnicodeEncodeError di Windows: stdout default-nya cp1252 yang tidak bisa
# encode karakter Unicode di luar BMP (emoji, simbol Greek, dll).
# Reconfigure stdout ke UTF-8 agar json.dumps dengan ensure_ascii=False aman.
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")


def _load_locator_module():
    root = Path(__file__).resolve().parent
    locator_dir = root / "INSTAGRAM LOCATOR"
    sys.path.insert(0, str(locator_dir))
    from instagram_api import get_fuzzy_locations, get_grid_locations, get_instagram_locations, make_geojson

    return get_fuzzy_locations, get_grid_locations, get_instagram_locations, make_geojson


def _dedupe_items(items):
    seen = set()
    unique = []
    for item in items:
      if not isinstance(item, dict):
        continue
      key = item.get("external_id") or item.get("url") or (item.get("name"), item.get("lat"), item.get("lng"))
      key = json.dumps(key, default=str, ensure_ascii=False)
      if key in seen:
        continue
      seen.add(key)
      unique.append(item)
    return unique


def _format_item(item):
    if not isinstance(item, dict):
        return None
    formatted = dict(item)
    external_id = formatted.get("external_id") or formatted.get("id")
    if external_id is not None:
        formatted["external_id"] = external_id
        formatted.setdefault("url", f"https://www.instagram.com/explore/locations/{external_id}/")
    if "name" not in formatted:
        formatted["name"] = "Instagram Location"
    if "address" not in formatted:
        formatted["address"] = "Instagram Location POI"
    return formatted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lng", type=float, required=True)
    parser.add_argument("--cookie", required=True)
    parser.add_argument("--mode", choices=("normal", "fuzzy", "grid"), default="normal")
    parser.add_argument("--radius-km", type=float, default=1.0)
    parser.add_argument("--step-m", type=float, default=200.0)
    args = parser.parse_args()

    get_fuzzy_locations, get_grid_locations, get_instagram_locations, make_geojson = _load_locator_module()

    if args.mode == "fuzzy":
        raw_items = get_fuzzy_locations(args.lat, args.lng, args.cookie, sigma=2)
    elif args.mode == "grid":
        raw_items = get_grid_locations(args.lat, args.lng, args.cookie, radius_km=args.radius_km, step_m=args.step_m)
    else:
        raw_items = get_instagram_locations(args.lat, args.lng, args.cookie)

    items = [_format_item(item) for item in raw_items]
    items = [item for item in _dedupe_items(items) if item is not None]

    payload = {
        "success": True,
        "mode": args.mode,
        "total": len(items),
        "rawTotal": len(raw_items),
        "items": items,
        "geojson": make_geojson(items),
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
