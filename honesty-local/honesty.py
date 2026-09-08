#!/usr/bin/env python3
"""Honesty Local — process list on this computer. Conductor rail included.

DO NOT STUB. This is the real watcher. Bind 127.0.0.1:8787 only.
The desk is 8788. Conductor hooks live here: /api/conductor, /api/conductor/seat,
/api/conductor/ingest, conductor-outbox.json. Never replace this file with a placeholder.
"""
from __future__ import annotations
import hashlib, hmac, json, os, platform, re, socket, subprocess, sys, threading, time, urllib.error, urllib.request, webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

# Loopback only. That default does not change and no run inherits anything
# else unless it is asked for by name. A container has no loopback the home
# station's browser can reach, so the image — and only the image — sets
# HONESTY_LOCAL_HOST=0.0.0.0 to publish 8787 outward.
HOST = os.environ.get("HONESTY_LOCAL_HOST", "127.0.0.1")
PORT = int(os.environ.get("HONESTY_LOCAL_PORT", "8787"))
HERE = Path(__file__).resolve().parent
DATA = Path(os.environ.get("HONESTY_DATA_DIR", str(HERE))).resolve()
DATA.mkdir(parents=True, exist_ok=True)
LEDGER, HOOK, OUTBOX = DATA / "honesty-ledger.json", DATA / "conductor-hook.json", DATA / "conductor-outbox.json"
CATALOG = [
    ("Claude", ["claude", "anthropic"]), ("Copilot", ["copilot", "githubcopilot", "github copilot"]),
    ("Cursor", ["cursor"]), ("ChatGPT", ["chatgpt"]), ("Grok", ["grok"]), ("Ollama", ["ollama"]),
    ("LM Studio", ["lm studio", "lmstudio"]), ("Gemini", ["gemini"]), ("Windsurf", ["windsurf"]),
    ("Aider", ["aider"]), ("Continue", ["continue.dev", "continue"]), ("Perplexity", ["perplexity"]),
    ("Mistral", ["mistral"]), ("Codeium", ["codeium", "windsurf"]),
]
DC_HOSTS = {
    "api.anthropic.com": "Anthropic", "api.openai.com": "OpenAI", "api.x.ai": "xAI",
    "integrate.api.nvidia.com": "NVIDIA", "inference.nvidia.com": "NVIDIA",
    "ai.api.nvidia.com": "NVIDIA", "api.nvcf.nvidia.com": "NVIDIA",
    "generativelanguage.googleapis.com": "Gemini", "api.mistral.ai": "Mistral",
    "api.groq.com": "Groq", "openrouter.ai": "OpenRouter", "ollama.com": "Ollama",
}
REASONING_MARK = ("o1", "o3", "o4", "r1", "reason", "think", "nemotron", "opus", "sonnet",
                  "grok-3", "grok-4", "grok-2", "gpt-5")
FLAGSHIP_MARK = ("gpt-4o", "gpt-4.1", "gpt-5", "claude-3", "claude-sonnet", "claude-opus",
                 "claude-haiku", "llama-3.1-405", "llama-3.3-70", "llama-4", "gemini-2",
                 "mistral-large", "qwen2.5", "deepseek", "nemotron", "grok")
NIM_PORTS = (8000, 8001, 9000, 1234)
CLOUD_EVERY = 60
CURRENT_HOURS = 2.0
SKIP_MODEL_KEYS = {
    "cachedgrowthbookfeatures", "cachedgrowthbook", "cachedexperimentfeatures",
    "cachedexperimentdata", "tengu_auto_mode_config",
    "tengu_tool_search_unsupported_models", "lastmodelusage",
    "additionalmodeloptionscache", "additionalmodelcostscache",
    "additionalmodeloptionsansweredat", "modelaccesscache",
    "orgmodeldefaultcache", "metricsstatuscache", "groveconfigcache",
    "autocompactwindowscache", "projects",
}
lock = threading.Lock()
state = {"armed": True, "started_at": datetime.now(timezone.utc).isoformat(), "platform": platform.system(),
         "machine": platform.node(), "running": [], "seen": [], "ledger": [], "last_scan": None,
         "models": [], "last_model_scan": None, "cloud_scan_at": 0.0, "model_note": None,
         "note": "Honesty Local reads programs on this computer and which model is answering. Browser tabs are not programs.",
         "conductor_url": None, "conductor_last_push": None, "conductor_last_error": None}
_dns_cache = {"at": 0.0, "ips": {}}

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def hours_ago(iso):
    if not iso: return 0.0
    try:
        then = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return max(0.0, (datetime.now(timezone.utc) - then).total_seconds() / 3600)
    except ValueError:
        return 0.0

