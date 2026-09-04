import roster from "./squadron.json";
import type { ConductorStatus } from "./conductor";

export type SquadronBeing = {
  id: string;
  name: string;
  title: string;
  division: string;
  wing: string;
  focus: string;
  mandate: string;
  domain: string;
  shipped: number;
  emptyStreak: number;
  status: ConductorStatus;
  queued: number;
  artifacts: number;
  confidence: number;
  verified: boolean;
  hoursAgo: number;
  minutes: number;
  tokens: number;
  nextIn: number;
};

export const SQUADRON = roster as SquadronBeing[];

export const WING_ORDER = [
  "Foundation",
  "StackMind",
  "Oncology & Virology",
  "Addiction Recovery",
  "Maternal & Gyn",
  "Clinical Care",
] as const;

export const STANDING_LINES = [
  "Ninety-nine beings answered the roll. Start with whoever has gone dark. Silence is the only report this board refuses.",
  "We are not building toys. Every empty cycle is a bed unmade in a house that is counting on us. Rule fast, rule plainly.",
  "Accept the work that shows its evidence. Send back the work that shows only its intentions. There is no third pile.",
  "A being that cannot do the job is not a failure — it is misassigned. Move it before it rots on the bench.",
];

export const RISK: Record<ConductorStatus, number> = {
  dark: 0,
  empty: 1,
  blocked: 2,
  review: 3,
  clean: 4,
};

export function dressStatus(status: ConductorStatus): { label: string; tone: "sage" | "paper" | "muted" | "danger" } {
  if (status === "clean") return { label: "Accepted", tone: "sage" };
  if (status === "review") return { label: "Awaiting ruling", tone: "paper" };
  if (status === "blocked") return { label: "Blocked", tone: "paper" };
  if (status === "empty") return { label: "Nothing shipped", tone: "muted" };
  return { label: "Dark / non-performing", tone: "danger" };
}

export function overlayLocal(
  beings: SquadronBeing[],
  running: { name: string }[],
): SquadronBeing[] {
  if (!running.length) return beings;
  const live = new Set(running.map((row) => row.name.trim().toLowerCase()));
  return beings.map((being) => {
    const hit = [...live].some(
      (name) =>
        being.name.toLowerCase() === name ||
        being.name.toLowerCase().replace(/\s+/g, "") === name.replace(/\s+/g, ""),
    );
    if (!hit) return being;
    return { ...being, status: "clean", verified: true, hoursAgo: 0, emptyStreak: 0 };
  });
}
