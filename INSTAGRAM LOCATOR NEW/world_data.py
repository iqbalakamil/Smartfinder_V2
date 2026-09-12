"""
God's Eye View-style live data layers for the 3D globe.

Keyless public sources only (no API key required):
  * OpenStreetMap via the Overpass API  -> key infrastructure + surveillance cameras
  * TfL JamCams (London)               -> live traffic camera catalog + image/video frames
  * USGS Earthquake Hazards Program     -> live seismicity
  * adsb.lol                           -> live ADS-B flights (OpenSky-style feed)

Every upstream response is cached in memory for a short TTL so realtime polling
from the browser does not hammer the public services.
"""

import time

import requests

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
TFL_JAMCAMS_URL = "https://api.tfl.gov.uk/Place/Type/JamCam"
USGS_HOUR_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson"
USGS_DAY_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
ADSB_URL = "https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{radius}"

HTTP_TIMEOUT = 45
OVERPASS_TIMEOUT = 25  # Overpass mirrors are quick to fail; don't block the globe for minutes

# Overpass rejects browser-like User-Agents (HTTP 406); a descriptive custom
# UA is both accepted and good etiquette for the public instance.
OVERPASS_HEADERS = {
    "User-Agent": "instagram-location-search-dashboard/1.0 (personal Overpass queries)"
}

_cache = {}


class DataError(Exception):
    """Raised when an upstream public data source cannot be reached."""


def _cached(key, ttl, loader):
    now = time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    payload = loader()
    _cache[key] = (now + ttl, payload)
    return payload


def _http_json(url, method="GET", timeout=HTTP_TIMEOUT, **kwargs):
    try:
        if method == "POST":
            resp = requests.post(url, timeout=timeout, **kwargs)
        else:
            resp = requests.get(url, timeout=timeout, **kwargs)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        raise DataError(f"Could not reach {url}: {e}") from e
    except ValueError as e:
        raise DataError(f"Unexpected response from {url}") from e


def _overpass(ql):
    """Query the Overpass API, falling through several public mirrors."""
    errors = []
    for i, url in enumerate(OVERPASS_URLS):
        try:
            data = _http_json(
                url, method="POST", data={"data": ql},
                timeout=OVERPASS_TIMEOUT, headers=OVERPASS_HEADERS,
            )
            return data.get("elements", [])
        except DataError as e:
            errors.append(f"{url}: {e}")
            if i < len(OVERPASS_URLS) - 1:
                time.sleep(1.5)  # give rate limits a moment to reset
    raise DataError("Overpass API unavailable. " + " | ".join(errors))


def _element_point(el):
    """Return (lat, lng) for a node or for the center of a way/relation."""
    if "lat" in el and "lon" in el:
        return float(el["lat"]), float(el["lon"])
    center = el.get("center")
    if center and "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None


def _element_name(tags, fallback):
    for key in ("name", "official_name", "brand", "operator"):
        if tags.get(key):
            return tags[key]
    return fallback


def _address(tags):
    parts = []
    if tags.get("addr:housenumber"):
        parts.append(tags["addr:housenumber"])
    if tags.get("addr:street"):
        parts.append(tags["addr:street"])
    if tags.get("addr:city"):
        parts.append(tags["addr:city"])
    return ", ".join(parts)


# ---------------------------------------------------------------------------
# Infrastructure (OpenStreetMap / Overpass)
# ---------------------------------------------------------------------------

INFRA_LABELS = {
    "hospital": "Hospital",
    "clinic": "Clinic",
    "police": "Police",
    "fire_station": "Fire station",
    "school": "School",
    "university": "University",
    "government": "Government",
    "power": "Power plant",
    "substation": "Substation",
    "water": "Water tower",
    "tower": "Comms tower",
    "aerodrome": "Aerodrome / Heliport",
    "railway": "Railway station",
    "transport": "Transport hub",
    "military": "Military site",
    "other": "Other",
}


