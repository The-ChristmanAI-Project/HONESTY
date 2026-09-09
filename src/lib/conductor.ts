import { reasoningLine } from "./datacenter";
import { probeLocal, type LocalSnapshot } from "./local-agent";
import type { DatacenterModel } from "./types";

export const LOCAL_BIND = "127.0.0.1:8787";
export const DESK_BIND = "0.0.0.0:8788";
export const CONDUCTOR_LOCAL = `http://${LOCAL_BIND}`;
export const CONDUCTOR_CHANNEL = "honesty-conductor";

export type ConductorStatus = "clean" | "review" | "blocked" | "empty" | "dark";

export type ConductorBeing = {
  id: string;
  name: string;
  title: string;
  wing: string;
  domain: string;
  status: ConductorStatus;
  shipped: number;
  artifacts: number;
  verified: boolean;
  emptyStreak: number;
  hoursAgo: number | null;
  pids: string[];
  mandate: string;
  lastAt: string | null;
  division?: string;
  focus?: string;
  private?: boolean;
};

export const RISK: Record<ConductorStatus, number> = {
  dark: 0,
  empty: 1,
  blocked: 2,
  review: 3,
  clean: 4,
};

export function dressStatus(
  status: ConductorStatus,
): { label: string; tone: "sage" | "paper" | "muted" | "danger" } {
  if (status === "clean") return { label: "On this computer", tone: "sage" };
  if (status === "review") return { label: "Seen, not running", tone: "paper" };
  if (status === "blocked") return { label: "Blocked", tone: "paper" };
  if (status === "empty") return { label: "Not seen here", tone: "muted" };
  return { label: "Dark", tone: "danger" };
}

export type ConductorFeed = {
  source: string;
  version: number;
  seated: boolean;
  armed: boolean;
  machine: string;
  platform: string;
  last_scan: string | null;
  wing: string;
  hook: string | null;
  beings: ConductorBeing[];
  ledger: { at: string; kind: string; name: string; summary: string; source?: string }[];
  running: { name: string; count: number; pids: string[] }[];
  models?: DatacenterModel[];
  model_note?: string | null;
  note: string;
  standing?: string;
};

export function hoursAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (Date.now() - ms) / 36e5);
}

export function statusFor(opts: {
  running: boolean;
  seen: boolean;
  lastAt?: string | null;
}): ConductorStatus {
  if (opts.running) return "clean";
  if (opts.seen) return "review";
  const age = hoursAgo(opts.lastAt);
  if (age != null && age >= 24) return "dark";
  return "empty";
}

export function feedFromLocal(snap: LocalSnapshot): ConductorFeed {
  const runningNames = new Set((snap.running ?? []).map((row) => row.name));
  const seen = snap.seen ?? [];
  const beings: ConductorBeing[] = [];
  const used = new Set<string>();

  for (const row of snap.running ?? []) {
    used.add(row.name);
    beings.push({
      id: `honesty-${row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: row.name,
      title: "Named AI on the home station",
      wing: "Honesty",
      domain: "Ops",
      status: "clean",
      shipped: row.count,
      artifacts: row.count,
      verified: true,
      emptyStreak: 0,
      hoursAgo: hoursAgo(snap.last_scan),
      pids: row.pids ?? [],
      mandate: `${row.name} is in the process list on ${snap.machine}.`,
      lastAt: snap.last_scan,
    });
  }

  for (const row of seen) {
    if (used.has(row.name)) continue;
    used.add(row.name);
    beings.push({
      id: `honesty-${row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: row.name,
      title: "Named AI — seen, not running",
      wing: "Honesty",
      domain: "Ops",
      status: statusFor({ running: false, seen: true, lastAt: row.lastAt }),
      shipped: row.count ?? 0,
      artifacts: row.count ?? 0,
      verified: false,
      emptyStreak: 1,
      hoursAgo: hoursAgo(row.lastAt),
      pids: row.pids ?? [],
      mandate: `${row.name} was on this computer. It is not in the process list now.`,
      lastAt: row.lastAt,
    });
  }

  beings.sort((a, b) => {
    const rank = { dark: 0, empty: 1, blocked: 2, review: 3, clean: 4 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return a.name.localeCompare(b.name);
  });

  return {
    source: "honesty-local",
    version: 1,
    seated: true,
    armed: snap.armed,
    machine: snap.machine,
    platform: snap.platform,
    last_scan: snap.last_scan,
    wing: "Honesty",
    hook: null,
    beings,
    ledger: snap.ledger ?? [],
    running: snap.running ?? [],
    models: snap.models ?? [],
    model_note: snap.model_note ?? null,
    note:
      snap.note ??
      "Honesty Local reads this computer's process list and which model is answering. Browser tabs are not separate programs.",
    standing: [
      `${(snap.running ?? []).length} named program(s) running on ${snap.machine}.`,
      reasoningLine(snap.models ?? [])
        ? `Answering now: ${reasoningLine(snap.models ?? [])}.`
        : "No model answering right now.",
      "Browser tabs are not programs.",
    ].join(" "),
  };
}

export async function pullConductorFeed(): Promise<ConductorFeed | null> {
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 1200);
    const res = await fetch(`${CONDUCTOR_LOCAL}/api/conductor`, { signal: ctrl.signal });
    window.clearTimeout(timer);
    if (res.ok) return (await res.json()) as ConductorFeed;
  } catch {
    /* fall through to status */
  }
  const snap = await probeLocal();
  if (!snap) return null;
  return feedFromLocal(snap);
}

export function publishConductor(feed: ConductorFeed) {
  if (typeof window === "undefined") return;
  try {
    const ch = new BroadcastChannel(CONDUCTOR_CHANNEL);
    ch.postMessage({ type: "honesty.conductor", at: Date.now(), feed });
    ch.close();
  } catch {
    /* BroadcastChannel missing */
  }
}

export async function seatConductorHook(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${CONDUCTOR_LOCAL}/api/conductor/seat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