def parse_stamp(val):
    if val is None: return None
    if isinstance(val, (int, float)):
        ts = float(val)
        if ts > 1e12: ts /= 1000.0
        return ts if ts > 1e9 else None
    if isinstance(val, str) and val.strip():
        try:
            return datetime.fromisoformat(val.strip().replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    return None

def stamp_iso(val):
    ts = parse_stamp(val)
    if ts is None: return None
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()

def is_current(val, hours=CURRENT_HOURS):
    ts = parse_stamp(val)
    if ts is None: return False
    return (time.time() - ts) / 3600.0 <= hours

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
                   "last_scan": state["last_scan"], "seen": state["seen"], "ledger": state["ledger"][-400:],
                   "models": state["models"]}
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
                if alias == "grok" and "grok_seat" in hay: continue
                return name
    return None

def model_role(mid):
    hay = (mid or "").lower()
    return "reasoning" if any(mark in hay for mark in REASONING_MARK) else "chat"

def keep_reachable(mid):
    hay = (mid or "").lower()
    return any(mark in hay for mark in REASONING_MARK + FLAGSHIP_MARK)

def host_provider(host):
    hay = (host or "").lower().split(":")[0]
    if hay in DC_HOSTS: return DC_HOSTS[hay]
    if "bedrock-runtime" in hay or hay.startswith("bedrock."): return "AWS"
    for name, provider in DC_HOSTS.items():
        if hay == name or hay.endswith("." + name): return provider
    return None

def http_json(url, headers=None, timeout=3):
    hdrs = {"User-Agent": "Honesty-Local", **(headers or {})}
    req = urllib.request.Request(url, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read(2_000_000)
        data = json.loads(raw.decode("utf-8"))
        return data if isinstance(data, (dict, list)) else None
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError, UnicodeDecodeError, ValueError):
        return None

def model_row(mid, name, provider, where, status, source, host=None, via=None, at=None):
    clean = str(mid or name or "").strip()
    if not clean: return None
    label = str(name or clean).strip()
    return {"id": clean[:160], "name": label[:160], "provider": provider, "where": where,
            "role": model_role(clean + " " + label), "status": status, "source": source,
            "host": host, "via": via, "at": at or now_iso()}

def env_keys():
    def first(*names):
        for name in names:
            val = os.environ.get(name)
            if isinstance(val, str) and val.strip(): return val.strip()
        return ""
    return {
        "nvidia": first("NVIDIA_API_KEY", "NGC_API_KEY", "NVAPI_KEY"),
        "openai": first("OPENAI_API_KEY"),
        "anthropic": first("ANTHROPIC_API_KEY", "CLAUDE_API_KEY"),
        "ollama": first("OLLAMA_API_KEY"),
        "xai": first("XAI_API_KEY"),
        "awsAccessKeyId": first("AWS_ACCESS_KEY_ID"),
        "awsSecretAccessKey": first("AWS_SECRET_ACCESS_KEY"),
        "awsRegion": first("AWS_REGION", "AWS_DEFAULT_REGION") or "us-east-1",
    }

def resolve_dc_ips():
    now = time.time()
    if now - _dns_cache["at"] < 60 and _dns_cache["ips"]:
        return _dns_cache["ips"]
    ips = {}
    hosts = list(DC_HOSTS) + ["bedrock-runtime.us-east-1.amazonaws.com", "bedrock-runtime.us-west-2.amazonaws.com"]
    for host in hosts:
        try:
            for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM):
                addr = item[4][0]
                if addr: ips[addr] = host
        except socket.gaierror:
            continue
    _dns_cache["at"] = now
    _dns_cache["ips"] = ips
    return ips

