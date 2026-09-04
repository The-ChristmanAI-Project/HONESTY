#!/usr/bin/env python3
"""Honesty Local — process list on this computer. Conductor rail included.

DO NOT STUB. This is the real watcher. Bind 127.0.0.1:8787 only.
The desk is 8788. Conductor hooks live here: /api/conductor, /api/conductor/seat,
/api/conductor/ingest, conductor-outbox.json. Never replace this file with a placeholder.
"""
from __future__ import annotations
import json, os, platform, re, subprocess, sys, threading, time, urllib.error, urllib.request, webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOST, PORT = "127.0.0.1", 8787
HERE = Path(__file__).resolve().parent
LEDGER, HOOK, OUTBOX = HERE / "honesty-ledger.json", HERE / "conductor-hook.json", HERE / "conductor-outbox.json"
CATALOG = [
    ("Claude", ["claude", "anthropic"]), ("Copilot", ["copilot", "githubcopilot", "github copilot"]),
    ("Cursor", ["cursor"]), ("ChatGPT", ["chatgpt"]), ("Grok", ["grok"]), ("Ollama", ["ollama"]),
    ("LM Studio", ["lm studio", "lmstudio"]), ("Gemini", ["gemini"]), ("Windsurf", ["windsurf"]),
    ("Aider", ["aider"]), ("Continue", ["continue.dev", "continue"]), ("Perplexity", ["perplexity"]),
    ("Mistral", ["mistral"]), ("Codeium", ["codeium", "windsurf"]),
]
lock = threading.Lock()
state = {"armed": True, "started_at": datetime.now(timezone.utc).isoformat(), "platform": platform.system(),
         "machine": platform.node(), "running": [], "seen": [], "ledger": [], "last_scan": None,
         "note": "Honesty Local reads this computer process list. Browser tabs are not programs.",
         "conductor_url": None, "conductor_last_push": None, "conductor_last_error": None}

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def hours_ago(iso):
    if not iso: return 0.0
    try:
        then = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return max(0.0, (datetime.now(timezone.utc) - then).total_seconds() / 3600)
    except ValueError:
        return 0.0

def load_ledger():
    if LEDGER.exists():
        try: data = json.loads(LEDGER.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError): data = {}
        with lock:
            if isinstance(data.get("ledger"), list): state["ledger"] = data["ledger"][-400:]
            if isinstance(data.get("seen"), list): state["seen"] = data["seen"]
    if HOOK.exists():
        try: hook = json.loads(HOOK.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError): hook = {}
        url = hook.get("url")
        if isinstance(url, str) and url.startswith("http"):
            with lock: state["conductor_url"] = url.strip()

def save_ledger():
    with lock:
        payload = {"armed": state["armed"], "machine": state["machine"], "platform": state["platform"],
                   "last_scan": state["last_scan"], "seen": state["seen"], "ledger": state["ledger"][-400:]}
    tmp = LEDGER.with_suffix(".json.tmp"); tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8"); tmp.replace(LEDGER)

def save_hook(url):
    tmp = HOOK.with_suffix(".json.tmp")
    tmp.write_text(json.dumps({"url": url, "seated_at": now_iso() if url else None}, indent=2), encoding="utf-8")
    tmp.replace(HOOK)