def _infra_ql(lat, lng, radius_m):
    clauses = [
        'nwr["amenity"="hospital"]',
        'nwr["amenity"="clinic"]',
        'nwr["amenity"="police"]',
        'nwr["amenity"="fire_station"]',
        'nwr["amenity"="school"]',
        'nwr["amenity"="university"]',
        'nwr["amenity"="government"]',
        'nwr["power"="plant"]',
        'nwr["power"="substation"]',
        'nwr["man_made"="water_tower"]',
        'nwr["man_made"="communications_tower"]',
        'nwr["aeroway"="aerodrome"]',
        'nwr["aeroway"="heliport"]',
        'nwr["railway"="station"]',
        'nwr["military"~"."]',
        'nwr["landuse"="military"]',
    ]
    body = "\n".join(f"  {c}(around:{radius_m},{lat},{lng});" for c in clauses)
    return f"[out:json][timeout:30];\n(\n{body}\n);\nout center tags;"


def _infra_category(tags):
    if tags.get("military") or tags.get("landuse") == "military":
        return "military"
    amenity = tags.get("amenity")
    if amenity == "hospital" or tags.get("healthcare") == "hospital":
        return "hospital"
    if amenity == "clinic":
        return "clinic"
    if amenity == "police":
        return "police"
    if amenity == "fire_station":
        return "fire_station"
    if amenity in ("school", "kindergarten", "college"):
        return "school"
    if amenity == "university":
        return "university"
    if amenity in ("government", "embassy", "townhall"):
        return "government"
    if amenity in ("ferry_terminal", "bus_station"):
        return "transport"
    if tags.get("power") == "plant":
        return "power"
    if tags.get("power") == "substation":
        return "substation"
    if tags.get("man_made") == "water_tower":
        return "water"
    if tags.get("man_made") == "communications_tower":
        return "tower"
    if tags.get("aeroway") in ("aerodrome", "heliport"):
        return "aerodrome"
    if tags.get("railway") == "station":
        return "railway"
    return "other"


def get_infrastructure(lat, lng, radius_km=10.0):
    """Key infrastructure around (lat, lng), sourced from OpenStreetMap."""
    radius_km = min(max(float(radius_km), 1.0), 50.0)
    radius_m = int(radius_km * 1000)
    cache_key = f"infra-{round(float(lat), 2)}-{round(float(lng), 2)}-{int(radius_km)}"

    def load():
        elements = _overpass(_infra_ql(float(lat), float(lng), radius_m))
        seen, out = set(), []
        for el in elements:
            tags = el.get("tags") or {}
            pt = _element_point(el)
            if not pt:
                continue
            category = _infra_category(tags)
            if category == "other":
                continue
            key = (category, round(pt[0], 4), round(pt[1], 4))
            if key in seen:
                continue
            seen.add(key)
            out.append({
                "id": f"infra-{el['type']}-{el['id']}",
                "category": category,
                "name": _element_name(tags, INFRA_LABELS.get(category, category)),
                "operator": tags.get("operator") or "",
                "address": _address(tags),
                "lat": pt[0],
                "lng": pt[1],
            })
        out.sort(key=lambda x: (x["category"], x["name"]))
        return out

    return _cached(cache_key, 600, load)


# ---------------------------------------------------------------------------
# Traffic cameras (OSM worldwide + TfL London)
# ---------------------------------------------------------------------------

def _cam_ql(lat, lng, radius_m):
    return (
        f"[out:json][timeout:30];\n(\n"
        f'  nwr["man_made"="surveillance"]["surveillance:type"~"camera|traffic"](around:{radius_m},{lat},{lng});\n'
        f'  nwr["man_made"="surveillance"]["surveillance"~"camera|traffic"](around:{radius_m},{lat},{lng});\n'
        f");\nout center tags;"
    )


def get_traffic_cameras_osm(lat, lng, radius_km=10.0):
    """Surveillance / traffic cameras near (lat, lng) from OpenStreetMap."""
    radius_km = min(max(float(radius_km), 1.0), 50.0)
    radius_m = int(radius_km * 1000)
    cache_key = f"cams-osm-{round(float(lat), 2)}-{round(float(lng), 2)}-{int(radius_km)}"

    def load():
        elements = _overpass(_cam_ql(float(lat), float(lng), radius_m))
        out = []
        for el in elements:
            tags = el.get("tags") or {}
            pt = _element_point(el)
            if not pt:
                continue

            raw_url = (
                tags.get("url")
                or tags.get("website")
                or tags.get("contact:website")
                or tags.get("url:stream")
                or tags.get("stream")
                or ""
            )
            raw_url_lower = raw_url.lower()
            img_url = (
                tags.get("image")
                or tags.get("camera:image")
                or (raw_url if any(ext in raw_url_lower for ext in [".jpg", ".jpeg", ".png", ".webp"]) else "")
            )
            video_url = (
                tags.get("url:stream")
                or tags.get("stream")
                or (raw_url if any(ext in raw_url_lower for ext in [".m3u8", ".mp4", "stream", "live"]) else "")
            )

            out.append({
                "id": f"cam-osm-{el['type']}-{el['id']}",
                "source": "osm",
                "name": _element_name(tags, "Traffic / surveillance camera"),
                "operator": tags.get("operator") or "",
                "direction": tags.get("surveillance:direction") or tags.get("camera:direction") or "",
                "camera_type": tags.get("surveillance:type") or tags.get("surveillance") or "",
                "url": raw_url,
                "imageUrl": img_url,
                "videoUrl": video_url,
                "ref": tags.get("ref") or "",
                "lat": pt[0],
                "lng": pt[1],
            })
        return out

    return _cached(cache_key, 600, load)


