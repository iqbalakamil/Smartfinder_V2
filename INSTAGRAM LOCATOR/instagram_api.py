"""
Instagram Location Search API Wrapper
Based on bellingcat/instagram-location-search
"""

import json
import time
from concurrent.futures import ThreadPoolExecutor
from itertools import product
from statistics import pstdev
from time import sleep
from urllib.parse import urlencode

import requests


def _parse_cookie(cookie):
    parsed = {}
    for part in str(cookie or "").split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        key, value = part.split("=", 1)
        parsed[key.strip()] = value.strip()
    return parsed


def _collect_location_candidates(payload, depth=0, seen=None, results=None):
    if seen is None:
        seen = set()
    if results is None:
        results = []
    if payload is None or depth > 5:
        return results

    if isinstance(payload, list):
        for item in payload:
            _collect_location_candidates(item, depth + 1, seen, results)
        return results

    if not isinstance(payload, dict):
        return results

    is_candidate = any(
        key in payload and payload.get(key) is not None
        for key in ("name", "lat", "lng", "external_id", "id", "pk")
    )
    if is_candidate:
        key = str(
            payload.get("external_id")
            or payload.get("id")
            or payload.get("pk")
            or f"{payload.get('name', '')}|{payload.get('lat', '')}|{payload.get('lng', '')}"
        )
        if key not in seen:
            seen.add(key)
            results.append(payload)

    for nested_key in (
        "venues",
        "locations",
        "items",
        "data",
        "results",
        "ranked_items",
        "ranked_results",
        "nodes",
        "section_list",
        "sections",
        "response",
    ):
        nested = payload.get(nested_key)
        if nested is not None:
            _collect_location_candidates(nested, depth + 1, seen, results)

    return results


def _extract_locations(payload):
    return _collect_location_candidates(payload)


def _format_location(venue):
    external_id = (
        venue.get("external_id")
        or venue.get("id")
        or venue.get("pk")
        or venue.get("location_id")
        or venue.get("locationId")
    )
    lat = venue.get("lat")
    lng = venue.get("lng")
    try:
        lat = float(lat) if lat is not None else None
    except (TypeError, ValueError):
        lat = None
    try:
        lng = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        lng = None

    return {
        "name": venue.get("name") or "Instagram Location",
        "lat": lat,
        "lng": lng,
        "url": f"https://www.instagram.com/explore/locations/{external_id}/" if external_id else "",
        "address": venue.get("address") or venue.get("location_address") or venue.get("subtitle") or "Instagram Location POI",
        "category": venue.get("category") or venue.get("category_name") or "social-media",
        "external_id": external_id,
        "external_id_source": venue.get("external_id_source") or venue.get("external_source") or "",
    }


def _request_locations(url, lat, lng, cookie):
    cookie_parts = _parse_cookie(cookie)
    params = {
        "latitude": lat,
        "longitude": lng,
        "rank_token": "",
        "timestamp": int(time.time() * 1000),
    }
    if cookie_parts.get("ds_user_id"):
        params["_uid"] = cookie_parts["ds_user_id"]
    if cookie_parts.get("csrftoken"):
        params["_csrftoken"] = cookie_parts["csrftoken"]
    if cookie_parts.get("mid"):
        params["_uuid"] = cookie_parts["mid"]

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": cookie,
        "X-Requested-With": "XMLHttpRequest",
        "X-IG-App-ID": "936619743392459",
        "X-CSRFToken": cookie_parts.get("csrftoken", ""),
    }

    query = urlencode(params)
    return requests.get(f"{url}?{query}", headers=headers, timeout=10.0)


