"""Screen recording bench — hear the tape, watch the picture, compare.

Filament on :4850 hears. Lucent on :9785 holds the light. ffmpeg pulls
frames. No cloud eye. No invented picture. No invented speech.
"""
from __future__ import annotations
import json, os, shutil, subprocess, urllib.error, urllib.request
from datetime import datetime, timezone
from pathlib import Path

FILAMENT = os.environ.get("FILAMENT_STT", "http://127.0.0.1:4850/stt")
LUCENT = os.environ.get("LUCENT_LIVE", "http://127.0.0.1:9785/api/lucent/live")
EVIDENCE = Path(os.environ.get("BENCH_EVIDENCE", "/Volumes/ELEMENTS/EVIDENCE"))


def which_ffmpeg():
    for name in ("ffmpeg", "ffprobe"):
        if not shutil.which(name):
            raise RuntimeError(f"{name} is not on this computer.")
    return shutil.which("ffmpeg"), shutil.which("ffprobe")


def frame_interval(duration):
    dur = float(duration or 0)
    if dur <= 0: return 2.0
    if dur < 60: return 2.0
    if dur < 600: return 8.0
    return 20.0


def frame_cap(duration):
    dur = float(duration or 0)
    n = int(dur / frame_interval(dur)) if dur else 0
    return max(1, min(24, n or 1))


def probe_media(path):
    _, ffprobe = which_ffmpeg()
    raw = subprocess.check_output(
        [ffprobe, "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",
         "-of", "json", str(path)],
        stderr=subprocess.DEVNULL,
    )
    data = json.loads(raw.decode("utf-8"))
    duration = float((data.get("format") or {}).get("duration") or 0)
    has_video = has_audio = False
    width = height = 0
    for stream in data.get("streams") or []:
        kind = stream.get("codec_type")
        if kind == "video":
            has_video = True
            width = int(stream.get("width") or 0)
            height = int(stream.get("height") or 0)
        if kind == "audio":
            has_audio = True
    return {"duration": duration, "has_video": has_video, "has_audio": has_audio, "width": width, "height": height}


def extract_wav(src, dest):
    ffmpeg, _ = which_ffmpeg()
    proc = subprocess.run(
        [ffmpeg, "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", str(dest)],
        capture_output=True, check=False,
    )
    if proc.returncode != 0 or not Path(dest).is_file() or Path(dest).stat().st_size < 64:
        err = (proc.stderr or b"").decode("utf-8", errors="ignore")[-400:]
        raise RuntimeError(err or "ffmpeg could not pull audio from that recording.")


def extract_frames(src, dest_dir, duration):
    ffmpeg, _ = which_ffmpeg()
    interval = frame_interval(duration)
    cap = frame_cap(duration)
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    pattern = dest / "frame-%03d.jpg"
    proc = subprocess.run(
        [ffmpeg, "-y", "-i", str(src), "-vf", f"fps=1/{interval},scale=640:-2",
         "-frames:v", str(cap), "-q:v", "5", str(pattern)],
        capture_output=True, check=False,
    )
    frames = sorted(dest.glob("frame-*.jpg"))
    if proc.returncode != 0 and not frames:
        err = (proc.stderr or b"").decode("utf-8", errors="ignore")[-400:]
        raise RuntimeError(err or "ffmpeg could not pull frames from that recording.")
    out = []
    for i, path in enumerate(frames[:cap]):
        out.append({"at": round(i * interval, 2), "path": str(path)})
    return out


