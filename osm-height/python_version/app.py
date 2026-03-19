#!/usr/bin/env python3
"""
OSM Building Height Enrichment — Web Interface

A simple Flask server that serves a MapLibre map where users can draw a
rectangle to select an area, then runs the height enrichment pipeline
with real-time progress streaming via Server-Sent Events (SSE).

Usage:
    pip install flask
    python app.py
    # Open http://localhost:5000
"""

import json
import logging
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path

from flask import Flask, Response, jsonify, render_template, request, send_file

app = Flask(__name__)
log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Global state for the running pipeline
pipeline_state = {
    "running": False,
    "queue": queue.Queue(),
    "result": None,
}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/run", methods=["POST"])
def run_pipeline():
    """Start the pipeline in a background thread."""
    if pipeline_state["running"]:
        return jsonify({"error": "Pipeline already running"}), 409

    data = request.json
    bbox = data.get("bbox")
    if not bbox:
        return jsonify({"error": "Missing bbox"}), 400

    pipeline_state["running"] = True
    pipeline_state["result"] = None
    # Clear the queue
    while not pipeline_state["queue"].empty():
        try:
            pipeline_state["queue"].get_nowait()
        except queue.Empty:
            break

    thread = threading.Thread(target=_run_pipeline, args=(bbox,), daemon=True)
    thread.start()

    return jsonify({"status": "started"})


@app.route("/progress")
def progress():
    """SSE endpoint for real-time progress."""
    def stream():
        q = pipeline_state["queue"]
        while True:
            try:
                msg = q.get(timeout=30)
                yield f"data: {json.dumps(msg)}\n\n"
                if msg.get("type") in ("done", "error"):
                    break
            except queue.Empty:
                # Send keepalive
                yield f"data: {json.dumps({'type': 'keepalive'})}\n\n"

    return Response(stream(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route("/result")
def get_result():
    """Return the enriched GeoJSON for map display."""
    path = DATA_DIR / "osm_buildings_enriched.geojson"
    if not path.exists():
        return jsonify({"error": "No results yet"}), 404
    return send_file(path, mimetype="application/json")


@app.route("/download")
def download():
    """Download the enriched GeoJSON."""
    path = DATA_DIR / "osm_buildings_enriched.geojson"
    if not path.exists():
        return jsonify({"error": "No results yet"}), 404
    return send_file(path, as_attachment=True, download_name="osm_buildings_enriched.geojson")


def _send(msg_type, message, **kwargs):
    """Send a progress message to the SSE queue."""
    pipeline_state["queue"].put({"type": msg_type, "message": message, **kwargs})


def _run_pipeline(bbox):
    """Run the enrichment pipeline in a background thread."""
    try:
        _send("step", "Extracting OSM buildings...", step=1, total_steps=3)

        # Step 1: Extract
        proc = subprocess.run(
            [sys.executable, "01_extract_osm_buildings.py",
             "--bbox", bbox,
             "-o", str(DATA_DIR / "osm_buildings.geojson"),
             "--timeout", "180"],
            cwd=str(Path(__file__).parent),
            capture_output=True, text=True, timeout=300,
        )
        if proc.returncode != 0:
            _send("error", f"Extraction failed: {proc.stderr[-500:]}")
            return

        # Parse building count from output
        count = 0
        for line in proc.stderr.split("\n"):
            if "Extracted" in line:
                try:
                    count = int(line.split("Extracted")[1].split("buildings")[0].strip())
                except (ValueError, IndexError):
                    pass
                _send("log", line.strip())

        if count == 0:
            _send("error", "No buildings found in the selected area")
            return

        _send("step", f"Computing heights for {count} buildings...", step=2, total_steps=3, count=count)

        # Step 2: Compute heights (stream progress line by line)
        proc2 = subprocess.Popen(
            [sys.executable, "-u", "02_compute_heights.py",
             "-i", str(DATA_DIR / "osm_buildings.geojson"),
             "-o", str(DATA_DIR / "osm_buildings_enriched.geojson"),
             "--alti3d", str(DATA_DIR / "swissalti3d"),
             "--surface3d", str(DATA_DIR / "swisssurface3d"),
             "--auto-fetch"],
            cwd=str(Path(__file__).parent),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )

        for line in iter(proc2.stderr.readline, ""):
            line = line.strip()
            if not line:
                continue
            _send("log", line)

            # Parse progress
            if "Progress:" in line:
                try:
                    parts = line.split("Progress:")[1].strip().split("/")
                    current = int(parts[0])
                    total = int(parts[1])
                    _send("progress", f"{current}/{total}", current=current, total=total)
                except (ValueError, IndexError):
                    pass
            elif "Downloading" in line:
                _send("log", line)
            elif "Enriched:" in line:
                _send("log", line)

        proc2.wait()
        if proc2.returncode != 0:
            _send("error", "Height computation failed")
            return

        # Step 3: Validate
        _send("step", "Validating results...", step=3, total_steps=3)

        proc3 = subprocess.run(
            [sys.executable, "03_validate.py",
             "-i", str(DATA_DIR / "osm_buildings_enriched.geojson")],
            cwd=str(Path(__file__).parent),
            capture_output=True, text=True, timeout=60,
        )

        # Collect validation output
        stats = []
        for line in proc3.stderr.split("\n"):
            line = line.strip()
            if line and "INFO:" in line:
                clean = line.split("INFO:")[1].strip() if "INFO:" in line else line
                stats.append(clean)
                _send("log", clean)

        # Load result summary
        enriched_path = DATA_DIR / "osm_buildings_enriched.geojson"
        if enriched_path.exists():
            with open(enriched_path) as f:
                result = json.load(f)
            total = len(result["features"])
            enriched = sum(1 for f in result["features"] if "source:height" in f["properties"])
            _send("done", "Pipeline complete", total=total, enriched=enriched, stats=stats)
        else:
            _send("error", "No output file produced")

    except subprocess.TimeoutExpired:
        _send("error", "Pipeline timed out")
    except Exception as e:
        _send("error", str(e))
    finally:
        pipeline_state["running"] = False


if __name__ == "__main__":
    print("OSM Building Height Enrichment")
    print("Open http://localhost:5000")
    app.run(debug=True, port=5000, threaded=True)
