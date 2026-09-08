import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  companyComputers,
  currentFromTheirComputers,
  fromTheirComputers,
  modelsThrough,
  liveModels,
  probeBody,
  reasoningLine,
  reasoningNow,
  statusLabel,
} from "./datacenter.ts";
import { eventsFromLocal, pruneStaleLive, type LocalSnapshot } from "./local-events.ts";
import type { DatacenterModel } from "./types.ts";

const sonnet: DatacenterModel = {
  id: "claude-sonnet-4-5",
  name: "claude-sonnet-4-5",
  provider: "Anthropic",
  where: "datacenter",
  role: "reasoning",
  status: "in_use",
  source: "wire+config",
  host: "api.anthropic.com",
  via: "Cursor",
};

const catalog: DatacenterModel = {
  id: "meta/llama-3.1-nemotron-70b-instruct",
  name: "meta/llama-3.1-nemotron-70b-instruct",
  provider: "NVIDIA",
  where: "datacenter",
  role: "reasoning",
  status: "reachable",
  source: "nvidia-catalog",
  host: "integrate.api.nvidia.com",
};

describe("datacenter model watch", () => {
  it("names the live reasoning model, not the catalog", () => {
    const models = [catalog, sonnet];
    assert.equal(liveModels(models).length, 1);
    assert.equal(reasoningNow(models)?.id, "claude-sonnet-4-5");
    assert.match(reasoningLine(models) ?? "", /claude-sonnet-4-5 @ Anthropic via Cursor/);
    assert.equal(statusLabel(sonnet), "answering now");
    assert.equal(statusLabel(catalog), "available");
    assert.equal(fromTheirComputers(models).length, 2);
    assert.equal(currentFromTheirComputers(models).length, 1);
    assert.equal(modelsThrough(models, "Cursor").length, 1);
    assert.equal(modelsThrough(models, "Claude").length, 0);
    assert.equal(companyComputers("Anthropic"), "Anthropic's computers");
    assert.equal(companyComputers("Ollama"), "Ollama's cloud");
  });

  it("sends seated keys to Honesty Local without extra fields", () => {
    const body = probeBody({
      nvidia: "nvapi-test",
      ollama: "",
      openai: "",
      anthropic: "sk-ant-test",
      awsAccessKeyId: "",
      awsSecretAccessKey: "",
      awsRegion: "",
    });
    assert.equal(body.nvidia, "nvapi-test");
    assert.equal(body.anthropic, "sk-ant-test");
    assert.equal(body.awsRegion, "us-east-1");
  });

  it("writes a live ledger line for the datacenter model", () => {
    const snap: LocalSnapshot = {
      armed: true,
      platform: "Darwin",
      machine: "Everett.lan",
      last_scan: "2026-09-07T06:10:00.000Z",
      running: [{ name: "Cursor", count: 3, pids: ["1"] }],
      models: [sonnet],
      ledger: [],
    };
    const events = eventsFromLocal(snap);
    assert.equal(
      events.some((event) => event.id === "local-model-anthropic-claude-sonnet-4-5"),
      true,
    );
    const modelLine = events.find((event) => event.id.startsWith("local-model-"));
    assert.match(modelLine?.summary ?? "", /answering now/);
    assert.equal(modelLine?.source, "datacenter");
    assert.equal(modelLine?.counterpart, "claude-sonnet-4-5");
  });

  it("does not put a leftover pick on the live ledger", () => {
    const snap: LocalSnapshot = {
      armed: true,
      platform: "Darwin",
      machine: "Everett.lan",
      last_scan: "2026-09-07T06:10:00.000Z",
      running: [{ name: "Claude", count: 1, pids: ["1"] }],
      models: [
        {
          ...sonnet,
          id: "claude-fable-5",
          name: "claude-fable-5",
          status: "configured",
          source: "config",
          via: "Claude",
        },
      ],
      ledger: [],
    };
    const events = eventsFromLocal(snap);
    assert.equal(
      events.some((event) => event.id.startsWith("local-model-")),
      false,
    );
  });

  it("drops the live model line when it stops answering", () => {
    const kept = pruneStaleLive(
      [
        {
          id: "local-model-anthropic-claude-sonnet-4-5",
          at: "2026-09-07T06:00:00.000Z",
          kind: "open",
          source: "local",
          actorLogin: "Anthropic",
          files: [],
          summary: "live",
        },
        {
          id: "local-live-Cursor",
          at: "2026-09-07T06:00:00.000Z",
          kind: "open",
          source: "local",
          actorLogin: "Cursor",
          files: [],
          summary: "Cursor is on Everett.lan now",
        },
      ],
      new Set(["cursor"]),
      new Set(),
    );
    assert.deepEqual(
      kept.map((event) => event.id),
      ["local-live-Cursor"],
    );
  });
});