def _build_grid_points(lat, lng, radius_km, step_m):
    import math

    points = []

    # Convert step from meters to degrees (approximate)
    step_lat = step_m / 111000.0
    cos_lat = math.cos(math.radians(lat))
    safe_cos = max(abs(cos_lat), 0.000001)
    step_lng = step_m / (111000.0 * safe_cos)

    radius_lat = radius_km / 111.0
    radius_lng = radius_km / (111.0 * safe_cos)

    d_lat = -radius_lat
    while d_lat <= radius_lat:
        d_lng = -radius_lng
        while d_lng <= radius_lng:
            dist = math.sqrt(d_lat ** 2 + d_lng ** 2)
            if dist <= radius_lat:
                points.append((lat + d_lat, lng + d_lng))
            d_lng += step_lng
        d_lat += step_lat

    return points


def _build_ring_points(lat, lng, radius_km, segments=12):
    import math

    points = []
    safe_radius = max(radius_km, 0.1)
    for index in range(segments):
        angle = (2 * math.pi * index) / segments
        d_lat = (safe_radius / 111.0) * math.cos(angle)
        safe_cos = max(abs(math.cos(math.radians(lat))), 0.000001)
        d_lng = (safe_radius / (111.0 * safe_cos)) * math.sin(angle)
        points.append((lat + d_lat, lng + d_lng))
    return points


def get_instagram_locations(lat, lng, cookie):
    """
    Get Instagram locations near a lat/lng using internal API.
    Requires session cookie for authentication.
    """
    endpoints = [
        "https://i.instagram.com/api/v1/location_search/",
        "https://www.instagram.com/api/v1/location_search/",
        "https://www.instagram.com/location_search/",
    ]

    for url in endpoints:
        try:
            response = _request_locations(url, lat, lng, cookie)
            response.raise_for_status()
        except requests.exceptions.ConnectionError as e:
            print(f"Connection failed for lat={lat}, lng={lng}: {e}")
            continue
        except requests.exceptions.Timeout:
            print("Connection timed out after 10.0s")
            continue
        except requests.exceptions.HTTPError as e:
            print(f"HTTP error: {e}")
            continue

        try:
            locations = response.json()
        except (json.JSONDecodeError, requests.exceptions.JSONDecodeError):
            print("Failed to parse JSON response. Check your cookie.")
            continue

        extracted = [_format_location(item) for item in _extract_locations(locations)]
        extracted = [item for item in extracted if item.get("name")]
        if extracted:
            return extracted

    return []


def get_fuzzy_locations(lat, lng, cookie, sigma=0):
    """
    Query Instagram API for several points around a central lat/lng
    to return additional results.
    """
    locs = get_instagram_locations(lat, lng, cookie)
    loc_ids = {v["external_id"] for v in locs if "external_id" in v}

    if not locs:
        return []

    # Calculate standard deviation for offset points
    lat_values = [v["lat"] for v in locs if "lat" in v]
    lng_values = [v["lng"] for v in locs if "lng" in v]

    std_lat = pstdev(lat_values) / 8.0 if len(lat_values) > 1 else 0.001
    std_lng = pstdev(lng_values) / 8.0 if len(lng_values) > 1 else 0.001

    # Generate offset points
    deltas = (
        (lat + d_lat * std_lat, lng + d_lng * std_lng)
        for d_lat, d_lng in filter(
            lambda x: any(x), product(range(-sigma, sigma + 1), repeat=2)
        )
    )

    # Fetch locations from all offset points in parallel
    with ThreadPoolExecutor() as executor:
        results = executor.map(
            lambda coords: get_instagram_locations(coords[0], coords[1], cookie),
            deltas,
        )

    for new_locs in results:
        for loc in new_locs:
            if "external_id" in loc and loc["external_id"] not in loc_ids:
                locs.append(loc)
                loc_ids.add(loc["external_id"])

    return locs