def hear_wav(path):
    data = Path(path).read_bytes()
    req = urllib.request.Request(
        FILAMENT, data=data, method="POST",
        headers={"Content-Type": "audio/wav", "User-Agent": "Honesty-Local"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            body = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore")
        try: body = json.loads(raw)
        except json.JSONDecodeError:
            raise RuntimeError(f"Filament returned {exc.code}. The ear did not hear.") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RuntimeError("Filament on 4850 did not answer. Seat the ear.") from exc
    if not isinstance(body, dict):
        raise RuntimeError("Filament sent a body that is not a record.")
    if body.get("ok") is False:
        raise RuntimeError(str(body.get("error") or "Filament could not hear that tape."))
    words = []
    for item in body.get("words") or []:
        if not isinstance(item, dict): continue
        token = str(item.get("word") or item.get("text") or "").strip()
        if not token: continue
        start = float(item.get("start") or item.get("begin") or 0)
        end = float(item.get("end") or item.get("start") or start)
        words.append({"word": token, "start": start, "end": end})
    text = str(body.get("text") or body.get("transcript") or "").strip()
    return {"text": text, "words": words, "engine": body.get("engine") or "vosk", "note": body.get("note")}


def words_near(words, at, window=2.5):
    said = []
    for item in words:
        mid = (item["start"] + item["end"]) / 2
        if item["start"] <= at <= item["end"] or abs(mid - at) <= window:
            said.append(item["word"])
    return " ".join(said).strip()


def align(words, frames):
    rows = []
    for frame in frames:
        said = words_near(words, frame["at"])
        fit = "match"
        if said and not frame.get("seen"):
            fit = "said-no-picture"
        elif not said and frame.get("seen"):
            fit = "picture-no-speech"
        elif said and frame.get("seen"):
            fit = "compare"
        else:
            fit = "quiet"
        rows.append({
            "at": frame["at"],
            "said": said,
            "seen": frame.get("seen") or "",
            "fit": fit,
        })
    return rows


def jpeg_size(path):
    data = Path(path).read_bytes()
    i = 0
    n = len(data)
    while i < n - 8:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            height = int.from_bytes(data[i + 5:i + 7], "big")
            width = int.from_bytes(data[i + 7:i + 9], "big")
            return width, height
        if marker == 0xD8 or marker == 0x01 or (0xD0 <= marker <= 0xD9):
            i += 2
            continue
        if i + 3 >= n:
            break
        length = int.from_bytes(data[i + 2:i + 4], "big")
        i += 2 + length
    return 0, 0


def gray_thumb(path):
    ffmpeg, _ = which_ffmpeg()
    proc = subprocess.run(
        [ffmpeg, "-v", "error", "-i", str(path), "-vf", "scale=160:90", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"],
        capture_output=True, check=False,
    )
    return proc.stdout if proc.returncode == 0 else b""


def motion(prev, now):
    if not prev or not now or len(prev) != len(now):
        return 0.0
    step = 4
    total = 0
    n = 0
    for i in range(0, len(now), step):
        total += abs(now[i] - prev[i])
        n += 1
    return (total / n / 255.0) if n else 0.0


def lucent_hold(path, kind="file"):
    import base64
    raw = Path(path).read_bytes()
    b64 = base64.b64encode(raw).decode("ascii")
    if len(b64) > 400_000:
        b64 = b64[:400_000]
    width, height = jpeg_size(path)
    payload = json.dumps({
        "seeing": True,
        "b64": b64,
        "width": width,
        "height": height,
        "kind": kind,
    }).encode("utf-8")
    req = urllib.request.Request(
        LUCENT, data=payload, method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "Honesty-Local"},
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            body = json.loads(res.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, urllib.error.HTTPError) as exc:
        raise RuntimeError("Lucent did not see. The house on 9785 is quiet.") from exc
    if not isinstance(body, dict) or body.get("ok") is False:
        raise RuntimeError(str((body or {}).get("error") or "Lucent refused that frame."))
    if not body.get("seeing"):
        raise RuntimeError("Lucent took the frame and did not mark seeing.")
    return body


def watch_with_lucent(frames, words):
    watch = []
    lines = []
    prev = None
    moved_n = 0
    held_n = 0
    for frame in frames:
        live = lucent_hold(frame["path"], kind="file")
        gray = gray_thumb(frame["path"])
        delta = motion(prev, gray) if prev else 0.0
        prev = gray
        moved = delta > 0.04
        if moved:
            moved_n += 1
            motion_bit = "picture moved"
        else:
            held_n += 1
            motion_bit = "picture held"
        w = live.get("width") or 0
        h = live.get("height") or 0
        said = words_near(words, frame["at"])
        seen = f"Lucent held {w}×{h} file light · {motion_bit}"
        watch.append({"at": frame["at"], "seen": seen})
        if said and moved:
            lines.append(f"At {frame['at']:.1f}s Filament heard “{said}” while Lucent's picture moved.")
        elif said and not moved:
            lines.append(f"At {frame['at']:.1f}s Filament heard “{said}” while Lucent's picture held.")
        elif moved:
            lines.append(f"At {frame['at']:.1f}s Lucent saw the picture move. No speech.")
        else:
            lines.append(f"At {frame['at']:.1f}s Lucent held still light. No speech.")
    breakdown = (
        f"Lucent held {len(frames)} frame{'' if len(frames)==1 else 's'} of this recording. "
        f"{moved_n} moved. {held_n} held. Filament heard the tape. "
        "Lucent does not invent a scene. This is speech against the light that actually landed.\n\n"
        + "\n".join(lines)
    )
    return {"watch": watch, "breakdown": breakdown}


def pick_ollama_vision():
    try:
        with urllib.request.urlopen(OLLAMA + "/api/tags", timeout=2) as res:
            data = json.loads(res.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None
    for item in data.get("models") or []:
        name = str((item or {}).get("name") or (item or {}).get("model") or "").lower()
        if any(mark in name for mark in VISION_MARK):
            return str(item.get("name") or item.get("model"))
    return None


def watch_with_xai(frames, transcript, key):
    parts = [{
        "type": "text",
        "text": (
            "You are watching a screen recording on Everett's home station. "
            "The audio transcript with times is below. Each image is a frame at the stamped second. "
            "Describe only what you see. Compare what was said at that time to what is on screen. "
            "Call mismatches, silence over a changing screen, speech over a frozen screen, errors, tools, people. "
            "Do not invent. If a frame is unreadable, say unreadable.\n\n"
            f"TRANSCRIPT:\n{transcript or '(no speech heard)'}\n\n"
            "Reply JSON only: {\"watch\":[{\"at\":0,\"seen\":\"...\"}],"
            "\"breakdown\":\"full 360 comparison of audio vs picture\"}"
        ),
    }]
    for frame in frames:
        raw = Path(frame["path"]).read_bytes()
        import base64
        b64 = base64.b64encode(raw).decode("ascii")
        parts.append({"type": "text", "text": f"Frame at {frame['at']} seconds."})
        parts.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
    payload = json.dumps({
        "model": "grok-4.5",
        "messages": [{"role": "user", "content": parts}],
        "temperature": 0.1,
    }).encode("utf-8")
    req = urllib.request.Request(
        XAI_CHAT, data=payload, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}", "User-Agent": "Honesty-Local"},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            body = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # Try a vision-tagged model if 4-fast rejects images.
        payload = json.dumps({
            "model": "grok-2-vision-1212",
            "messages": [{"role": "user", "content": parts}],
            "temperature": 0.1,
        }).encode("utf-8")
        req = urllib.request.Request(
            XAI_CHAT, data=payload, method="POST",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}", "User-Agent": "Honesty-Local"},
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as res:
                body = json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as exc2:
            raise RuntimeError(f"xAI would not watch ({exc2.code}).") from exc2
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RuntimeError("xAI did not answer.") from exc
    text = (((body.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    return parse_watch_json(text, frames)


def watch_with_ollama(frames, transcript, model):
    import base64
    images = [base64.b64encode(Path(f["path"]).read_bytes()).decode("ascii") for f in frames]
    stamps = ", ".join(f"{f['at']}s" for f in frames)
    prompt = (
        "Screen recording frames at: " + stamps + ".\n"
        "Audio transcript:\n" + (transcript or "(no speech heard)") + "\n"
        "Describe each frame. Compare speech to picture. JSON only: "
        '{"watch":[{"at":0,"seen":"..."}],"breakdown":"..."}'
    )
    payload = json.dumps({
        "model": model, "stream": False,
        "messages": [{"role": "user", "content": prompt, "images": images}],
    }).encode("utf-8")
    req = urllib.request.Request(OLLAMA + "/api/chat", data=payload, method="POST",
                                 headers={"Content-Type": "application/json", "User-Agent": "Honesty-Local"})
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            body = json.loads(res.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, urllib.error.HTTPError) as exc:
        raise RuntimeError("Ollama vision did not answer.") from exc
    text = str(((body.get("message") or {}).get("content")) or "").strip()
    return parse_watch_json(text, frames)


def parse_watch_json(text, frames):
    blob = text
    start, end = blob.find("{"), blob.rfind("}")
    data = {}
    if start >= 0 and end > start:
        try:
            data = json.loads(blob[start:end + 1])
        except json.JSONDecodeError:
            data = {}
    watch = []
    listed = data.get("watch") if isinstance(data, dict) else None
    if isinstance(listed, list):
        by_at = {}
        for item in listed:
            if not isinstance(item, dict): continue
            try: at = float(item.get("at") or 0)
            except (TypeError, ValueError): continue
            by_at[round(at, 2)] = str(item.get("seen") or "").strip()
        for frame in frames:
            watch.append({"at": frame["at"], "seen": by_at.get(frame["at"]) or by_at.get(round(frame["at"], 1)) or ""})
    if not any(row["seen"] for row in watch):
        # Model spoke prose. Keep it as the breakdown; do not invent per-frame sight.
        watch = [{"at": frame["at"], "seen": ""} for frame in frames]
    breakdown = ""
    if isinstance(data, dict):
        breakdown = str(data.get("breakdown") or "").strip()
    if not breakdown:
        breakdown = blob.strip()
    return {"watch": watch, "breakdown": breakdown}


def evidence_bag(filename):
    volume = Path("/Volumes/ELEMENTS")
    if not volume.exists():
        raise RuntimeError("ELEMENTS is not mounted. Recordings live on /Volumes/ELEMENTS/EVIDENCE.")
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    stem = Path(filename or "recording").stem[:80] or "recording"
    bag = EVIDENCE / f"{stamp}_{stem}"
    bag.mkdir(parents=True, exist_ok=False)
    return bag


def process_recording(raw, filename, xai_key=""):
    which_ffmpeg()
    suffix = Path(filename or "tape.mp4").suffix or ".mp4"
    work = evidence_bag(filename)
    src = work / f"original{suffix}"
    wav = work / "heard.wav"
    frames_dir = work / "frames"
    src.write_bytes(raw)
    meta = probe_media(src)
    if not meta["has_audio"] and not meta["has_video"]:
        raise RuntimeError("That file has no audio and no picture.")
    heard = {"text": "", "words": [], "engine": None, "note": None}
    if meta["has_audio"]:
        extract_wav(src, wav)
        heard = hear_wav(wav)
    frames = []
    if meta["has_video"]:
        frames = extract_frames(src, frames_dir, meta["duration"])
    watched = False
    watcher = None
    watch_rows = [{"at": f["at"], "seen": ""} for f in frames]
    breakdown = ""
    watch_error = None
    if frames:
        try:
            result = watch_with_lucent(frames, heard.get("words") or [])
            watcher = "Lucent"
            watch_rows = result["watch"]
            breakdown = result["breakdown"]
            watched = True
            for frame, row in zip(frames, watch_rows):
                frame["seen"] = row.get("seen") or ""
        except RuntimeError as exc:
            watch_error = str(exc)
    compare = align(heard.get("words") or [], frames)
    packet = {
        "ok": True,
        "filename": Path(filename or "recording").name,
        "duration": meta["duration"],
        "width": meta["width"],
        "height": meta["height"],
        "has_audio": meta["has_audio"],
        "has_video": meta["has_video"],
        "heard": heard.get("text") or "",
        "words": heard.get("words") or [],
        "ear": heard.get("engine"),
        "ear_note": heard.get("note"),
        "watched": watched,
        "watcher": watcher,
        "watch_error": watch_error,
        "watch": watch_rows,
        "compare": compare,
        "breakdown": breakdown,
        "frames": len(frames),
        "disk": str(work),
    }
    (work / "packet.json").write_text(json.dumps(packet, indent=2), encoding="utf-8")
    if packet["heard"]:
        (work / "transcript.txt").write_text(packet["heard"] + "\n", encoding="utf-8")
    if packet["breakdown"]:
        (work / "breakdown.txt").write_text(packet["breakdown"] + "\n", encoding="utf-8")
    return packet


def self_test():
    assert frame_interval(20) == 2.0
    assert frame_interval(120) == 8.0
    assert frame_interval(1200) == 20.0
    assert frame_cap(10) >= 1
    rows = align(
        [{"word": "hello", "start": 1.0, "end": 1.4}, {"word": "desk", "start": 1.4, "end": 1.8}],
        [{"at": 1.2, "seen": "Honesty desk"}, {"at": 20.0, "seen": "empty terminal"}],
    )
    assert rows[0]["said"] == "hello desk"
    assert rows[1]["fit"] == "picture-no-speech"
    assert str(EVIDENCE) == os.environ.get("BENCH_EVIDENCE", "/Volumes/ELEMENTS/EVIDENCE")
    return 0