def get_tfl_jamcams():
    """London TfL JamCams catalog (keyless) with live image/video frame URLs."""
    data = _cached("tfl-jamcams", 600, lambda: _http_json(TFL_JAMCAMS_URL))
    out = []
    for cam in data or []:
        lat, lon = cam.get("lat"), cam.get("lon")
        if lat is None or lon is None:
            continue
        props = {p.get("key"): p.get("value") for p in cam.get("additionalProperties", [])}
        if str(props.get("available", "true")).lower() != "true":
            continue
        out.append({
            "id": f"cam-tfl-{cam.get('id', '')}",
            "source": "tfl",
            "name": cam.get("commonName") or "London traffic camera",
            "lat": float(lat),
            "lng": float(lon),
            "view": props.get("view") or "",
            "imageUrl": props.get("imageUrl") or "",
            "videoUrl": props.get("videoUrl") or "",
        })
    return out


# ---------------------------------------------------------------------------
# Live traffic simulation roads (OpenStreetMap, Indonesia only)
# ---------------------------------------------------------------------------

# Rough bounding box covering all of Indonesia (incl. Papua & Sulawesi).
INDONESIA_BBOX = {"min_lat": -11.0, "max_lat": 6.5, "min_lng": 95.0, "max_lng": 141.5}

ROAD_CLASSES = (
    "motorway|motorway_link|trunk|trunk_link|primary|primary_link|"
    "secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|service"
)

# Higher priority roads are kept first when the network is capped.
ROAD_CLASS_ORDER = {
    "motorway": 0, "motorway_link": 1, "trunk": 2, "trunk_link": 3,
    "primary": 4, "primary_link": 5, "secondary": 6, "secondary_link": 7,
    "tertiary": 8, "tertiary_link": 9, "unclassified": 10, "residential": 11, "service": 12,
}

MAX_ROADS = 2500        # keep the payload sane for dense cities
ROAD_MIN_STEP_M = 12.0  # geometry simplification step


def in_indonesia(lat, lng):
    """True when (lat, lng) falls inside the Indonesian bounding box."""
    return (
        INDONESIA_BBOX["min_lat"] <= lat <= INDONESIA_BBOX["max_lat"]
        and INDONESIA_BBOX["min_lng"] <= lng <= INDONESIA_BBOX["max_lng"]
    )


def _roads_ql(lat, lng, radius_m):
    return (
        f"[out:json][timeout:30];\n"
        f'way["highway"~"^({ROAD_CLASSES})$"](around:{radius_m},{lat},{lng});\n'
        f"out geom tags;"
    )


