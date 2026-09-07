import type { AccessEvent } from "./types";

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
};

export type LocalSnapshot = {
  armed: boolean;
  platform: string;
  machine: string;
  running: LocalProcess[];
  seen?: LocalSeen[];
  ledger: LocalLedgerItem[];
  last_scan: string | null;
  note?: string;
};

export function pruneStaleLive(
  events: AccessEvent[],
  runningNames: Set<string>,
): AccessEvent[] {
  return events.filter((event) => {
    if (!event.id.startsWith("local-live-")) return true;
    return runningNames.has(event.id.slice("local-live-".length).toLowerCase());
  });
}

export function eventsFromLocal(snap: LocalSnapshot): AccessEvent[] {
  const at = snap.last_scan || new Date().toISOString();
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
  const ledger = (snap.ledger ?? []).map((item) => ({
    id: `local-${item.kind}-${item.name}-${item.at}`,
    at: item.at,
    kind: (item.kind === "stop" ? "other" : "open") as AccessEvent["kind"],
    source: "local" as const,
    actorLogin: item.name,
    files: [] as string[],
    summary: item.summary,
  }));
  return [...live, ...ledger];
}