def list_processes():
    system = platform.system()
    try:
        if system == "Windows":
            raw = subprocess.check_output(["tasklist", "/fo", "csv", "/nh"], text=True, stderr=subprocess.DEVNULL,
                                          creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            rows = []
            for line in raw.splitlines():
                parts = [p.strip().strip('"') for p in line.split('","')]
                if parts and parts[0]:
                    rows.append({"pid": parts[1] if len(parts) > 1 else "", "name": parts[0].replace('"', ""), "cmd": parts[0]})
            return rows
        raw = subprocess.check_output(["ps", "-ax", "-o", "pid=,comm=,args="], text=True, stderr=subprocess.DEVNULL)
        rows = []
        for line in raw.splitlines():
            m = re.match(r"^\s*(\d+)\s+(\S+)\s+(.*)$", line.strip())
            if m: rows.append({"pid": m.group(1), "name": os.path.basename(m.group(2)), "cmd": m.group(3)[:240]})
        return rows
    except (OSError, subprocess.CalledProcessError):
        return []

def match_ai(proc):
    hay = f"{proc.get('name','')} {proc.get('cmd','')}".lower()
    browser = any(b in hay for b in ("chrome", "firefox", "safari", "msedge", "edge", "brave", "chromium"))
    for name, aliases in CATALOG:
        for alias in [name.lower(), *aliases]:
            if alias and alias in hay:
                if browser and alias == "continue": continue
                return name
    return None

def scan_once():
    procs = list_processes(); found = {}
    for proc in procs:
        name = match_ai(proc)
        if not name: continue
        row = found.get(name) or {"name": name, "count": 0, "pids": [], "samples": []}
        row["count"] += 1
        if proc["pid"] not in row["pids"] and len(row["pids"]) < 8: row["pids"].append(proc["pid"])
        if len(row["samples"]) < 3: row["samples"].append(proc["name"])
        found[name] = row
    at = now_iso(); running = sorted(found.values(), key=lambda r: r["name"].lower())
    with lock:
        prior = {item["name"] for item in state["running"]}; now_names = {item["name"] for item in running}
        for item in running:
            item["at"] = at
            if item["name"] not in prior:
                state["ledger"].append({"at": at, "kind": "start", "name": item["name"],
                                        "summary": f"{item['name']} is running on {state['machine']}"})
            seen = next((s for s in state["seen"] if s["name"] == item["name"]), None)
            if seen: seen["lastAt"] = at; seen["count"] = seen.get("count", 0) + 1; seen["pids"] = item["pids"]
            else: state["seen"].append({"name": item["name"], "firstAt": at, "lastAt": at, "count": 1, "pids": item["pids"]})
        if state["armed"]:
            for name in sorted(prior - now_names):
                state["ledger"].append({"at": at, "kind": "stop", "name": name, "summary": f"{name} is no longer in the process list"})
        state["running"] = running; state["last_scan"] = at; state["ledger"] = state["ledger"][-400:]
        snap = {"armed": state["armed"], "platform": state["platform"], "machine": state["machine"],
                "running": list(state["running"]), "seen": list(state["seen"]), "ledger": list(state["ledger"][-80:]),
                "last_scan": state["last_scan"], "note": state["note"], "process_count": len(procs)}
    save_ledger(); write_outbox(); push_to_conductor(); return snap

def conductor_snapshot():
    with lock:
        running = {item["name"]: item for item in state["running"]}
        seen_map = {item["name"]: item for item in state["seen"]}
        beings = []
        for name, _ in CATALOG:
            live, seen = running.get(name), seen_map.get(name)
            if live:
                status, shipped, artifacts, verified, empty = "clean", live.get("count", 1), live.get("count", 1), True, 0
                hours = hours_ago(live.get("at") or state["last_scan"])
                mandate = f"{name} is in the process list on {state['machine']}."
                last_at = live.get("at") or state["last_scan"]
            elif seen:
                status, shipped, artifacts, verified, empty = "review", 0, seen.get("count", 0), False, 1
                hours = hours_ago(seen.get("lastAt"))
                mandate = f"{name} was seen on this machine. Not in the process list now."
                last_at = seen.get("lastAt")
            else:
                status, shipped, artifacts, verified, empty = "empty", 0, 0, False, 0
                hours, mandate, last_at = 0.0, f"{name} has not appeared in the process list on this computer.", None
            beings.append({"id": name.lower().replace(" ", "-"), "name": name, "title": "Home station program",
                           "division": "Honesty Local", "wing": "Honesty", "focus": "Process list on this computer.",
                           "mandate": mandate, "domain": "Ops", "shipped": shipped, "emptyStreak": empty,
                           "status": status, "queued": 0, "artifacts": artifacts,
                           "confidence": 1.0 if live else (0.6 if seen else 0.0), "verified": verified,
                           "hoursAgo": round(hours, 2), "minutes": 0, "tokens": 0, "nextIn": 0,
                           "pids": (live or seen or {}).get("pids", []), "lastAt": last_at})
        return {"source": "honesty-local", "version": 1, "seated": True, "wing": "Honesty",
                "hook": state["conductor_url"], "armed": state["armed"], "platform": state["platform"],
                "machine": state["machine"], "last_scan": state["last_scan"],
                "conductor_url": state["conductor_url"], "conductor_last_push": state["conductor_last_push"],
                "conductor_last_error": state["conductor_last_error"], "running": list(state["running"]),
                "seen": list(state["seen"]), "ledger": list(state["ledger"][-80:]), "beings": beings,
                "note": state["note"],
                "standing": f"{len(running)} named program(s) running on {state['machine']}. Browser tabs are not programs."}

def write_outbox():
    tmp = OUTBOX.with_suffix(".json.tmp"); tmp.write_text(json.dumps(conductor_snapshot(), indent=2), encoding="utf-8"); tmp.replace(OUTBOX)

def push_to_conductor():
    with lock: url = state["conductor_url"]
    if not url: return
    req = urllib.request.Request(url, data=json.dumps(conductor_snapshot()).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", "User-Agent": "Honesty-Local"})
    try:
        with urllib.request.urlopen(req, timeout=4) as res: res.read(256)
        with lock: state["conductor_last_push"] = now_iso(); state["conductor_last_error"] = None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        with lock: state["conductor_last_error"] = str(exc)[:240]

def report_text(snap):
    lines = ["HONESTY LOCAL", f"Machine: {snap.get('machine')}", f"Platform: {snap.get('platform')}",
             f"Scan: {snap.get('last_scan')}", f"Watch: {'armed' if snap.get('armed') else 'at rest'}", "", "RUNNING NOW"]
    running = snap.get("running") or []
    if not running: lines.append("  None of the named AI desktop programs are in the process list.")
    else:
        for item in running: lines.append(f"  {item['name']} · {item['count']} process · pids {', '.join(item['pids'])}")
    return "\n".join(lines) + "\n"

PAGE = """<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>Honesty Local</title>
<style>body{margin:0;background:#0e0d0b;color:#efece4;font:16px/1.5 system-ui} .w{max-width:960px;margin:0 auto;padding:28px 20px} a{color:#8a9188}</style></head>
<body><div class=\"w\"><p>Honesty Local</p><h1>Above all else.</h1>
<p>Process list on this computer. A browser tab is not Claude.</p>
<p><a href=\"/conductor\">Conductor rail</a> · <a href=\"/api/status\">status</a> · <a href=\"/api/report.txt\">report</a></p>
<pre id=\"out\">loading</pre></div>
<script>async function go(){const d=await (await fetch(\"/api/status\")).json();document.getElementById(\"out\").textContent=JSON.stringify(d,null,2);}go();setInterval(go,8000);</script></body></html>"""

CONDUCTOR_PAGE = """<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>Honesty · Conductor rail</title>
<style>body{margin:0;background:#080a0c;color:#dff4f7;font:15px/1.45 system-ui} .w{max-width:1100px;margin:0 auto;padding:28px 20px}
.bar{height:6px;background:#5fd3e0} .mark{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:8px}
table{width:100%;border-collapse:collapse} td,th{text-align:left;padding:8px;border-top:1px solid rgba(120,190,205,.22)}</style></head>
<body><div class=\"bar\"></div><div class=\"w\"><p>Honesty · Conductor rail · live</p>
<h1>The watch on Maestro's board.</h1><p id=\"standing\">seating</p>
<p><button id=\"scan\">Scan now</button> <a href=\"/\">Honesty desk</a></p>
<table><thead><tr><th>Being</th><th>Status</th><th>Mandate</th></tr></thead><tbody id=\"rows\"></tbody></table>
<p>Seat hook: <input id=\"hook\" placeholder=\"https://…/ingest\"/><button id=\"seat\">Seat</button></p>
<p id=\"hookState\"></p></div>
<script>
const MARK={clean:\"#5fd3e0\",review:\"#dcae6a\",empty:\"#e08c82\",dark:\"#f0736a\"};
async function paint(){const d=await (await fetch(\"/api/conductor\")).json();
document.getElementById(\"standing\").textContent=d.standing||\"\";
document.getElementById(\"rows\").innerHTML=(d.beings||[]).map(b=>\"<tr><td>\"+b.name+\"</td><td><span class='mark' style='background:\"+(MARK[b.status]||\"#8fa3ab\")+\"'></span>\"+b.status+\"</td><td>\"+b.mandate+\"</td></tr>\").join(\"\");
document.getElementById(\"hook\").value=d.conductor_url||\"\";
document.getElementById(\"hookState\").textContent=d.conductor_url?\"hook seated\":\"no hook. outbox still written.\";}
document.getElementById(\"scan\").onclick=async()=>{await fetch(\"/api/scan\",{method:\"POST\"});paint();};
document.getElementById(\"seat\").onclick=async()=>{const url=document.getElementById(\"hook\").value.trim();await fetch(\"/api/conductor/seat\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({url})});paint();};
paint();setInterval(paint,8000);
</script></body></html>"""

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): sys.stderr.write("[honesty] " + (fmt % args) + "\n")
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
    def _send(self, code, body, content_type):
        self.send_response(code); self._cors(); self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def _json(self, payload, code=200): self._send(code, json.dumps(payload).encode("utf-8"), "application/json")
    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/index.html"): self._send(200, PAGE.encode("utf-8"), "text/html; charset=utf-8"); return
        if path in ("/conductor", "/conductor/"): self._send(200, CONDUCTOR_PAGE.encode("utf-8"), "text/html; charset=utf-8"); return
        if path == "/api/status":
            with lock: self._json({"armed": state["armed"], "platform": state["platform"], "machine": state["machine"],
                                  "running": list(state["running"]), "seen": list(state["seen"]),
                                  "ledger": list(state["ledger"][-80:]), "last_scan": state["last_scan"], "note": state["note"]}); return
        if path == "/api/conductor": self._json(conductor_snapshot()); return
        if path == "/api/report.txt":
            with lock: self._send(200, report_text(dict(state)).encode("utf-8"), "text/plain; charset=utf-8"); return
        self._send(404, b"not found", "text/plain")
    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try: body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError: body = {}
        if path == "/api/arm":
            with lock: state["armed"] = bool(body.get("armed", True)); self._json(scan_once()); return
        if path == "/api/scan": self._json(scan_once()); return
        if path == "/api/conductor/seat":
            url = body.get("url"); clean = url.strip() if isinstance(url, str) else ""
            if clean and not clean.startswith("http"): self._json({"ok": False, "error": "Hook has to start with http."}, 400); return
            seated = clean or None
            with lock: state["conductor_url"] = seated; state["conductor_last_error"] = None
            save_hook(seated)
            if seated: push_to_conductor()
            self._json(conductor_snapshot()); return
        if path == "/api/conductor/ingest":
            with lock:
                state["ledger"].append({"at": now_iso(), "kind": "other", "name": str(body.get("name") or "Conductor"),
                                        "summary": str(body.get("summary") or "Conductor sent a ruling.")})
                state["ledger"] = state["ledger"][-400:]
            save_ledger(); self._json({"ok": True}); return
        self._send(404, b"not found", "text/plain")

def loop():
    while True:
        with lock: armed = state["armed"]
        if armed:
            try: scan_once()
            except Exception as exc: sys.stderr.write(f"[honesty] scan failed: {exc}\n")
        time.sleep(8)

def main():
    load_ledger(); snap = scan_once()
    if "--once" in sys.argv: sys.stdout.write(report_text(snap)); return 0
    threading.Thread(target=loop, daemon=True).start()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}"
    sys.stderr.write(f"Honesty Local is on this computer.\n{url}\nConductor rail: {url}/conductor\nYours. No paywall.\n")
    try: webbrowser.open(f"{url}/conductor" if "--conductor" in sys.argv else url)
    except Exception: pass
    try: httpd.serve_forever()
    except KeyboardInterrupt: return 0
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
