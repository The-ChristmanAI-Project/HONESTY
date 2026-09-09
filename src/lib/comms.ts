import { isComms } from "./github.ts";
import type { AccessEvent, EventKind } from "./types";

export type ChannelCount = {
  key: string;
  label: string;
  count: number;
};

export type Thread = {
  key: string;
  who: string;
  count: number;
  lastAt: string;
  lastSummary: string;
  lastKind: EventKind;
  kinds: EventKind[];
};

export function counterpartOf(event: AccessEvent): string {
  return (event.counterpart || event.actorLogin).trim() || "unknown";
}

export function deriveChannels(events: AccessEvent[]): ChannelCount[] {
  const comms = events.filter(isComms);
  const mail = comms.filter((event) => event.kind === "mail").length;
  const call = comms.filter((event) => event.kind === "call").length;
  const message = comms.filter((event) => event.kind === "message").length;
  const meeting = comms.filter((event) => event.kind === "meeting").length;
  const hand = comms.filter((event) => event.source === "wire").length;
  return [
    { key: "all", label: "All", count: comms.length },
    { key: "mail", label: "Mail", count: mail },
    { key: "call", label: "Call", count: call },
    { key: "message", label: "Text", count: message },
    { key: "meeting", label: "Meeting", count: meeting },
    { key: "hand", label: "Recorded", count: hand },
  ];
}

export function deriveThreads(events: AccessEvent[]): Thread[] {
  const map = new Map<string, Thread>();
  const chronological = [...events].filter(isComms).sort((a, b) => (a.at < b.at ? -1 : 1));
  for (const event of chronological) {
    const who = counterpartOf(event);
    const key = who.toLowerCase();
    const prior = map.get(key);
    const kinds = new Set(prior?.kinds ?? []);
    kinds.add(event.kind);
    map.set(key, {
      key,
      who,
      count: (prior?.count ?? 0) + 1,
      lastAt: event.at,
      lastSummary: event.summary,
      lastKind: event.kind,
      kinds: [...kinds],
    });
  }
  return [...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

export const DIRECTION_LABEL = {
  in: "In",
  out: "Out",
  with: "With",
} as const;
