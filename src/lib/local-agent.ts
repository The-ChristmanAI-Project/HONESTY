import { toast } from "sonner";
import { useStation } from "./store";
import type { AccessEvent } from "./types";

const LOCAL_URL = "http://127.0.0.1:8787";

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

export async function probeLocal(): Promise<LocalSnapshot | null> {
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 900);
    const res = await fetch(`${LOCAL_URL}/api/status`, { signal: ctrl.signal });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as LocalSnapshot;
  } catch {
    return null;
  }
}

function eventsFromLocal(snap: LocalSnapshot): AccessEvent[] {
  return (snap.ledger ?? []).map((item) => ({
    id: `local-${item.kind}-${item.name}-${item.at}`,
    at: item.at,
    kind: item.kind === "stop" ? "other" : "open",
    source: "local",
    actorLogin: item.name,
    files: [],
    summary: item.summary,
  }));
}

export async function pullLocal(): Promise<boolean> {
  const snap = await probeLocal();
  const was = useStation.getState().localSeated;
  if (!snap) {
    if (was) {
      useStation.getState().markLocalGone();
      toast("Honesty Local went quiet. This desk still has the wire.");
    }
    return false;
  }
  useStation.getState().applyLocal({
    machine: snap.machine,
    platform: snap.platform,
    running: snap.running ?? [],
    events: eventsFromLocal(snap),
  });
  if (!was) {
    const n = snap.running?.length ?? 0;
    toast(
      n
        ? `Honesty Local seated. ${n} AI program${n === 1 ? "" : "s"} running on the computer.`
        : "Honesty Local seated. No named AI desktop program is running.",
    );
  }
  return true;
}
