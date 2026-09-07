import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { belongsToStation, mergeEvents } from "./github.ts";
import { eventsFromLocal, pruneStaleLive, type LocalSnapshot } from "./local-events.ts";
import type { AccessEvent } from "./types.ts";

const owner = "EverettNC";
const org = "The-ChristmanAI-Project";

function localOpen(name: string, at = "2026-09-07T06:00:00.000Z"): AccessEvent {
  return {
    id: `local-live-${name}`,
    at,
    kind: "open",
    source: "local",
    actorLogin: name,
    files: [],
    summary: `${name} is on Everett.lan now`,
  };
}

function githubPush(): AccessEvent {
  return {
    id: "gh-1",
    at: "2026-09-04T23:30:41Z",
    kind: "push",
    source: "github",
    actorLogin: "EverettNC",
    repo: "EverettNC/HONESTY",
    files: [],
    summary: "Pushed 1 commit to EverettNC/HONESTY",
  };
}

describe("local watch stays on the desk", () => {
  it("keeps local events as station record", () => {
    assert.equal(belongsToStation(localOpen("Claude"), owner, org), true);
  });

  it("does not drop local lines when a GitHub pull merges", () => {
    const merged = mergeEvents([localOpen("Claude"), githubPush()], [githubPush()]).filter(
      (event) => event.source !== "github" || belongsToStation(event, owner, org),
    );
    assert.equal(
      merged.some((event) => event.id === "local-live-Claude"),
      true,
    );
  });

  it("writes a live line for each running program", () => {
    const snap: LocalSnapshot = {
      armed: true,
      platform: "Darwin",
      machine: "Everett.lan",
      last_scan: "2026-09-07T06:10:00.000Z",
      running: [{ name: "Claude", count: 17, pids: ["1"] }],
      ledger: [],
    };
    const events = eventsFromLocal(snap);
    assert.equal(events[0]?.id, "local-live-Claude");
    assert.match(events[0]?.summary ?? "", /17 processes/);
  });

  it("drops live lines when a program leaves the process list", () => {
    const kept = pruneStaleLive(
      [localOpen("Claude"), localOpen("Continue")],
      new Set(["claude"]),
    );
    assert.deepEqual(
      kept.map((event) => event.id),
      ["local-live-Claude"],
    );
  });

});
