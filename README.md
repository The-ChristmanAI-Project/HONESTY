# Honesty Above All Else

Home-station watch. Yours. No paywall. No account required to run the local half.

Honesty is a two-part system that keeps a ledger of what moved on the home station: GitHub activity, seated mail and wire channels, named AI systems, and — when Honesty Local is running on the computer — which AI desktop programs are actually in the process list.

**Repo:** [github.com/EverettNC/HONESTY](https://github.com/EverettNC/HONESTY)

This repository is the source. It is not a subscription.

---

## Two halves, one watch

Leave both running. They are one watch, not two products.

| Half | Lives | What it can see | What it cannot see |
|---|---|---|---|
| **The desk** | This web app (`src/`) | GitHub events, seated mail/wire, folder picks you grant, the ledger, reports, named AIs | Operating-system processes. A browser is not allowed to run `ps` or `tasklist`. |
| **Honesty Local** | `honesty-local/` on the home station | The process list on *this* computer. Desktop Claude, Cursor, Copilot, ChatGPT app, Ollama, and the rest of the catalog. | Browser tabs. `claude.ai` in Chrome is still Chrome. |

When Honesty Local is up, the desk polls `http://127.0.0.1:8787` and shows **Local seated**. Named AIs that appear in the process list are marked **running** from the computer, not from a guess.

---

## What Honesty is

- A ledger you own.
- A station page that arms a watch and keeps reports you choose to keep.
- A named-AI tracker that follows systems across GitHub, the wire, and (with Local) the process list.
- A local Python program with no dependencies beyond the standard library.

## What Honesty is not

- Not a kernel driver. It does not hook every file open on the operating system.
- Not a phone tap. It does not silently read SMS, cellular calls, or other people’s devices.
- Not a browser-tab inspector. Web sessions in Chrome / Safari / Edge do not show as separate programs.
- Not a paywalled service. There is no lock, no seat license, no “pro tier” inside this repo.
- Not an org-owned product. Source lives under **EverettNC**. The Christman AI Project org needs admin if you want a copy there too.

---

## Quick start — Honesty Local (the computer)

This is the half that answers “who is running?”

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
```

The program binds **only** to `127.0.0.1:8787` and opens that address in your browser. It is not published to the network.

### What you get

- Local page at [http://127.0.0.1:8787](http://127.0.0.1:8787)
- Armed scan every 8 seconds while the watch is on
- Ledger written next to the script as `honesty-ledger.json`
- Downloadable text report at `/api/report.txt`

### Local API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Local desk HTML |
| `GET` | `/api/status` | Current snapshot (JSON) |
| `POST` | `/api/scan` | Scan now |
| `POST` | `/api/arm` | Body `{ "armed": true \| false }` |
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

The desk is the Vite + React station. It keeps GitHub, the wire, people, reports, and the AI list.

### Need

- Node.js 22+ recommended
- npm

### Run

```bash
npm install
npm run dev
```

Dev server: `http://0.0.0.0:8080`

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
| `/` | Desk | Home of the watch. Arm it. See whether Local is seated. |
| `/station` | Station | Home-station settings, Honesty Local download / seat, poll interval, GitHub user and org. |
| `/systems` | AIs | Named AI systems. Scan, follow, mark running. Shows Local process hits when seated. |
| `/ledger` | Ledger | Every recorded movement. |
| `/wire` | Wire | Seated communication channels. |
| `/people` | People | Who touched what. |
| `/reports` | Reports | Keep a report. |

### Tracker labels on AIs

| Label | Means |
|---|---|
| **running** | Honesty Local saw the program in the process list, or you marked it by hand. |
| **following** | The watch is armed on that name. |
| **seen** | It has events in the ledger. |
| **named** | You put it on the list. No events yet. |

The desk **cannot** invent “running” from a website visit. If Local is down, the desk says so.

### How the desk seats Local

`src/lib/local-agent.ts` probes `http://127.0.0.1:8787/api/status`. On success it:

1. Marks Local seated (machine + platform).
2. Copies running programs onto the named AI list (`runningFrom: "local"`).
3. Writes Local start/stop rows into the ledger with source `local`.

If Local goes quiet, the desk keeps the wire and tells you Local went quiet.

### Folder scan

The desk can look at a folder you pick (File System Access API). That is evidence on disk — path names, aliases in the tree — not a live process list. Granting a folder is opt-in. The browser will not walk the whole home drive unless you choose that folder.

### GitHub and the wire

The desk pulls GitHub for the configured user (`EverettNC` by default) and optional org (The Christman AI Project). Mail, calendar, Outlook, and Teams rows exist as wire sources. They only fill when those channels are seated. Nothing is scraped from a phone in the background.

Refresh GitHub permission if pulls fail:

- OAuth apps: [github.com/settings/applications](https://github.com/settings/applications)
- Installed apps: [github.com/settings/installations](https://github.com/settings/installations)

Grant **EverettNC**. Org access needs org admin.

---

## Both at once

1. Start Honesty Local on the home station (`Start Honesty.bat` / `.command`).
2. Leave the Local window running. Confirm [http://127.0.0.1:8787](http://127.0.0.1:8787) says **ARMED**.
3. Open the desk.
4. Station should read **Local seated**.
5. AIs that are desktop programs show **running** with process counts and PIDs from Local.
6. Keep a report from either half when you want a snapshot on paper.

That is the whole watch.

---

## Repository layout

```
HONESTY/
  README.md                 # this file
  package.json              # desk scripts and dependencies
  vite.config.ts
  honesty-local/            # process watcher — run on the computer
  src/
    routes/                 # desk pages
    lib/
      local-agent.ts        # desk ↔ Local bridge
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
3. **Local only sees this computer.** It binds to localhost. It does not scan the office, the phone, or someone else’s laptop.
4. **The ledger is a record you keep, not a warrant.** Start/stop rows mean “appeared in / left the process list,” not intent.
5. **Folder pick is consent.** No silent whole-disk crawl from the desk.
6. **GitHub rate limits and org policy apply.** Personal repo pushes land on EverettNC. Org repos need org admin.

---

## Ownership

- Owner: Everett / The Christman AI Project
- Source: `EverettNC/HONESTY`
- Honesty Local: no account, no telemetry, no paywall
- The desk source is in this repo. Run it yourself.

Yours.

---

## License posture

Use it on the home station you own. Do not point Honesty Local at a machine you do not have the right to watch. The name is the rule: honesty above all else.
