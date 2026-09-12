"""
Instagram Location Search Dashboard
Flask-based web interface for searching Instagram locations.
"""

import csv
import io
import json
import os
from datetime import datetime

from flask import (
    Flask,
    Response,
    jsonify,
    redirect,
    render_template,
    request,
    url_for,
)
from instagram_api import get_fuzzy_locations, get_grid_locations, get_insta_cookies, make_geojson, open_url_in_browser

app = Flask(__name__)
app.secret_key = os.urandom(24)

# Store last search results in memory (for export)
last_results = {"locations": [], "lat": 0, "lng": 0}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/search", methods=["POST"])
def search():
    """Search for Instagram locations near a lat/lng."""
    data = request.get_json()

    cookie = data.get("cookie", "")
    lat = data.get("lat")
    lng = data.get("lng")
    more = data.get("more", False)

    if not cookie:
        return jsonify({"error": "Cookie is required. Please enter your Instagram cookie."}), 400

    if lat is None or lng is None:
        return jsonify({"error": "Latitude and longitude are required."}), 400

    try:
        lat = float(lat)
        lng = float(lng)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid latitude or longitude value."}), 400

    # Get locations based on search mode
    search_mode = data.get("search_mode", "normal")

    if search_mode == "grid":
        # Grid search for residential areas (perumahan)
        radius_km = data.get("radius_km", 1.0)
        step_m = data.get("step_m", 200)
        locations = get_grid_locations(lat, lng, cookie, radius_km=radius_km, step_m=step_m)
    elif more:
        # Fuzzy search (more results)
        locations = get_fuzzy_locations(lat, lng, cookie, sigma=2)
    else:
        # Normal search
        locations = get_fuzzy_locations(lat, lng, cookie, sigma=0)

    if not locations:
        return jsonify({
            "locations": [],
            "geojson": {"type": "FeatureCollection", "features": []},
            "count": 0,
            "message": "No locations found. Check your cookie or try different coordinates.",
        })

    # Add URLs
    for loc in locations:
        loc["url"] = f"https://www.instagram.com/explore/locations/{loc['external_id']}"

    geojson = make_geojson(locations)

    # Store for export
    last_results["locations"] = locations
    last_results["lat"] = lat
    last_results["lng"] = lng

    return jsonify({
        "locations": locations,
        "geojson": geojson,
        "count": len(locations),
    })


@app.route("/get-cookies", methods=["POST"])
def get_cookies():
    """Try to get cookies via Selenium browser automation."""
    cookie = get_insta_cookies()
    if cookie:
        return jsonify({"cookie": cookie})
    else:
        return jsonify({"error": "Failed to get cookies. Make sure Chrome and Selenium are installed."}), 500


@app.route("/open-url", methods=["POST"])
def open_url():
    """Open a URL in the Selenium Chrome browser that has the Instagram session."""
    data = request.get_json()
    url = data.get("url", "")

    if not url:
        return jsonify({"error": "URL is required."}), 400

    success = open_url_in_browser(url)
    if success:
        return jsonify({"message": "Opened in browser.", "success": True})
    else:
        return jsonify({
            "error": "Browser is not open or session was lost. Please click 'Auto-get Cookie via Browser' again to reopen Chrome and log in.",
            "success": False
        }), 400


@app.route("/export/<format_type>")
def export(format_type):
    """Export results in various formats."""
    locations = last_results.get("locations", [])

    if not locations:
        return jsonify({"error": "No data to export. Run a search first."}), 400

    if format_type == "json":
        return Response(
            json.dumps(locations, indent=2),
            mimetype="application/json",
            headers={"Content-Disposition": "attachment; filename=locations.json"},
        )

    elif format_type == "geojson":
        geojson = make_geojson(locations)
        return Response(
            json.dumps(geojson, indent=2),
            mimetype="application/geo+json",
            headers={"Content-Disposition": "attachment; filename=locations.geojson"},
        )

    elif format_type == "csv":
        output = io.StringIO()
        fieldnames = ["name", "external_id", "external_id_source", "lat", "lng", "address", "minimum_age", "url"]
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for loc in locations:
            writer.writerow(loc)

        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=locations.csv"},
        )

    elif format_type == "ids":
        ids = "\n".join(str(loc["external_id"]) for loc in locations)
        return Response(
            ids,
            mimetype="text/plain",
            headers={"Content-Disposition": "attachment; filename=location_ids.txt"},
        )

    elif format_type == "map":
        # Generate Leaflet map HTML
        lat = last_results.get("lat", 0)
        lng = last_results.get("lng", 0)
        geojson = make_geojson(locations)

        coords = f'[{lat}, {lng}]'

        map_html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Instagram Locations Map</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        html, body {{ height: 100%; margin: 0; }}
        #map {{ width: 100%; height: 100%; }}
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        var map = L.map('map').setView({coords}, 14);
        L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
            maxZoom: 18,
            attribution: '&copy; OpenStreetMap contributors'
        }}).addTo(map);

        var locs = {json.dumps(geojson)};
        L.geoJSON(locs, {{
            onEachFeature: function(feature, layer) {{
                var props = feature.properties;
                var popup = '<b>' + props.name + '</b><br>' +
                    (props.address || 'No address') + '<br>' +
                    '<a href="https://www.instagram.com/explore/locations/' + props.external_id + '" target="_blank">View on Instagram</a>';
                layer.bindPopup(popup);
            }}
        }}).addTo(map);

        L.marker({coords}).addTo(map);
    </script>
</body>
</html>"""
        return Response(map_html, mimetype="text/html")

    return jsonify({"error": "Unknown format"}), 400


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