def list_connections():
    system = platform.system()
    rows = []
    try:
        if system == "Windows":
            raw = subprocess.check_output(["netstat", "-ano"], text=True, stderr=subprocess.DEVNULL,
                                          creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            for line in raw.splitlines():
                if "ESTABLISHED" not in line.upper(): continue
                parts = line.split()
                if len(parts) < 5: continue
                remote, pid = parts[2], parts[-1]
                rows.append({"pid": pid, "remote": remote})
            return rows
        raw = subprocess.check_output(["lsof", "-nP", "-iTCP", "-sTCP:ESTABLISHED"], text=True,
                                      stderr=subprocess.DEVNULL)
        for line in raw.splitlines()[1:]:
            parts = line.split()
            if len(parts) < 9: continue
            name = parts[-1]
            if "->" not in name: continue
            remote = name.split("->", 1)[1]
            rows.append({"pid": parts[1], "name": parts[0], "remote": remote})
        return rows
    except (OSError, subprocess.CalledProcessError):
        return []

def probe_wire(pid_names):
    ips = resolve_dc_ips()
    found, seen = [], set()
    for conn in list_connections():
        remote = conn.get("remote") or ""
        hostport = remote.rsplit(":", 1)[0].strip("[]")
        host = ips.get(hostport) or hostport
        provider = host_provider(host)
        if not provider: continue
        via = match_ai({"name": conn.get("name") or "", "cmd": conn.get("name") or ""})
        if not via: via = pid_names.get(str(conn.get("pid") or ""))
        key = (provider, host)
        if key in seen: continue
        seen.add(key)
        row = model_row(f"{provider.lower()}-live", f"{provider} live session", provider,
                        "datacenter", "in_use", "wire", host=host, via=via, at=now_iso())
        if row: found.append(row)
    return found

def probe_ollama():
    hosts = ["http://127.0.0.1:11434"]
    extra = os.environ.get("OLLAMA_HOST")
    if extra and extra.startswith("http"): hosts.append(extra.rstrip("/"))
    found = []
    for base in hosts:
        local = "127.0.0.1" in base or "localhost" in base
        host = base.replace("http://", "").replace("https://", "")
        ps = http_json(base + "/api/ps")
        loaded = ps.get("models") if isinstance(ps, dict) else None
        if isinstance(loaded, list):
            for item in loaded:
                if not isinstance(item, dict): continue
                mid = str(item.get("model") or item.get("name") or "")
                where = "datacenter" if ":cloud" in mid.lower() or not local else "local"
                row = model_row(mid, mid, "Ollama", where, "in_use", "ollama-ps", host=host, via="Ollama", at=now_iso())
                if row: found.append(row)
        tags = http_json(base + "/api/tags")
        catalog = tags.get("models") if isinstance(tags, dict) else None
        if not isinstance(catalog, list): continue
        for item in catalog:
            if not isinstance(item, dict): continue
            mid = str(item.get("model") or item.get("name") or "")
            cloud = ":cloud" in mid.lower()
            if local and not cloud: continue
            where = "datacenter" if cloud or not local else "local"
            row = model_row(mid, mid, "Ollama", where, "reachable", "ollama-tags", host=host, via="Ollama")
            if row: found.append(row)
    return found

def probe_openai_compat_local():
    found = []
    for port in NIM_PORTS:
        data = http_json(f"http://127.0.0.1:{port}/v1/models")
        rows = data.get("data") if isinstance(data, dict) else None
        if not isinstance(rows, list): continue
        provider = "LM Studio" if port == 1234 else "NVIDIA NIM"
        where = "local"
        for item in rows:
            if not isinstance(item, dict): continue
            mid = str(item.get("id") or item.get("name") or "")
            row = model_row(mid, mid, provider, where, "in_use", "nim-local",
                            host=f"127.0.0.1:{port}", via=provider, at=now_iso())
            if row: found.append(row)
    return found

def read_json_file(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None

def walk_models(obj, acc, stamps=None, skip_keys=None):
    skip_keys = skip_keys or SKIP_MODEL_KEYS
    stamps = stamps if stamps is not None else {}
    if isinstance(obj, dict):
        parent_at = obj.get("at") or obj.get("timestamp") or obj.get("lastStartTime")
        for key, val in obj.items():
            k = str(key).lower()
            if k in skip_keys:
                continue
            if k in ("model", "modelid", "model_id", "selectedmodel", "chatmodel", "aimodel") and isinstance(val, str) and val.strip():
                mid = val.strip()
                if mid.lower() in ("true", "false") or len(mid) >= 80:
                    continue
                if parent_at is not None and not is_current(parent_at):
                    continue
                acc.append(mid)
                if parent_at is not None:
                    stamps[mid.lower()] = stamp_iso(parent_at)
            if k in ("selectedmodelbyrole",) and isinstance(val, dict):
                for role, mid in val.items():
                    if isinstance(mid, str) and mid.strip() and str(role).lower() in ("chat", "edit", "apply", "agent", "reason", "reasoning"):
                        acc.append(mid.strip())
            walk_models(val, acc, stamps, skip_keys)
    elif isinstance(obj, list):
        for item in obj: walk_models(item, acc, stamps, skip_keys)

def read_selected_models(running=None):
    running = {str(n).lower() for n in (running or [])}
    home = Path.home()
    paths = [
        home / "Library/Application Support/Cursor/User/settings.json",
        home / "Library/Application Support/Code/User/settings.json",
        home / "AppData/Roaming/Cursor/User/settings.json",
        home / "AppData/Roaming/Code/User/settings.json",
        home / ".continue/config.json",
        home / ".claude.json",
        home / ".cursor/argv.json",
    ]
    found, seen = [], set()
    for path in paths:
        data = read_json_file(path)
        if data is None: continue
        names, stamps = [], {}
        walk_models(data, names, stamps)
        via = "Cursor" if "Cursor" in str(path) else ("Continue" if "continue" in str(path).lower() else ("Claude" if "claude" in str(path).lower() else "config"))
        if via.lower() not in running and via != "config":
            continue
        claude_file = "claude" in str(path).lower()
        for mid in names:
            if mid.lower() in seen or len(mid) > 120: continue
            at = stamps.get(mid.lower())
            if claude_file and not is_current(at):
                continue
            seen.add(mid.lower())
            provider = "Anthropic" if "claude" in mid.lower() else (
                "OpenAI" if mid.lower().startswith(("gpt-", "o1", "o3", "o4")) else (
                "xAI" if "grok" in mid.lower() else (
                "NVIDIA" if "nvidia" in mid.lower() or "nemotron" in mid.lower() else (
                "Ollama" if ":" in mid and "/" not in mid else "config"))))
            row = model_row(mid, mid, provider, "datacenter" if provider != "Ollama" else "local",
                            "configured", "config", via=via, at=at)
            if row: found.append(row)
    found.extend(read_recent_sessions())
    return found

def read_recent_sessions():
    root = Path.home() / ".claude" / "projects"
    if not root.is_dir():
        return []
    cutoff = time.time() - CURRENT_HOURS * 3600
    found, seen = [], set()
    try:
        files = sorted((p for p in root.rglob("*.jsonl") if p.is_file()),
                       key=lambda p: p.stat().st_mtime, reverse=True)
    except OSError:
        return []
    for fp in files[:12]:
        try:
            mtime = fp.stat().st_mtime
            if mtime < cutoff: continue
            lines = fp.read_text(encoding="utf-8", errors="ignore").splitlines()[-80:]
        except OSError:
            continue
        for line in reversed(lines):
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            msg = obj.get("message") if isinstance(obj.get("message"), dict) else {}
            mid = msg.get("model") or obj.get("model")
            if not isinstance(mid, str): continue
            mid = mid.strip()
            if not mid or mid.startswith("<") or len(mid) > 120: continue
            ts = obj.get("timestamp") or mtime
            if not is_current(ts): continue
            key = mid.lower()
            if key in seen: break
            seen.add(key)
            provider = "Anthropic" if "claude" in key else "config"
            row = model_row(mid, mid, provider, "datacenter", "in_use", "session",
                            via="Claude", at=stamp_iso(ts) or now_iso())
            if row: found.append(row)
            break
    return found

def aws_headers(method, url, region, service, access, secret, payload=b""):
    parsed = urlparse(url)
    host = parsed.netloc
    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    datestamp = now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(payload).hexdigest()
    canonical_headers = f"host:{host}\nx-amz-date:{amz_date}\n"
    signed_headers = "host;x-amz-date"
    canonical_request = f"{method}\n{parsed.path or '/'}\n{parsed.query}\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
    scope = f"{datestamp}/{region}/{service}/aws4_request"
    string_to_sign = f"AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{hashlib.sha256(canonical_request.encode()).hexdigest()}"
    def sign(key, msg): return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()
    k_date = sign(("AWS4" + secret).encode("utf-8"), datestamp)
    k_region = hmac.new(k_date, region.encode(), hashlib.sha256).digest()
    k_service = hmac.new(k_region, service.encode(), hashlib.sha256).digest()
    k_signing = hmac.new(k_service, b"aws4_request", hashlib.sha256).digest()
    signature = hmac.new(k_signing, string_to_sign.encode(), hashlib.sha256).hexdigest()
    auth = f"AWS4-HMAC-SHA256 Credential={access}/{scope}, SignedHeaders={signed_headers}, Signature={signature}"
    return {"Authorization": auth, "X-Amz-Date": amz_date, "Host": host}

def probe_cloud(keys):
    found, notes = [], []
    bag = threading.Lock()

    def take(rows, note):
        with bag:
            found.extend(rows)
            if note: notes.append(note)

    def from_list(items, provider, source, host, id_key="id", name_key=None, filter_ids=True):
        out, kept = [], 0
        if not isinstance(items, list):
            return out, 0
        for item in items:
            if not isinstance(item, dict): continue
            mid = str(item.get(id_key) or item.get("name") or item.get("model") or "")
            if filter_ids and not keep_reachable(mid): continue
            label = str(item.get(name_key) or mid) if name_key else mid
            row = model_row(mid, label, provider, "datacenter", "reachable", source, host=host)
            if row:
                out.append(row); kept += 1
            if kept >= 8: break
        return out, len(items)

    def nvidia():
        token = keys.get("nvidia") or ""
        if not token: return
        data = http_json("https://integrate.api.nvidia.com/v1/models",
                         {"Authorization": f"Bearer {token}"}, timeout=4)
        rows, total = from_list(data.get("data") if isinstance(data, dict) else None,
                                "NVIDIA", "nvidia-catalog", "integrate.api.nvidia.com")
        take(rows, f"NVIDIA catalog {total} models." if total else "NVIDIA key seated. Catalog did not answer.")

    def openai():
        token = keys.get("openai") or ""
        if not token: return
        data = http_json("https://api.openai.com/v1/models",
                         {"Authorization": f"Bearer {token}"}, timeout=4)
        rows, total = from_list(data.get("data") if isinstance(data, dict) else None,
                                "OpenAI", "openai-catalog", "api.openai.com")
        take(rows, f"OpenAI catalog {total} models." if total else "OpenAI key seated. Catalog did not answer.")

    def anthropic():
        token = keys.get("anthropic") or ""
        if not token: return
        data = http_json("https://api.anthropic.com/v1/models",
                         {"x-api-key": token, "anthropic-version": "2023-06-01"}, timeout=4)
        rows, total = from_list(data.get("data") if isinstance(data, dict) else None,
                                "Anthropic", "anthropic-catalog", "api.anthropic.com",
                                name_key="display_name", filter_ids=False)
        take(rows, f"Anthropic catalog {total} models." if total else "Anthropic key seated. Catalog did not answer.")

    def xai():
        token = keys.get("xai") or ""
        if not token: return
        data = http_json("https://api.x.ai/v1/models",
                         {"Authorization": f"Bearer {token}"}, timeout=4)
        rows, total = from_list(data.get("data") if isinstance(data, dict) else None,
                                "xAI", "xai-catalog", "api.x.ai", filter_ids=False)
        take(rows, f"xAI catalog {total} models." if total else "xAI key seated. Catalog did not answer.")

    def ollama_cloud():
        token = keys.get("ollama") or ""
        if not token: return
        data = http_json("https://ollama.com/api/tags",
                         {"Authorization": f"Bearer {token}"}, timeout=4)
        rows, total = from_list(data.get("models") if isinstance(data, dict) else None,
                                "Ollama", "ollama-cloud", "ollama.com", filter_ids=False)
        take(rows, f"Ollama cloud {total} models." if total else None)

    def bedrock():
        access, secret = keys.get("awsAccessKeyId") or "", keys.get("awsSecretAccessKey") or ""
        region = keys.get("awsRegion") or "us-east-1"
        if not (access and secret): return
        url = f"https://bedrock.{region}.amazonaws.com/foundation-models"
        try:
            hdrs = aws_headers("GET", url, region, "bedrock", access, secret)
            data = http_json(url, hdrs, timeout=5)
        except (ValueError, OSError):
            data = None
        rows, total = from_list(data.get("modelSummaries") if isinstance(data, dict) else None,
                                "AWS", "bedrock-catalog", f"bedrock.{region}.amazonaws.com",
                                id_key="modelId", name_key="modelName")
        take(rows, f"Bedrock catalog {total} models." if total else "AWS keys seated. Bedrock catalog did not answer.")

    workers = [threading.Thread(target=fn, daemon=True) for fn in (nvidia, openai, anthropic, xai, ollama_cloud, bedrock)]
    for worker in workers: worker.start()
    for worker in workers: worker.join(timeout=6)
    return found, notes

def merge_models(rows):
    rank = {"in_use": 3, "configured": 2, "reachable": 1}
    by_key, by_provider = {}, {}
    for row in rows:
        if not row: continue
        key = (row["provider"].lower(), row["id"].lower())
        prior = by_key.get(key)
        if not prior or rank.get(row["status"], 0) > rank.get(prior["status"], 0):
            by_key[key] = row
        by_provider.setdefault(row["provider"].lower(), []).append(row)
    # A live wire + a *current* named pick for that provider. Never a leftover slot.
    for provider, items in by_provider.items():
        live = [m for m in items if m["status"] == "in_use" and m["source"] == "wire"]
        named = [m for m in items if m.get("status") == "configured" and not str(m["id"]).endswith("-live")
                 and is_current(m.get("at"))]
        if not live or not named: continue
        named.sort(key=lambda m: (0 if m["role"] == "reasoning" else 1))
        chosen = named[0]
        chosen = {**chosen, "status": "in_use", "source": "wire+config",
                  "host": live[0].get("host") or chosen.get("host"),
                  "via": live[0].get("via") or chosen.get("via"),
                  "where": "datacenter", "at": now_iso()}
        by_key[(chosen["provider"].lower(), chosen["id"].lower())] = chosen
        for ghost in live:
            by_key.pop((ghost["provider"].lower(), ghost["id"].lower()), None)
    out = list(by_key.values())
    out = [m for m in out if m.get("status") != "configured" or is_current(m.get("at"))]
    out.sort(key=lambda m: (-rank.get(m["status"], 0), 0 if m["role"] == "reasoning" else 1, m["provider"], m["name"]))
    return out[:40]

def scan_models(keys=None, force_cloud=False, pid_names=None, running=None):
    found = []
    found.extend(probe_ollama())
    found.extend(probe_openai_compat_local())
    found.extend(probe_wire(pid_names or {}))
    found.extend(read_selected_models(running))
    notes = []
    now = time.time()
    with lock: last_cloud = state["cloud_scan_at"]
    use_keys = keys if keys else env_keys()
    has_keys = any(use_keys.get(k) for k in ("nvidia", "openai", "anthropic", "ollama", "xai")) or (
        use_keys.get("awsAccessKeyId") and use_keys.get("awsSecretAccessKey"))
    if has_keys and (force_cloud or keys or now - last_cloud >= CLOUD_EVERY):
        cloud, notes = probe_cloud(use_keys)
        found.extend(cloud)
        with lock: state["cloud_scan_at"] = now
    merged = merge_models(found)
    at = now_iso()
    with lock:
        prior = {(m.get("provider"), m.get("id"), m.get("status")) for m in state["models"]}
        now_set = {(m.get("provider"), m.get("id"), m.get("status")) for m in merged}
        if state["armed"]:
            for item in merged:
                key = (item.get("provider"), item.get("id"), item.get("status"))
                if key in prior: continue
                if item.get("status") != "in_use": continue
                where = "at the datacenter" if item.get("where") == "datacenter" else "on this computer"
                via = f" via {item['via']}" if item.get("via") else ""
                state["ledger"].append({
                    "at": at, "kind": "model", "name": item["provider"],
                    "summary": f"{item['name']} is the {item['role']} model {where}{via}",
                })
            for provider, mid, status in sorted(prior - now_set):
                if status != "in_use": continue
                state["ledger"].append({
                    "at": at, "kind": "model", "name": provider,
                    "summary": f"{mid} is no longer the live {provider} model",
                })
        state["models"] = merged
        state["last_model_scan"] = at
        state["model_note"] = " ".join(notes) if notes else None
        state["ledger"] = state["ledger"][-400:]
    return merged

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
        pid_names = {}
        for item in running:
            for pid in item.get("pids") or []:
                pid_names[str(pid)] = item["name"]
    scan_models(pid_names=pid_names, running=[item["name"] for item in running])
    with lock:
        snap = {"armed": state["armed"], "platform": state["platform"], "machine": state["machine"],
                "running": list(state["running"]), "seen": list(state["seen"]), "ledger": list(state["ledger"][-80:]),
                "models": list(state["models"]), "last_model_scan": state["last_model_scan"],
                "model_note": state["model_note"], "last_scan": state["last_scan"], "note": state["note"],
                "process_count": len(procs)}
    save_ledger(); write_outbox(); push_to_conductor(); return snap

def private_roster(skip):
    path = HERE / "squadron.local.json"
    if not path.exists():
        return []
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(rows, list):
        return []
    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or "").strip()
        if not name or name.lower() in skip:
            continue
        status = str(row.get("status") or "empty")
        if status not in ("clean", "review", "blocked", "empty", "dark"):
            status = "empty"
        out.append({
            "id": str(row.get("id") or name.lower().replace(" ", "-")),
            "name": name,
            "title": str(row.get("title") or "Private roster"),
            "division": str(row.get("division") or "Private"),
            "wing": str(row.get("wing") or "Private"),
            "focus": str(row.get("focus") or ""),
            "mandate": str(row.get("mandate") or ""),
            "domain": str(row.get("domain") or "Private"),
            "shipped": row.get("shipped") or 0,
            "emptyStreak": row.get("emptyStreak") or 0,
            "status": status,
            "queued": row.get("queued") or 0,
            "artifacts": row.get("artifacts") or 0,
            "confidence": row.get("confidence") or 0,
            "verified": False,
            "hoursAgo": row.get("hoursAgo") or 0,
            "minutes": 0,
            "tokens": 0,
            "nextIn": 0,
            "pids": [],
            "lastAt": None,
            "private": True,
        })
    return out

def conductor_snapshot(include_private=True):
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
                           "pids": (live or seen or {}).get("pids", []), "lastAt": last_at, "private": False})
        if include_private:
            skip = {name.lower() for name, _ in CATALOG}
            beings.extend(private_roster(skip))
        models = list(state["models"])
        live_models = [m for m in models if m.get("status") == "in_use"]
        for item in live_models:
            mid = str(item.get("id") or item.get("name") or "model")
            where = "at the datacenter" if item.get("where") == "datacenter" else "on this computer"
            via = f" via {item['via']}" if item.get("via") else ""
            beings.append({
                "id": "model-" + re.sub(r"[^a-z0-9]+", "-", f"{item.get('provider','')}-{mid}".lower()).strip("-"),
                "name": item.get("name") or mid, "title": f"{item.get('provider')} {item.get('role', 'chat')} model",
                "division": "Datacenter" if item.get("where") == "datacenter" else "Honesty Local",
                "wing": "Honesty", "focus": f"{item.get('role', 'chat')} model {where}.",
                "mandate": f"{item.get('name')} is the {item.get('role', 'chat')} model {where}{via}.",
                "domain": "Ops", "shipped": 1, "emptyStreak": 0, "status": "clean", "queued": 0, "artifacts": 1,
                "confidence": 1.0, "verified": True, "hoursAgo": 0, "minutes": 0, "tokens": 0, "nextIn": 0,
                "pids": [], "lastAt": state["last_model_scan"], "private": False,
            })
        live_bits = [f"{m.get('name')} ({m.get('provider')})" for m in live_models]
        standing = f"{len(running)} named program(s) running on {state['machine']}."
        if live_bits:
            standing += " Reasoning model: " + "; ".join(live_bits) + "."
        else:
            standing += " No datacenter model in use right now."
        standing += " Browser tabs are not programs."
        return {"source": "honesty-local", "version": 1, "seated": True, "wing": "Honesty",
                "hook": state["conductor_url"], "armed": state["armed"], "platform": state["platform"],
                "machine": state["machine"], "last_scan": state["last_scan"],
                "conductor_url": state["conductor_url"], "conductor_last_push": state["conductor_last_push"],
                "conductor_last_error": state["conductor_last_error"], "running": list(state["running"]),
                "seen": list(state["seen"]), "models": models, "ledger": list(state["ledger"][-80:]),
                "beings": beings, "note": state["note"], "model_note": state["model_note"],
                "standing": standing}

