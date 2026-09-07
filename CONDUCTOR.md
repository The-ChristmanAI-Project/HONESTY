# Honesty and The Conductor

They are tied. Not by a kernel hook. By a feed.

## What landed

Honesty Local publishes a Conductor-shaped snapshot and paints it live.

- GET /conductor — live rail, Conductor colors, updates every 8 seconds
- GET /api/conductor — JSON the Maestro board and the desk can pull
- POST /api/conductor/seat — body { "url": "https://.../ingest" }. After every scan Honesty POSTs the snapshot there.
- POST /api/conductor/ingest — Conductor can send a ruling back into the Honesty ledger
- conductor-outbox.json — written next to honesty.py after every scan

The desk page is /conductor. It polls the same feed and broadcasts on channel honesty-conductor.

## What the desk board is

Honesty reports to Conductor. The desk route `/conductor` paints the Honesty Local catalog for **this computer**: running is clean, seen-but-quiet is review, never seen is empty.

It is not a 510(k), not Class II, and not an FDA clearance stamp. It is not a private roster of beings. A private roster file, if present on the home station, stays on that machine and is not in this repository.

## How to run the hook

1. Start Honesty Local (Start Honesty.bat or Start Honesty.command)
2. Open the rail: http://127.0.0.1:8787/conductor
3. Open the desk Conductor page
4. Leave both open. That computer’s named programs show. Running is clean. Seen-but-quiet is review. Never seen is empty.
5. Optional: seat a Conductor ingest URL. Honesty will POST after every scan.

## Honest limits

The Conductor file attached in chat is a bundled page. It has no server and no ingest of its own. Honesty cannot inject itself into that bundle and pretend Maestro grew a new wing.

What is real: the rail, the JSON feed, the outbox file, and a seated hook URL.

Browser tabs still do not count as Claude, ChatGPT, or Grok.
