import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveChannels, deriveThreads } from "./comms.ts";
import { isComms } from "./github.ts";
import type { AccessEvent } from "./types.ts";

function ev(partial: Partial<AccessEvent> & Pick<AccessEvent, "id" | "kind" | "source">): AccessEvent {
  return {
    at: "2026-09-09T06:24:23Z",
    actorLogin: "EverettNC",
    files: [],
    summary: "event",
    ...partial,
  };
}

describe("mail and calls are not GitHub", () => {
  it("does not count a merged pull or a closed issue as a call", () => {
    const pull = ev({
      id: "gh-14687357759",
      kind: "pull",
      source: "github",
      summary: "Merged pull request on EverettNC/THEBENCH",
      repo: "EverettNC/THEBENCH",
    });
    const issue = ev({
      id: "gh-14170933516",
      kind: "issue",
      source: "github",
      summary: "Closed issue: Help wanted",
      repo: "The-ChristmanAI-Project/Harvest-Now-Decrypt-Later",
    });
    assert.equal(isComms(pull), false);
    assert.equal(isComms(issue), false);
    assert.equal(deriveChannels([pull, issue]).find((row) => row.key === "all")?.count, 0);
    assert.equal(deriveThreads([pull, issue]).length, 0);
  });

  it("still counts mail and a handwritten call", () => {
    const mail = ev({
      id: "mail-1",
      kind: "mail",
      source: "mail",
      counterpart: "sam@example.com",
      summary: "Mail in",
    });
    const call = ev({
      id: "wire-1",
      kind: "call",
      source: "wire",
      counterpart: "Misty",
      summary: "Call with Misty",
    });
    assert.equal(isComms(mail), true);
    assert.equal(isComms(call), true);
    assert.equal(deriveChannels([mail, call]).find((row) => row.key === "all")?.count, 2);
  });
});