def write_outbox():
    tmp = OUTBOX.with_suffix(".json.tmp"); tmp.write_text(json.dumps(conductor_snapshot(), indent=2), encoding="utf-8"); tmp.replace(OUTBOX)

def push_to_conductor():
    with lock: url = state["conductor_url"]
    if not url: return
    req = urllib.request.Request(url, data=json.dumps(conductor_snapshot(include_private=False)).encode("utf-8"), method="POST",
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
    lines += ["", "ANSWERING NOW"]
    models = [m for m in (snap.get("models") or []) if m.get("status") == "in_use"]
    if not models: lines.append("  None answering right now.")
    else:
        for item in models:
            where = "datacenter" if item.get("where") == "datacenter" else "this computer"
            via = f" via {item['via']}" if item.get("via") else ""
            lines.append(f"  {item.get('name')} · {item.get('provider')} · {item.get('status')} · {item.get('role')} · {where}{via}")
    if snap.get("model_note"): lines += ["", snap["model_note"]]
    return "\n".join(lines) + "\n"

PAGE = """<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>Honesty Local</title>
<style>body{margin:0;background:#0e0d0b;color:#efece4;font:16px/1.5 system-ui} .w{max-width:960px;margin:0 auto;padding:28px 20px} a{color:#8a9188}</style></head>
<body><div class=\"w\"><p>Honesty Local</p><h1>Above all else.</h1>
<p>Programs on this computer. Which model is answering. A browser tab is not Claude.</p>
<p><a href=\"/conductor\">Conductor rail</a> · <a href=\"/api/status\">status</a> · <a href=\"/api/models\">models</a> · <a href=\"/api/report.txt\">report</a></p>
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
                                  "models": list(state["models"]), "model_note": state["model_note"],
                                  "last_model_scan": state["last_model_scan"],
                                  "ledger": list(state["ledger"][-80:]), "last_scan": state["last_scan"], "note": state["note"]}); return
        if path == "/api/models":
            with lock: self._json({"models": list(state["models"]), "note": state["model_note"],
                                  "last_scan": state["last_model_scan"], "machine": state["machine"]}); return
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
        if path == "/api/models/probe":
            keys = {
                "nvidia": str(body.get("nvidia") or "").strip(),
                "openai": str(body.get("openai") or "").strip(),
                "anthropic": str(body.get("anthropic") or "").strip(),
                "ollama": str(body.get("ollama") or "").strip(),
                "xai": str(body.get("xai") or "").strip(),
                "awsAccessKeyId": str(body.get("awsAccessKeyId") or "").strip(),
                "awsSecretAccessKey": str(body.get("awsSecretAccessKey") or "").strip(),
                "awsRegion": str(body.get("awsRegion") or "").strip() or "us-east-1",
            }
            merged_keys = env_keys()
            for key, val in keys.items():
                if val: merged_keys[key] = val
            with lock:
                pid_names = {}
                running_names = [item["name"] for item in state["running"]]
                for item in state["running"]:
                    for pid in item.get("pids") or []:
                        pid_names[str(pid)] = item["name"]
            models = scan_models(keys=merged_keys, force_cloud=True, pid_names=pid_names, running=running_names)
            with lock:
                self._json({"ok": True, "models": list(state["models"]) if models is not None else models,
                            "note": state["model_note"], "last_scan": state["last_model_scan"]})
            return
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

def self_test():
    assert host_provider("api.anthropic.com") == "Anthropic"
    assert host_provider("api.openai.com") == "OpenAI"
    assert host_provider("integrate.api.nvidia.com") == "NVIDIA"
    assert host_provider("bedrock-runtime.us-east-1.amazonaws.com") == "AWS"
    assert host_provider("chrome.google.com") is None
    assert match_ai({"name": "grok", "cmd": "grok"}) == "Grok"
    assert match_ai({"name": "python3", "cmd": "python3 /Users/EverettN/mcp-media-ingestor/grok_seat.py"}) is None
    assert model_role("o3-mini") == "reasoning"
    assert model_role("claude-sonnet-4-5") == "reasoning"
    assert model_role("meta/llama-3.1-nemotron-70b-instruct") == "reasoning"
    assert model_role("whisper-1") == "chat"
    assert keep_reachable("gpt-4o")
    now = now_iso()
    merged = merge_models([
        model_row("anthropic-live", "Anthropic live session", "Anthropic", "datacenter", "in_use", "wire",
                  host="api.anthropic.com", via="Cursor", at=now),
        model_row("claude-sonnet-4-5", "claude-sonnet-4-5", "Anthropic", "datacenter", "configured", "config",
                  via="Cursor", at=now),
        model_row("whisper-1", "whisper-1", "OpenAI", "datacenter", "reachable", "openai-catalog",
                  host="api.openai.com"),
    ])
    names = [m["id"] for m in merged]
    assert "claude-sonnet-4-5" in names
    chosen = next(m for m in merged if m["id"] == "claude-sonnet-4-5")
    assert chosen["status"] == "in_use"
    assert chosen["source"] == "wire+config"
    assert "anthropic-live" not in names
    stale_at = datetime.fromtimestamp(time.time() - 50 * 3600, timezone.utc).isoformat()
    leftover = merge_models([
        model_row("anthropic-live", "Anthropic live session", "Anthropic", "datacenter", "in_use", "wire",
                  host="api.anthropic.com", via="Claude", at=now),
        model_row("claude-fable-5", "claude-fable-5", "Anthropic", "datacenter", "configured", "config",
                  via="Claude", at=stale_at),
    ])
    leftover_ids = [m["id"] for m in leftover]
    assert "anthropic-live" in leftover_ids
    assert "claude-fable-5" not in leftover_ids
    assert leftover[0]["status"] == "in_use"
    names = []
    walk_models({
        "cachedGrowthBookFeatures": {"model": "claude-opus-4-7"},
        "lastModelUsage": {"claude-fable-5": {"inputTokens": 1}},
        "projects": {"/Users/EverettN/BROCKSTON": {"lastModelUsage": {"claude-fable-5": {}}}},
        "clientDataCacheSlots": {
            "old": {"model": "claude-fable-5-1", "at": int((time.time() - 8 * 3600) * 1000)},
            "now": {"model": "claude-sonnet-4-5", "at": int(time.time() * 1000)},
        },
    }, names)
    assert "claude-opus-4-7" not in names
    assert "claude-fable-5" not in names
    assert "claude-fable-5-1" not in names
    assert "claude-sonnet-4-5" in names
    assert is_current(now)
    assert not is_current(stale_at)
    sys.stdout.write("honesty-local self-test ok\n")
    return 0

def main():
    if "--self-test" in sys.argv: return self_test()
    load_ledger(); snap = scan_once()
    if "--once" in sys.argv: sys.stdout.write(report_text(snap)); return 0
    threading.Thread(target=loop, daemon=True).start()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}"
    sys.stderr.write(
        f"Honesty Local is on this computer.\n"
        f"Local bind {HOST}:{PORT}\n"
        f"Desk bind 0.0.0.0:8788\n"
        f"Conductor rail: {url}/conductor\n"
        f"Yours. No paywall.\n"
    )
    try: webbrowser.open(f"{url}/conductor" if "--conductor" in sys.argv else url)
    except Exception: pass
    try: httpd.serve_forever()
    except KeyboardInterrupt: return 0
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
