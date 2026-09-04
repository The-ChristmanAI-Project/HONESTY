import { create } from "zustand";
import { persist } from "zustand/middleware";
import { belongsToStation, mergeEvents } from "./github";
import { SEED_EVENTS } from "./seed";
import type {
  AccessEvent,
  HonestyReport,
  ManualWatch,
  NamedAi,
  StationSettings,
  WireSourceStatus,
} from "./types";

const TOKEN_KEY = "honesty.github-token";

export function readToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) ?? "";
}

export function writeToken(token: string) {
  if (typeof window === "undefined") return;
  if (token.trim()) window.localStorage.setItem(TOKEN_KEY, token.trim());
  else window.localStorage.removeItem(TOKEN_KEY);
}

export type StationState = {
  hydrated: boolean;
  armed: boolean;
  pulling: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
  warnings: string[];
  rateRemaining: number | null;
  folderLabel: string | null;
  mailWarning: string | null;
  mailLoginUrl: string | null;
  mailLoginRequired: boolean;
  pullingMail: boolean;
  wireSources: WireSourceStatus[];
  localSeated: boolean;
  localMachine: string | null;
  localPlatform: string | null;
  settings: StationSettings;
  namedAis: NamedAi[];
  knownActors: string[];
  watches: ManualWatch[];
  events: AccessEvent[];
  reports: HonestyReport[];
  repos: {
    full_name: string;
    html_url: string;
    private: boolean;
    pushed_at: string | null;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    description: string | null;
  }[];
  setHydrated: () => void;
  setArmed: (armed: boolean) => void;
  setPulling: (pulling: boolean) => void;
  setSettings: (patch: Partial<StationSettings>) => void;
  applyPull: (input: {
    events: AccessEvent[];
    repos: StationState["repos"];
    warnings: string[];
    fetchedAt: string;
    rateRemaining: number | null;
    ok: boolean;
  }) => void;
  addEvent: (event: AccessEvent) => void;
  addAi: (name: string, aliases?: string) => void;
  removeAi: (id: string) => void;
  setAiRunning: (id: string, running: boolean) => void;
  applyLocal: (input: {
    machine: string;
    platform: string;
    running: { name: string }[];
    events: AccessEvent[];
  }) => void;
  applyConductor: (feed: {
    machine?: string;
    platform?: string;
    running?: { name: string }[];
    ledger?: { at: string; kind: string; name: string; summary: string }[];
  }) => void;
  markLocalGone: () => void;
  addKnown: (login: string) => void;
  removeKnown: (login: string) => void;
  addWatch: (path: string, note: string) => void;
  removeWatch: (id: string) => void;
  addReport: (report: HonestyReport) => void;
  removeReport: (id: string) => void;
  setFolderLabel: (label: string | null) => void;
  applyMail: (input: {
    events: AccessEvent[];
    warning: string | null;
    loginRequired: boolean;
    loginUrl?: string;
    sources?: WireSourceStatus[];
  }) => void;
  setPullingMail: (pulling: boolean) => void;
  clearLedger: () => void;
};

const defaultSettings: StationSettings = {
  stationName: "Home Station",
  githubUser: "EverettNC",
  githubOrg: "The-ChristmanAI-Project",
  pollSeconds: 180,
};

