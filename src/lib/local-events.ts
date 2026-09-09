import { companyComputers } from "./datacenter.ts";
import type { AccessEvent, DatacenterModel, EventSource } from "./types";

const KNOWN_SOURCES: EventSource[] = [
  "github",
  "home",
  "local",
  "datacenter",
  "mail",
  "wire",
  "calendar",
  "outlook",
  "teams",
];

export function ledgerSource(value: unknown): EventSource {
  if (typeof value === "string" && (KNOWN_SOURCES as string[]).includes(value)) {
    return value as EventSource;
  }
  return "local";
}

export type LocalProcess = {
  name: string;
  count: number;
  pids: string[];
};

export type LocalSeen = {
  name: string;
  firstAt?: string;
  lastAt: string;
  count?: number;
  pids?: string[];
};

export type LocalLedgerItem = {
  at: string;
  kind: string;
  name: string;
  summary: string;
  source?: string;
};

export type LocalSnapshot = {
  armed: boolean;
  platform: string;
  machine: string;
  running: LocalProcess[];
  seen?: LocalSeen[];
  models?: DatacenterModel[];
  model_note?: string | null;
  last_model_scan?: string | null;
  ledger: LocalLedgerItem[];
  last_scan: string | null;
  note?: string;
};

export function modelEventId(model: DatacenterModel): string {
  return `local-model-${model.provider}-${model.id}`.toLowerCase();
}

/** Live-now cards only. Ledger history uses `local-model-{name}-{ISO}` and must stay. */
export function isLiveNowId(id: string): boolean {
  const lower = id.toLowerCase();
  if (lower.startsWith("local-live-")) return true;
  return lower.startsWith("local-model-") && !/\d{4}-\d{2}-\d{2}t/.test(lower);
}

export function dropLiveNow(events: AccessEvent[]): AccessEvent[] {
  return events.filter((event) => !isLiveNowId(event.id));
}

export function pruneStaleLive(
  events: AccessEvent[],
  runningNames: Set<string>,
  modelIds?: Set<string>,
): AccessEvent[] {
  return events.filter((event) => {
    const id = event.id.toLowerCase();
    if (id.startsWith("local-live-")) {
      return runningNames.has(id.slice("local-live-".length));
    }
    if (isLiveNowId(event.id)) {
      if (!modelIds) return true;
      return modelIds.has(id);
    }
    return true;
  });
}

export function eventsFromLocal(snap: LocalSnapshot): AccessEvent[] {
  const at = snap.last_scan || snap.last_model_scan || new Date().toISOString();
  const live = (snap.running ?? []).map((row) => ({
    id: `local-live-${row.name}`,
    at,
    kind: "open" as const,
    source: "local" as const,
    actorLogin: row.name,
    files: [] as string[],
    summary: `${row.name} is on ${snap.machine} now · ${row.count} process${
      row.count === 1 ? "" : "es"
    }`,
  }));
  const models = (snap.models ?? [])
    .filter((model) => model.status === "in_use")
    .sort((a, b) => Number(b.status === "in_use") - Number(a.status === "in_use"))
    .map((model) => {
      const via = model.via ? ` through ${model.via}` : "";
      const company = companyComputers(model.provider);
      const liveNow = model.status === "in_use";
      const summary =
        model.where === "datacenter"
          ? liveNow
            ? `${model.name} is answering now on ${company}${via}`
            : `${model.name} is the model ${model.via ?? model.provider} picked on ${company}`
          : liveNow
            ? `${model.name} is loaded on this computer${via}`
            : `${model.name} is installed on this computer`;
      return {
        id: modelEventId(model),
        at: model.at || at,
        kind: "open" as const,
        source: (model.where === "datacenter" ? "datacenter" : "local") as AccessEvent["source"],
        actorLogin: model.provider,
        counterpart: model.name,
        files: [] as string[],
        summary,
      };
    });
  const ledger = (snap.ledger ?? []).map((item) => ({
    id: `local-${item.kind}-${item.name}-${item.at}`,
    at: item.at,
    kind: (item.kind === "stop" ? "other" : "open") as AccessEvent["kind"],
    source: ledgerSource(item.source),
    actorLogin: item.name,
    files: [] as string[],
    summary: item.summary,
  }));
  return [...models, ...live, ...ledger];
}
