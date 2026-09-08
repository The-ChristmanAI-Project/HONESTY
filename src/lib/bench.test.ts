import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fitLabel, stamp } from "./bench.ts";

describe("bench stamps", () => {
  it("writes mm:ss", () => {
    assert.equal(stamp(0), "0:00");
    assert.equal(stamp(65), "1:05");
  });

  it("names the compare without jargon", () => {
    assert.equal(fitLabel("picture-no-speech"), "picture, no speech");
    assert.equal(fitLabel("compare"), "said and seen");
  });
});