export const useStation = create<StationState>()(
  persist(
    (set) => ({
      hydrated: false,
      armed: false,
      pulling: false,
      lastFetchedAt: null,
      lastError: null,
      warnings: [],
      rateRemaining: null,
      folderLabel: null,
      mailWarning: null,
      mailLoginUrl: null,
      mailLoginRequired: false,
      pullingMail: false,
      wireSources: [],
      localSeated: false,
      localMachine: null,
      localPlatform: null,
      settings: defaultSettings,
      namedAis: [
        { id: "ai-grok", name: "Grok", aliases: ["grok", "xai"], running: false },
        {
          id: "ai-copilot",
          name: "Copilot",
          aliases: ["copilot", "copilot-swe-agent", "github-copilot"],
          running: false,
        },
        { id: "ai-claude", name: "Claude", aliases: ["claude", "anthropic"], running: false },
      ],
      knownActors: ["EverettNC"],
      watches: [
        {
          id: "watch-desk",
          path: "Home Station / desk",
          note: "Named seat of this watch. Not a kernel hook.",
        },
      ],
      events: SEED_EVENTS,
      reports: [],
      repos: [],
      setHydrated: () => set({ hydrated: true }),
      setArmed: (armed) => set({ armed }),
      setPulling: (pulling) => set({ pulling }),
      setSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } })),
      applyPull: ({ events, repos, warnings, fetchedAt, rateRemaining, ok }) =>
        set((state) => {
          const scoped = events.filter((event) =>
            belongsToStation(event, state.settings.githubUser, state.settings.githubOrg),
          );
          const merged = mergeEvents(state.events, scoped).filter((event) =>
            belongsToStation(event, state.settings.githubUser, state.settings.githubOrg),
          );
          return {
            events: merged,
            repos,
            warnings,
            lastFetchedAt: fetchedAt,
            lastError: ok || scoped.length ? null : warnings[0] ?? "No record returned.",
            pulling: false,
            rateRemaining,
          };
        }),
      addEvent: (event) =>
        set((state) => ({ events: mergeEvents(state.events, [event]) })),
      addAi: (name, aliases) =>
        set((state) => {
          const clean = name.trim();
          if (!clean) return state;
          if (state.namedAis.some((ai) => ai.name.toLowerCase() === clean.toLowerCase())) {
            return state;
          }
          const extra = (aliases ?? "")
            .split(/[,;\s]+/)
            .map((item) => item.trim())
            .filter(Boolean);
          return {
            namedAis: [
              ...state.namedAis,
              {
                id: `ai-${Date.now().toString(36)}`,
                name: clean,
                aliases: extra.length ? extra : [clean],
                running: false,
              },
            ],
          };
        }),
      removeAi: (id) =>
        set((state) => ({ namedAis: state.namedAis.filter((ai) => ai.id !== id) })),
      setAiRunning: (id, running) =>
        set((state) => ({
          namedAis: state.namedAis.map((ai) =>
            ai.id === id
              ? {
                  ...ai,
                  running,
                  runningFrom: running ? "hand" : undefined,
                  runningSince: running ? new Date().toISOString() : undefined,
                }
              : ai,
          ),
        })),
      applyLocal: ({ machine, platform, running, events }) =>
        set((state) => {
          const names = new Set(running.map((row) => row.name.trim().toLowerCase()).filter(Boolean));
          const namedAis: NamedAi[] = state.namedAis.map((ai) => {
            if (names.has(ai.name.toLowerCase())) {
              return {
                ...ai,
                running: true,
                runningFrom: "local",
                runningSince: ai.runningSince ?? new Date().toISOString(),
              };
            }
            if (ai.runningFrom === "local") {
              return { ...ai, running: false, runningFrom: undefined };
            }
            return ai;
          });
          for (const row of running) {
            const clean = row.name.trim();
            if (!clean) continue;
            if (namedAis.some((ai) => ai.name.toLowerCase() === clean.toLowerCase())) continue;
            namedAis.push({
              id: `ai-local-${clean.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
              name: clean,
              aliases: [clean],
              running: true,
              runningFrom: "local",
              runningSince: new Date().toISOString(),
            });
          }
          return {
            localSeated: true,
            localMachine: machine,
            localPlatform: platform,
            namedAis,
            events: mergeEvents(state.events, events),
          };
        }),
      applyConductor: (feed) =>
        set((state) => {
          const running = feed.running ?? [];
          const events = (feed.ledger ?? []).map((item) => ({
            id: `local-${item.kind}-${item.name}-${item.at}`,
            at: item.at,
            kind: (item.kind === "stop" ? "other" : "open") as AccessEvent["kind"],
            source: "local" as const,
            actorLogin: item.name,
            files: [] as string[],
            summary: item.summary,
          }));
          const names = new Set(running.map((row) => row.name.trim().toLowerCase()).filter(Boolean));
          const namedAis: NamedAi[] = state.namedAis.map((ai) => {
            if (names.has(ai.name.toLowerCase())) {
              return { ...ai, running: true, runningFrom: "local" };
            }
            if (ai.runningFrom === "local") {
              return { ...ai, running: false, runningFrom: undefined };
            }
            return ai;
          });
          return {
            localSeated: true,
            localMachine: feed.machine ?? state.localMachine,
            localPlatform: feed.platform ?? state.localPlatform,
            namedAis,
            events: mergeEvents(state.events, events),
          };
        }),
      markLocalGone: () =>
        set((state) => ({
          localSeated: false,
          namedAis: state.namedAis.map((ai) =>
            ai.runningFrom === "local" ? { ...ai, running: false, runningFrom: undefined } : ai,
          ),
        })),
      addKnown: (login) =>
        set((state) => {
          const clean = login.trim().replace(/^@/, "");
          if (!clean) return state;
          if (state.knownActors.some((name) => name.toLowerCase() === clean.toLowerCase())) {
            return state;
          }
          return { knownActors: [...state.knownActors, clean] };
        }),
      removeKnown: (login) =>
        set((state) => ({
          knownActors: state.knownActors.filter(
            (name) => name.toLowerCase() !== login.toLowerCase(),
          ),
        })),
      addWatch: (path, note) =>
        set((state) => ({
          watches: [
            ...state.watches,
            {
              id: `watch-${Date.now().toString(36)}`,
              path: path.trim(),
              note: note.trim(),
            },
          ],
        })),
      removeWatch: (id) =>
        set((state) => ({ watches: state.watches.filter((watch) => watch.id !== id) })),
      addReport: (report) =>
        set((state) => ({ reports: [report, ...state.reports].slice(0, 40) })),
      removeReport: (id) =>
        set((state) => ({ reports: state.reports.filter((report) => report.id !== id) })),
      setFolderLabel: (folderLabel) => set({ folderLabel }),
      setPullingMail: (pullingMail) => set({ pullingMail }),
      applyMail: ({ events, warning, loginRequired, loginUrl, sources }) =>
        set((state) => ({
          events: mergeEvents(state.events, events),
          mailWarning: warning,
          mailLoginRequired: loginRequired,
          mailLoginUrl: loginUrl ?? null,
          pullingMail: false,
          wireSources: sources ?? state.wireSources,
        })),
      clearLedger: () => set({ events: [], warnings: [], lastError: null }),
    }),
    {
      name: "honesty-station",
      skipHydration: true,
      partialize: (state) => ({
        armed: state.armed,
        settings: state.settings,
        namedAis: state.namedAis,
        knownActors: state.knownActors,
        watches: state.watches,
        events: state.events,
        reports: state.reports,
        repos: state.repos,
        lastFetchedAt: state.lastFetchedAt,
        folderLabel: state.folderLabel,
      }),
    },
  ),
);