def get_grid_locations(lat, lng, cookie, radius_km=1.0, step_m=200):
    """
    Grid-based search for Instagram locations in a wider area.
    Useful for finding locations in residential areas (perumahan)
    that are spread across a neighborhood.
    
    Args:
        lat: Center latitude
        lng: Center longitude
        cookie: Instagram session cookie
        radius_km: Search radius in kilometers (default 1km)
        step_m: Grid step size in meters (default 200m)
    """
    locs = []
    loc_ids = set()

    def fetch_points(points):
        if not points:
            return
        with ThreadPoolExecutor(max_workers=10) as executor:
            results = executor.map(
                lambda coords: get_instagram_locations(coords[0], coords[1], cookie),
                points,
            )

        for new_locs in results:
            for loc in new_locs:
                if "external_id" in loc and loc["external_id"] not in loc_ids:
                    locs.append(loc)
                    loc_ids.add(loc["external_id"])

    grid_points = _build_grid_points(lat, lng, radius_km, step_m)
    print(f"Grid search: {len(grid_points)} points in {radius_km}km radius")
    fetch_points(grid_points)

    # Residential areas often need a wider and denser sweep than the main grid.
    if len(locs) < 60 and step_m > 40:
      extra_radius = min(radius_km * 1.6, 6.0)
      extra_step = max(step_m / 2.5, 60)
      extra_points = _build_grid_points(lat, lng, extra_radius, extra_step)
      print(f"Grid search dense pass: {len(extra_points)} points in {extra_radius}km radius with {extra_step}m step")
      fetch_points(extra_points)

    if len(locs) < 120 and step_m > 25:
      ring_points = []
      ring_points.extend(_build_ring_points(lat, lng, radius_km * 0.85, 12))
      ring_points.extend(_build_ring_points(lat, lng, radius_km * 1.15, 12))
      ring_points.extend(_build_ring_points(lat, lng, radius_km * 1.45, 16))
      print(f"Grid search ring pass: {len(ring_points)} points")
      fetch_points(ring_points)

    if len(locs) < 180 and step_m > 25:
      ultra_radius = min(radius_km * 2.2, 7.5)
      ultra_step = max(step_m / 3.5, 35)
      ultra_points = _build_grid_points(lat, lng, ultra_radius, ultra_step)
      print(f"Grid search ultra-dense pass: {len(ultra_points)} points in {ultra_radius}km radius with {ultra_step}m step")
      fetch_points(ultra_points)

    print(f"Grid search found {len(locs)} unique locations")
    return locs


def make_geojson(locations):
    """Convert list of Instagram locations to GeoJSON format."""
    features = []
    for loc in locations:
        if "lng" in loc and "lat" in loc:
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [loc["lng"], loc["lat"]],
                },
                "properties": loc,
            }
            features.append(feature)
    return {"type": "FeatureCollection", "features": features}


# Keep Selenium driver alive so we can reuse it for opening URLs
_selenium_driver = None


def _kill_stale_chrome(profile_dir):
    """
    Kill any Chrome processes using the same user-data-dir profile.
    This prevents 'session not created' crashes when the profile
    is still locked by a previous Chrome instance.
    """
    import subprocess
    import os
    try:
        # On Windows, find and kill chrome.exe processes using this profile
        profile_path = os.path.expanduser(profile_dir)
        # Normalize path for Windows
        profile_path = os.path.normpath(profile_path)

        # Use WMIC on Windows to find Chrome processes with this profile
        result = subprocess.run(
            ['wmic', 'process', 'where',
             f"name='chrome.exe' and commandline like '%{profile_path}%'",
             'get', 'processid'],
            capture_output=True, text=True, timeout=5
        )
        pids = []
        for line in result.stdout.strip().split('\n'):
            line = line.strip()
            if line.isdigit():
                pids.append(int(line))

        for pid in pids:
            try:
                subprocess.run(['taskkill', '/F', '/PID', str(pid)],
                             capture_output=True, timeout=5)
                print(f"Killed stale Chrome process PID {pid}")
            except Exception:
                pass

        if pids:
            sleep(2)  # Wait for process to fully die and release the profile lock
    except Exception as e:
        print(f"Warning: Could not kill stale Chrome processes: {e}")