def get_roads(lat, lng, radius_km=8.0):
    """Drivable road network (way geometry) around (lat, lng) for the traffic simulation.
    Roads barely change, so results are cached for 6 hours."""
    radius_km = min(max(float(radius_km), 3.0), 15.0)
    radius_m = int(radius_km * 1000)
    cache_key = f"roads-{round(float(lat), 3)}-{round(float(lng), 3)}-{int(radius_km)}"

    def load():
        elements = _overpass(_roads_ql(float(lat), float(lng), radius_m))
        ranked = []
        for el in elements:
            tags = el.get("tags") or {}
            pts = [
                (float(p["lat"]), float(p["lon"]))
                for p in el.get("geometry") or []
                if "lat" in p and "lon" in p
            ]
            pts = _simplify_pts(pts, ROAD_MIN_STEP_M)
            if len(pts) < 2:
                continue
            highway = tags.get("highway", "")
            ranked.append((
                ROAD_CLASS_ORDER.get(highway, 99),
                -len(pts),  # longer ways first within a class
                {
                    "id": f"road-{el['type']}-{el['id']}",
                    "highway": highway,
                    "name": tags.get("name", ""),
                    "maxspeed": tags.get("maxspeed", ""),
                    "geometry": pts,
                },
            ))
        ranked.sort(key=lambda x: (x[0], x[1]))

        # Cap the network: keep the top 60% outright, then evenly sample the rest
        # so minor roads are still represented in dense cities.
        if len(ranked) > MAX_ROADS:
            head = ranked[: int(MAX_ROADS * 0.6)]
            tail = ranked[int(MAX_ROADS * 0.6):]
            step = max(1, len(tail) // max(1, MAX_ROADS - len(head)))
            ranked = head + tail[::step]
            ranked.sort(key=lambda x: x[0])
        return [item for _, _, item in ranked]

    return _cached(cache_key, 21600, load)


def _simplify_pts(pts, min_step_m):
    """Drop points closer than min_step_m to the previous kept point."""
    if len(pts) <= 2:
        return pts
    kept = [pts[0]]
    for p in pts[1:]:
        if _haversine_m(kept[-1][0], kept[-1][1], p[0], p[1]) >= min_step_m:
            kept.append(p)
    if kept[-1] != pts[-1]:
        kept.append(pts[-1])
    return kept


def _haversine_m(lat1, lng1, lat2, lng2):
    import math
    r = 6371000.0
    to_rad = math.pi / 180.0
    d_lat = (lat2 - lat1) * to_rad
    d_lng = (lng2 - lng1) * to_rad
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1 * to_rad) * math.cos(lat2 * to_rad) * math.sin(d_lng / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Live earthquakes (USGS)
# ---------------------------------------------------------------------------

def get_earthquakes(hours=24):
    """Recent earthquakes. hours <= 3 uses the last-hour feed, otherwise the last day."""
    try:
        hours = float(hours)
    except (TypeError, ValueError):
        hours = 24
    if hours <= 3:
        url, key = USGS_HOUR_URL, "usgs-hour"
    else:
        url, key = USGS_DAY_URL, "usgs-day"

    data = _cached(key, 300, lambda: _http_json(url))
    out = []
    for feat in (data or {}).get("features", []):
        props = feat.get("properties", {})
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        mag = props.get("mag")
        if mag is None or len(coords) < 3:
            continue
        depth = coords[2]
        out.append({
            "id": feat.get("id") or f"quake-{len(out)}",
            "mag": float(mag),
            "place": props.get("place") or "Unknown location",
            "time": props.get("time"),
            "depth": float(depth) if depth is not None else 0.0,
            "lat": float(coords[1]),
            "lng": float(coords[0]),
            "url": props.get("url") or "",
        })
    out.sort(key=lambda x: x["mag"], reverse=True)
    return out


# ---------------------------------------------------------------------------
# Live flights (adsb.lol - OpenSky-style, keyless)
# ---------------------------------------------------------------------------

def get_flights(lat, lng, radius_km=100.0):
    """Live ADS-B aircraft within radius_km of (lat, lng)."""
    radius_km = min(max(float(radius_km), 10.0), 300.0)
    url = ADSB_URL.format(lat=float(lat), lon=float(lng), radius=int(radius_km))
    key = f"adsb-{round(float(lat), 2)}-{round(float(lng), 2)}-{int(radius_km)}"

    def load():
        data = _http_json(url)
        out = []
        for ac in data.get("ac") or []:
            if ac.get("lat") is None or ac.get("lon") is None:
                continue
            alt = ac.get("alt_baro")
            if alt is None:
                alt = ac.get("alt_geom")
            out.append({
                "hex": ac.get("hex") or "",
                "callsign": (ac.get("flight") or "").strip(),
                "registration": ac.get("r") or "",
                "type": ac.get("t") or "",
                "alt": alt,
                "gs": ac.get("gs"),
                "track": ac.get("track"),
                "vrate": ac.get("baro_rate"),
                "lat": float(ac["lat"]),
                "lng": float(ac["lon"]),
                "category": ac.get("category") or "",
            })
        return out

    return _cached(key, 25, load)