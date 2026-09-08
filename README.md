# Honesty Above All Else

Home-station watch. Yours. No paywall. No account required to run the local half.

Honesty is a two-part system that keeps a ledger of what moved on the home station: GitHub activity, mail, calls, and texts, named AI systems, and — when Honesty Local is running on the computer — which AI desktop programs are in the process list **and which model is answering** (on this computer, or on Anthropic / NVIDIA / OpenAI / AWS).

**Public source:** [The-ChristmanAI-Project/HONESTY](https://github.com/The-ChristmanAI-Project/HONESTY)

This repository is the source people clone. It is not a subscription. Everett’s private station copy is not this download.

---

## Two halves, one watch

Leave both running. They are one watch, not two products.

| Half | Lives | What it can see | What it cannot see |
|---|---|---|---|
| **The desk** | This web app (`src/`). Client face on **8788**. | GitHub events, mail, calls, texts, folder picks you grant, the ledger, reports, named AIs, unknown people | Operating-system processes. A browser is not allowed to run `ps` or `tasklist`. |
| **Honesty Local** | `honesty-local/` on the home station. **8787**. | The process list on *this* computer. Loaded local models (Ollama, NIM). The model at the company computers when a live session or a seated key is present. | Browser tabs. `claude.ai` in Chrome is still Chrome. |

When Honesty Local is up, the desk polls `http://127.0.0.1:8787`. The desk splits **on your computer** (Claude, Cursor, Ollama the apps) from **from their computers** (the model doing the thinking). That is not “people you don’t know.”

**Binds. Count them. Do not round.**

| Half | Bind | What it is |
|---|---|---|
| Honesty Local | `127.0.0.1:8787` | Loopback only. Process watcher, model watch, Conductor hook. |
| The desk | `0.0.0.0:8788` | The web station people see. Not 8080. Never 8080. |

`honesty-local/honesty.py` is one Python 3 file, standard library only. Count the commit you mean. Do not swap dates.

| When | Commit | `wc -l honesty-local/honesty.py` |
|---|---|---|
| 2026-09-03, as first written | `41d9187` | **456** |
| 2026-09-04, after compact restore + Conductor rail | `b9648ad` | **284** |
| Binds printed | `769aa74` | **294** |
| Current (process list + which model is answering) | `8844e16` | **861** |
| Current (only the model answering now) | `5cd79bd` | **984** |
| Current (chair on 8765 is not Grok) | `2d7fe94` | **987** |
| Current (bench hears and watches a recording) | `8c3453c` | **1015** |

---

## What Honesty is

- A ledger you own.
- A station page that arms a watch and keeps reports you choose to keep.
- A named-AI tracker that follows systems across GitHub, mail, calls, and (with Local) the process list and the model answering.
- A local Python program with no dependencies beyond the standard library.
- A people list that does not treat Continue, Ollama, or Claude as strangers. Unknown accounts get **Who is this**.

## What Honesty is not

- Not a kernel driver. It does not hook every file open on the operating system.
- Not a phone tap. It does not silently read SMS, cellular calls, or other people’s devices.
- Not a browser-tab inspector. Web sessions in Chrome / Safari / Edge do not show as separate programs.
- Not a paywalled service. There is no lock, no seat license, no “pro tier” inside this repo.
- Public source is The-ChristmanAI-Project/HONESTY. Only Everett can push `main`.

---

## Quick start — Honesty Local (the computer)

This is the half that answers “who is running?” and “which model is answering?”

### Need

- Python 3 on the machine.
- The `honesty-local` folder from this repo.

### Start

**Windows**

1. Open `honesty-local`.
2. Double-click `Start Honesty.bat`.
3. If Python is missing, install it from [python.org/downloads](https://www.python.org/downloads/), then double-click again.

**macOS**

1. Open `honesty-local`.
2. Double-click `Start Honesty.command`.
3. First time, macOS may ask you to allow it. System Settings → Privacy & Security if it blocks the script.
4. If the file is not executable: `chmod +x "Start Honesty.command"`

**Linux or any terminal**

```bash
cd honesty-local
python3 honesty.py
```

One-shot report, no server:

```bash
python3 honesty.py --once
python3 honesty.py --self-test
```

On the home station the program binds **only** to `127.0.0.1:8787` and opens that address in your browser. It is not published to the network. A container is the one exception: it sets `HONESTY_LOCAL_HOST=0.0.0.0` so the desk on 8788 can reach it.

### Container

One image. Both binds. Honesty Local inside the container reads the **container's** process list, not the Mac's. That is a namespace, not a defect. Run `honesty.py` on the home station when you want the home station's answer.

```bash
docker build -t honesty .
docker run --rm -p 8788:8788 -p 8787:8787 -v honesty-data:/data honesty
```

Desk: `http://127.0.0.1:8788` · Local: `http://127.0.0.1:8787` · ledger in the `honesty-data` volume.

### What you get

- Local page at [http://127.0.0.1:8787](http://127.0.0.1:8787)
- Armed scan every 8 seconds while the watch is on (process list, Ollama/NIM, live company sessions)
- Company catalogs (NVIDIA, OpenAI, Anthropic, xAI, Bedrock) at most once a minute, or when the desk asks
- Ledger written next to the script as `honesty-ledger.json`
- Downloadable text report at `/api/report.txt`

### Local API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Local desk HTML |
| `GET` | `/conductor` | Conductor rail HTML |
| `GET` | `/api/status` | Current snapshot (JSON), including `models` |
| `GET` | `/api/models` | Models only (JSON) |
| `GET` | `/api/conductor` | Conductor-shaped snapshot (JSON) |
| `POST` | `/api/scan` | Scan now |
| `POST` | `/api/models/probe` | Body is seated keys from the desk. Used in memory. Never written to disk. |
| `POST` | `/api/arm` | Body `{ "armed": true \| false }` |
| `POST` | `/api/conductor/seat` | Body `{ "url": "https://…/ingest" }` |
| `POST` | `/api/conductor/ingest` | Conductor ruling into the Local ledger |
| `GET` | `/api/report.txt` | Plain-text report |
| `OPTIONS` | any of the above | CORS preflight so the web desk can read Local |

CORS is open so the hosted desk can call localhost. Mixed-content rules still apply: an `https://` desk may be blocked from `http://127.0.0.1`. If that happens, open the desk on `http://localhost` or use the Local page itself.

### Named AI catalog (process list)

Honesty Local matches process name + command line against:

Claude, Copilot, Cursor, ChatGPT, Grok, Ollama, LM Studio, Gemini, Windsurf, Aider, Continue, Perplexity, Mistral, Codeium

A match is recorded as **start** when it appears and **stop** when it leaves the list. Browser processes are not treated as those products. The alias `continue` is ignored inside a browser command line so a random page does not count as Continue.

### Files next to the script

```
honesty-local/
  honesty.py              # the watcher (Python 3, stdlib only)
  Start Honesty.bat       # Windows launcher
  Start Honesty.command   # macOS launcher
  THIS IS YOURS.txt       # short owner note
  honesty-ledger.json     # written at runtime (not committed)
```

---

## Quick start — the desk (the web half)

The desk is the Vite + React station on **8788**. It keeps GitHub, mail, calls, people, reports, and the AI list. It is the client face.

### Need

- Node.js 22+ recommended
- npm

### Run

```bash
npm install
npm run dev
```

Dev server: `http://0.0.0.0:8788` — loopback bind of the desk. Not 8080. Never 8080. Honesty Local stays on `127.0.0.1:8787`.

Other scripts:

```bash
npm run build         # production build + db migrate
npm run typecheck
npm run lint
npm run test
```

### Pages

| Path | Page | Job |
|---|---|---|
| `/` | Desk | Home of the watch. **On your computer** vs **from their computers**. People you don’t know. |
| `/conductor` | Conductor | Honesty reports here. Named programs on this computer, and which model is answering. |
| `/keys` | Keys | NVIDIA, Ollama, AWS, OpenAI, Anthropic. This browser only. **See which model** sends keys to Local on loopback, in memory, never to disk. |
| `/station` | Station | Home-station settings, poll interval, GitHub user and org. |
| `/systems` | AIs | Named AI systems. Programs here vs the model on the company’s computers. |
| `/ledger` | Ledger | Every recorded movement. |
| `/wire` | Mail & calls | Mail, calls, texts, meetings. Path is still `/wire`. |
| `/people` | People | Who showed up. Unknown accounts get **Who is this**. Continue / Ollama / Claude are AIs, not strangers. |
| `/reports` | Reports | Keep a report. |

### Labels on the desk

| Label | Means |
|---|---|
| **On your computer** | Honesty Local saw the app in the process list (Claude, Cursor, Ollama, Continue, …). |
| **From their computers** | The model doing the thinking (for example `claude-opus-4-7` on Anthropic). |
| **People you don’t know** | A GitHub account, mail address, or name you have not named. Not the cloud AI. **Who is this** looks them up. |
| **Watching / Off** | The watch is on or off. |

The desk **cannot** invent “running” from a website visit. If Local is down, the desk says Honesty Local is off.

### How the desk seats Local

`src/lib/local-agent.ts` probes `http://127.0.0.1:8787/api/status`. On success it:

1. Marks Local seated (machine + platform).
2. Copies running programs onto the named AI list (`runningFrom: "local"`).
3. Writes Local start/stop rows into the ledger with source `local`.

If Local goes quiet, the desk keeps the record and tells you Honesty Local is off.

### Folder scan

The desk can look at a folder you pick (File System Access API). That is evidence on disk — path names, aliases in the tree — not a live process list. Granting a folder is opt-in. The browser will not walk the whole home drive unless you choose that folder.

### GitHub, mail, and calls

The desk pulls GitHub for the configured user (`EverettNC` by default) and optional org (The Christman AI Project). Mail, calendar, Outlook, and Teams rows exist as communication sources. They only fill when those channels are connected. Nothing is scraped from a phone in the background.

Refresh GitHub permission if pulls fail:

- OAuth apps: [github.com/settings/applications](https://github.com/settings/applications)
- Installed apps: [github.com/settings/installations](https://github.com/settings/installations)

Grant **EverettNC**. Org access needs org admin.

---

## Both at once

1. Start Honesty Local on the home station (`Start Honesty.bat` / `.command`).
2. Leave the Local window running. Confirm [http://127.0.0.1:8787](http://127.0.0.1:8787) says **ARMED**.
3. Open the desk at [http://127.0.0.1:8788](http://127.0.0.1:8788).
4. The desk should show programs **on your computer** and models **from their computers**. Conductor is `/conductor`.
5. Desktop programs show process counts and PIDs from Local. The model answering shows under **from their computers**.
6. Keep a report from either half when you want a snapshot on paper.

That is the whole watch.

---

## Repository layout

```
HONESTY/
  README.md                 # this file
  package.json              # desk scripts and dependencies
  vite.config.ts
  honesty-local/            # process + model watcher — run on the computer
  src/
    routes/                 # desk pages (8788)
    lib/
      local-agent.ts        # desk ↔ Local bridge
      datacenter.ts         # on your computer vs their computers
      people.ts             # unknown people + Who is this
      ai-scan.ts            # named AI catalog + matching
      store.ts              # station state (Zustand)
      github.ts             # GitHub pull
      comms.ts / wire-map.ts
      folder-watch.ts
      report.ts
    components/
  public/                   # brand mark and static files
  server/                   # desk server bits
  migrations/
```

Runtime files that should stay off git:

- `honesty-local/honesty-ledger.json`
- local env and preview logs under `.grok/`

---

## Limits, said plainly

1. **A browser cannot list processes.** That is why Honesty Local exists. If someone tells you the website alone can see Claude running on the PC, that is a lie.
2. **A browser tab is not a process named Claude.** Claude in a tab is Chrome / Edge / Safari. Local will not label it Claude.
3. **Local only sees this computer.** It binds to `127.0.0.1:8787` and no other interface. It does not scan the office, the phone, or someone else’s laptop. The desk is `0.0.0.0:8788`.
4. **The ledger is a record you keep, not a warrant.** Start/stop rows mean “appeared in / left the process list,” not intent.
5. **Folder pick is consent.** No silent whole-disk crawl from the desk.
6. **GitHub rate limits and org policy apply.** Public clones use the org repo.

---

## Ownership

- Owner: Everett / The Christman AI Project
- Public source: `The-ChristmanAI-Project/HONESTY`
- Personal home: `EverettNC/HONESTY` — same `main`. Commit once. Push both.
- Honesty Local: no account, no telemetry, no paywall
- The desk source is in this repo. Run it yourself.

Yours.

---

## License

Apache License 2.0. The full text is in `LICENSE`.

Copyright The Christman AI Project.

Use it on the home station you own. Do not point Honesty Local at a machine you do not have the right to watch. The name is the rule: honesty above all else.