def get_insta_cookies():
    """
    Attempt to get cookies via Selenium browser automation.
    Opens Chrome and waits for login. Keeps the browser open
    so we can later open Instagram links in the same session.
    Returns cookies formatted as name=value;name=value;...
    """
    global _selenium_driver
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.service import Service
        from selenium.common.exceptions import WebDriverException, InvalidSessionIdException
        import os

        profile_dir = r"~/.instagram-location-search/chrome-data/"

        # If there's an existing driver, check if it's still alive
        if _selenium_driver is not None:
            if _is_browser_alive(_selenium_driver):
                # Browser still open, try to reuse it
                try:
                    _selenium_driver.get("https://www.instagram.com/")
                    cookies = _selenium_driver.get_cookies()
                    if any(c.get("name") == "sessionid" for c in cookies):
                        print("Reusing existing browser session.")
                        return "; ".join(f"{c['name']}={c['value']}" for c in cookies)
                except Exception:
                    pass
            # Stale or no session, clean up
            try:
                _selenium_driver.quit()
            except Exception:
                pass
            _selenium_driver = None

        # Kill any leftover Chrome processes using this profile
        _kill_stale_chrome(profile_dir)

        options = webdriver.ChromeOptions()
        options.add_argument(
            r"--user-data-dir=" + os.path.expanduser(profile_dir)
        )
        options.add_argument(r"--profile-directory=instagram-location-profile")
        options.add_experimental_option("detach", True)  # Don't close Chrome when script ends

        service = Service()
        _selenium_driver = webdriver.Chrome(options=options, service=service)
        _selenium_driver.get("https://www.instagram.com/")
        print("Chrome opened. Please log in to Instagram...")

        # Wait for login
        max_wait = 300  # 5 minutes max
        waited = 0
        while waited < max_wait:
            # Check if browser was closed by user
            if not _is_browser_alive(_selenium_driver):
                print("Browser was closed by user.")
                _selenium_driver = None
                return None

            try:
                cookies = _selenium_driver.get_cookies()
                if any(c.get("name") == "sessionid" for c in cookies):
                    print("Login detected! Returning cookies.")
                    return "; ".join(f"{c['name']}={c['value']}" for c in cookies)
            except (InvalidSessionIdException, WebDriverException):
                print("Browser session lost.")
                _selenium_driver = None
                return None

            sleep(1)
            waited += 1

        # Timeout - close browser
        print("Login timeout (5 minutes). Closing browser.")
        try:
            _selenium_driver.quit()
        except Exception:
            pass
        _selenium_driver = None
        return None

    except ImportError:
        print("Selenium not installed. Please install: pip install selenium webdriver-manager")
        return None
    except Exception as e:
        print(f"Failed to get cookies via browser: {e}")
        return None


def _is_browser_alive(driver):
    """Check if the Selenium browser session is still alive."""
    if driver is None:
        return False
    try:
        # Access a property that fails if the session is gone
        _ = driver.title
        return True
    except Exception:
        return False


def open_url_in_browser(url):
    """
    Open a URL in the existing Selenium Chrome browser.
    Returns True if successful, False otherwise.
    """
    global _selenium_driver
    if _selenium_driver is None:
        return False

    # Check if browser is still alive before using it
    if not _is_browser_alive(_selenium_driver):
        print("Browser was closed. Cleaning up stale driver reference.")
        try:
            _selenium_driver.quit()
        except Exception:
            pass
        _selenium_driver = None
        return False

    try:
        _selenium_driver.get(url)
        return True
    except Exception as e:
        print(f"Failed to open URL in browser: {e}")
        # Clean up stale driver so next call knows browser is gone
        try:
            _selenium_driver.quit()
        except Exception:
            pass
        _selenium_driver = None
        return False


def close_browser():
    """
    Close the Selenium Chrome browser.
    """
    global _selenium_driver
    if _selenium_driver is not None:
        try:
            _selenium_driver.quit()
        except Exception:
            pass
        _selenium_driver = None
