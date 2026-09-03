#!/usr/bin/env python3
"""Honesty Local — watches running programs on this computer. Yours. No paywall."""

from __future__ import annotations

import json
import os
import platform
import re
import subprocess
import sys
import threading
import time
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 8787
HERE = Path(__file__).resolve().parent
LEDGER = HERE / "honesty-ledger.json"

CATALOG = [
    ("Claude", ["claude", "anthropic"]),
    ("Copilot", ["copilot", "githubcopilot", "github copilot"]),
    ("Cursor", ["cursor"]),
    ("ChatGPT", ["chatgpt"]),
    ("Grok", ["grok"]),
    ("Ollama", ["ollama"]),
    ("LM Studio", ["lm studio", "lmstudio"]),
    ("Gemini", ["gemini"]),
    ("Windsurf", ["windsurf"]),
    ("Aider", ["aider"]),
    ("Continue", ["continue.dev", "continue"]),
    ("Perplexity", ["perplexity"]),
    ("Mistral", ["mistral"]),
    ("Codeium", ["codeium", "windsurf"]),
]

state_lock = threading.Lock()
state = {
    "armed": True,
    "started_at": datetime.now(timezone.utc).isoformat(),
    "platform": platform.system(),
    "machine": platform.node(),
    "running": [],
    "seen": [],
    "ledger": [],
    "last_scan": None,
    "note": "Honesty Local reads this computer's process list. Browser tabs are not separate programs.",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stamp(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return iso


def load_ledger() -> None:
    if not LEDGER.exists():
        return
    try:
        data = json.loads(LEDGER.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    with state_lock:
        if isinstance(data.get("ledger"), list):
            state["ledger"] = data["ledger"][-400:]
        if isinstance(data.get("seen"), list):
            state["seen"] = data["seen"]


def save_ledger() -> None:
    with state_lock:
        payload = {
            "armed": state["armed"],
            "machine": state["machine"],
            "platform": state["platform"],
            "last_scan": state["last_scan"],
            "seen": state["seen"],
            "ledger": state["ledger"][-400:],
        }
    tmp = LEDGER.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    tmp.replace(LEDGER)


def list_processes() -> list[dict]:
    system = platform.system()
    try:
        if system == "Windows":
            raw = subprocess.check_output(
                ["tasklist", "/fo", "csv", "/nh"],
                text=True,
                stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            rows = []
            for line in raw.splitlines():
                parts = [p.strip().strip('"') for p in line.split('","')]
                if not parts or not parts[0]:
                    continue
                name = parts[0].replace('"', "")
                pid = parts[1] if len(parts) > 1 else ""
                rows.append({"pid": pid, "name": name, "cmd": name})
            return rows
        raw = subprocess.check_output(
            ["ps", "-ax", "-o", "pid=,comm=,args="],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        rows = []
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            match = re.match(r"^\s*(\d+)\s+(\S+)\s+(.*)$", line)
            if not match:
                continue
            pid, comm, args = match.group(1), match.group(2), match.group(3)
            rows.append({"pid": pid, "name": os.path.basename(comm), "cmd": args[:240]})
        return rows
    except (OSError, subprocess.CalledProcessError):
        return []


def haystack(proc: dict) -> str:
    return f"{proc.get('name', '')} {proc.get('cmd', '')}".lower()


def match_ai(proc: dict) -> str | None:
    hay = haystack(proc)
    browser = any(b in hay for b in ("chrome", "firefox", "safari", "msedge", "edge", "brave", "chromium"))
    for name, aliases in CATALOG:
        for alias in [name.lower(), *aliases]:
            if alias and alias in hay:
                if browser and alias in ("continue",):
                    continue
                return name
    return None


def scan_once() -> dict:
    procs = list_processes()
    found: dict[str, dict] = {}
    for proc in procs:
        name = match_ai(proc)
        if not name:
            continue
        row = found.get(name) or {"name": name, "count": 0, "pids": [], "samples": []}
        row["count"] += 1
        if proc["pid"] not in row["pids"] and len(row["pids"]) < 8:
            row["pids"].append(proc["pid"])
        if len(row["samples"]) < 3:
            row["samples"].append(proc["name"])
        found[name] = row
    at = now_iso()
    running = sorted(found.values(), key=lambda r: r["name"].lower())
    with state_lock:
        prior = {item["name"] for item in state["running"]}
        now_names = {item["name"] for item in running}
        for item in running:
            item["at"] = at
            if item["name"] not in prior:
                state["ledger"].append({
                    "at": at,
                    "kind": "start",
                    "name": item["name"],
                    "summary": f"{item['name']} is running on {state['machine']}",
                })
            seen = next((s for s in state["seen"] if s["name"] == item["name"]), None)
            if seen:
                seen["lastAt"] = at
                seen["count"] = seen.get("count", 0) + 1
                seen["pids"] = item["pids"]
            else:
                state["seen"].append({"name": item["name"], "firstAt": at, "lastAt": at, "count": 1, "pids": item["pids"]})
        if state["armed"]:
            for name in sorted(prior - now_names):
                state["ledger"].append({
                    "at": at,
                    "kind": "stop",
                    "name": name,
                    "summary": f"{name} is no longer in the process list",
                })
        state["running"] = running
        state["last_scan"] = at
        state["ledger"] = state["ledger"][-400:]
        snapshot = {
            "armed": state["armed"],
            "platform": state["platform"],
            "machine": state["machine"],
            "running": list(state["running"]),
            "seen": list(state["seen"]),
            "ledger": list(state["ledger"][-80:]),
            "last_scan": state["last_scan"],
            "note": state["note"],
            "process_count": len(procs),
        }
    save_ledger()
    return snapshot


def report_text(snap: dict) -> str:
    lines = [
        "HONESTY LOCAL",
        "above all else",
        f"Machine: {snap.get('machine')}",
        f"Platform: {snap.get('platform')}",
        f"Scan: {snap.get('last_scan')}",
        f"Watch: {'armed' if snap.get('armed') else 'at rest'}",
        "",
        "RUNNING NOW",
    ]
    running = snap.get("running") or []
    if not running:
        lines.append("  None of the named AI desktop programs are in the process list.")
        lines.append("  Browser tabs (claude.ai, chatgpt.com, grok.com) are not separate programs.")
    else:
        for item in running:
            lines.append(f"  {item['name']} · {item['count']} process · pids {', '.join(item['pids'])}")
    lines += ["", "SEEN ON THIS MACHINE"]
    for item in snap.get("seen") or []:
        lines.append(f"  {item['name']} · last {stamp(item.get('lastAt', ''))} · {item.get('count', 0)} scans")
    lines += ["", "LEDGER"]
    for item in reversed(snap.get("ledger") or []):
        lines.append(f"  {stamp(item.get('at', ''))}  {item.get('summary')}")
    lines += ["", "This program is yours. No paywall. It reads this computer only."]
    return "\n".join(lines) + "\n"


PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Honesty Local</title>
  <style>
    :root {
      --bg: #0e0d0b; --surface: #171614; --fg: #efece4; --muted: #9a948a;
      --subtle: #6f6a63; --border: rgba(239,236,228,.12); --sage: #8a9188;
      --accent: #e6e2d8; --accent-fg: #12110f; --danger: #c45c4a;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: var(--bg); color: var(--fg);
      font: 16px/1.5 "Segoe UI", system-ui, sans-serif; }
    h1, h2 { font-family: Georgia, "Times New Roman", serif; letter-spacing: -0.03em; font-weight: 500; }
    h1 { font-size: clamp(2rem, 4vw, 3rem); margin: 0; }
    h2 { font-size: 1.35rem; margin: 0 0 12px; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 28px 20px 80px; }
    .kicker { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--subtle); }
    .muted { color: var(--muted); }
    .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 20px; }
    button { min-height: 44px; padding: 0 16px; border-radius: 12px; border: 1px solid var(--border);
      background: var(--surface); color: var(--fg); font: inherit; cursor: pointer; }
    button.primary { background: var(--accent); color: var(--accent-fg); border: 0; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px; margin-top: 20px; }
    .badge { display: inline-flex; align-items: center; min-height: 28px; padding: 0 10px; border-radius: 8px;
      border: 1px solid var(--border); font-size: 12px; color: var(--muted); }
    .badge.on { color: var(--bg); background: var(--sage); border: 0; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { padding: 12px 0; border-top: 1px solid var(--border); }
    li:first-child { border-top: 0; }
    .name { font-weight: 600; }
    .meta { font-size: 12px; color: var(--subtle); font-family: ui-monospace, Menlo, Consolas, monospace; }
    a { color: var(--sage); }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="kicker">Honesty Local · this computer</p>
    <h1>Above all else.</h1>
    <p class="muted" style="max-width:40rem">This program reads the process list on this machine. Desktop Claude, Cursor, Copilot, Ollama show here. A tab in a browser does not.</p>
    <div class="row">
      <button class="primary" id="arm" type="button">Arm</button>
      <button id="scan" type="button">Scan now</button>
      <a href="/api/report.txt" download="honesty-local-report.txt"><button type="button">Keep report</button></a>
      <span class="badge" id="watch">…</span>
      <span class="badge" id="host">…</span>
    </div>
    <section class="card">
      <h2>Running now</h2>
      <ul id="running"><li class="muted">Scanning…</li></ul>
    </section>
    <section class="card">
      <h2>Ledger</h2>
      <ul id="ledger"></ul>
    </section>
    <section class="card">
      <h2>Seen</h2>
      <ul id="seen"></ul>
    </section>
  </div>
  <script>
    async function api(path, opts) {
      const res = await fetch(path, opts);
      if (!res.ok) throw new Error("scan failed");
      if (res.headers.get("content-type")?.includes("text/plain")) return res.text();
      return res.json();
    }
    function rel(iso) {
      if (!iso) return "";
      const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
      if (s < 60) return "just now";
      if (s < 3600) return Math.floor(s/60) + "m ago";
      if (s < 86400) return Math.floor(s/3600) + "h ago";
      return Math.floor(s/86400) + "d ago";
    }
    function paint(d) {
      document.getElementById("watch").textContent = d.armed ? "ARMED" : "AT REST";
      document.getElementById("watch").className = "badge" + (d.armed ? " on" : "");
      document.getElementById("host").textContent = (d.machine || "") + " · " + (d.platform || "");
      document.getElementById("arm").textContent = d.armed ? "Stand down" : "Arm the watch";
      const run = document.getElementById("running");
      if (!d.running.length) {
        run.innerHTML = "<li class='muted'>No named AI desktop program is running. Browser tabs will not appear here.</li>";
      } else {
        run.innerHTML = d.running.map(r =>
          "<li><div class='name'>" + r.name + " <span class='badge on'>running</span></div>" +
          "<div class='meta'>" + r.count + " process · pid " + r.pids.join(", ") + "</div></li>"
        ).join("");
      }
      document.getElementById("ledger").innerHTML = (d.ledger || []).slice().reverse().slice(0, 40).map(e =>
        "<li><div>" + e.summary + "</div><div class='meta'>" + rel(e.at) + "</div></li>"
      ).join("") || "<li class='muted'>No movement yet.</li>";
      document.getElementById("seen").innerHTML = (d.seen || []).map(s =>
        "<li><div class='name'>" + s.name + "</div><div class='meta'>last " + rel(s.lastAt) + " · " + s.count + " scans</div></li>"
      ).join("") || "<li class='muted'>Nothing seen yet.</li>";
    }
    async function refresh() { paint(await api("/api/status")); }
    document.getElementById("scan").onclick = async () => { paint(await api("/api/scan", { method: "POST" })); };
    document.getElementById("arm").onclick = async () => {
      const cur = await api("/api/status");
      paint(await api("/api/arm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ armed: !cur.armed }) }));
    };
    refresh();
    setInterval(refresh, 8000);
  </script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[honesty] " + (fmt % args) + "\n")

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")

    def _send(self, code: int, body: bytes, content_type: str) -> None:
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            self._send(200, PAGE.encode("utf-8"), "text/html; charset=utf-8")
            return
        if path == "/api/status":
            with state_lock:
                snap = {
                    "armed": state["armed"],
                    "platform": state["platform"],
                    "machine": state["machine"],
                    "running": list(state["running"]),
                    "seen": list(state["seen"]),
                    "ledger": list(state["ledger"][-80:]),
                    "last_scan": state["last_scan"],
                    "note": state["note"],
                }
            self._send(200, json.dumps(snap).encode("utf-8"), "application/json")
            return
        if path == "/api/report.txt":
            with state_lock:
                snap = dict(state)
            self._send(200, report_text(snap).encode("utf-8"), "text/plain; charset=utf-8")
            return
        self._send(404, b"not found", "text/plain")

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            body = {}
        if path == "/api/arm":
            with state_lock:
                state["armed"] = bool(body.get("armed", True))
            snap = scan_once()
            self._send(200, json.dumps(snap).encode("utf-8"), "application/json")
            return
        if path == "/api/scan":
            snap = scan_once()
            self._send(200, json.dumps(snap).encode("utf-8"), "application/json")
            return
        self._send(404, b"not found", "text/plain")


def loop() -> None:
    while True:
        with state_lock:
            armed = state["armed"]
        if armed:
            try:
                scan_once()
            except Exception as exc:
                sys.stderr.write(f"[honesty] scan failed: {exc}\n")
        time.sleep(8)


def main() -> int:
    load_ledger()
    snap = scan_once()
    if "--once" in sys.argv:
        sys.stdout.write(report_text(snap))
        return 0
    threading.Thread(target=loop, daemon=True).start()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}"
    sys.stderr.write(f"Honesty Local is on this computer.\n{url}\nYours. No paywall.\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
