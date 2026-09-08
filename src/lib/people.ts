import { SOURCE_LABEL, isTrustedActor, isValidLogin, sanitizeLogin } from "./github.ts";
import type { AccessEvent, EventKind, NamedAi } from "./types.ts";

export type UnknownPerson = {
  login: string;
  name?: string;
  eventCount: number;
  lastAt: string;
  lastWhat: string;
  lastWhere: string | null;
  lastSource: string;
  lastSummary: string;
  lastUrl?: string;
  why: string;
  files: string[];
  sources: string[];
};

const DEED: Record<EventKind, string> = {
  push: "pushed code",
  star: "starred a repo",
  fork: "forked a repo",
  issue: "worked an issue",
  pull: "touched a pull request",
  member: "got access",
  follow: "followed you",
  release: "cut a release",
  create: "created something",
  delete: "deleted something",
  comment: "left a comment",
  open: "opened a file",
  modify: "changed a file",
  mail: "showed up in mail",
  call: "was on a call",
  message: "sent a text",
  meeting: "was in a meeting",
  other: "showed up",
};

export function whatTheyDid(kind: EventKind): string {
  return DEED[kind] ?? "showed up";
}

function placeOf(event: AccessEvent): string | null {
  if (event.repo) return event.repo;
  if (event.counterpart && event.counterpart !== event.actorLogin) return event.counterpart;
  return null;
}

function whyUnknown(event: AccessEvent): string {
  const source = SOURCE_LABEL[event.source] ?? event.source;
  const place = placeOf(event);
  const where = place ? ` (${place})` : "";
  return `Showed up on ${source}${where}. You have not said you know them. Not you. Not a named AI.`;
}

const NOT_A_PERSON = new Set(["conductor", "honesty", "honesty local"]);

function isNamedAi(login: string, named: NamedAi[]): boolean {
  const n = login.trim().toLowerCase();
  return named.some(
    (ai) =>
      ai.name.toLowerCase() === n || ai.aliases.some((alias) => alias.toLowerCase() === n),
  );
}

export function isUnknownLogin(
  login: string,
  owner: string,
  known: string[],
  named: NamedAi[],
  isAi?: (login: string) => boolean,
): boolean {
  const clean = login.trim();
  if (!clean) return false;
  if (NOT_A_PERSON.has(clean.toLowerCase())) return false;
  if (isTrustedActor(clean, owner, known)) return false;
  if (isNamedAi(clean, named)) return false;
  if (isAi?.(clean)) return false;
  return true;
}

function namesOn(event: AccessEvent): string[] {
  const names = [event.actorLogin];
  if (event.counterpart) names.push(event.counterpart);
  return names.map((name) => name.trim()).filter(Boolean);
}

function rankEvent(event: AccessEvent): number {
  if (event.source === "local" || event.source === "home" || event.source === "datacenter") {
    return 0;
  }
  if (event.source === "github") return 2;
  return 1;
}

export function deriveUnknownPeople(
  events: AccessEvent[],
  owner: string,
  known: string[],
  named: NamedAi[],
  isAi?: (login: string) => boolean,
): UnknownPerson[] {
  const buckets = new Map<
    string,
    { login: string; name?: string; events: AccessEvent[] }
  >();
  for (const event of events) {
    for (const login of namesOn(event)) {
      if (!isUnknownLogin(login, owner, known, named, isAi)) continue;
      const key = login.toLowerCase();
      const prior = buckets.get(key) ?? { login, events: [] };
      if (login.toLowerCase() === event.actorLogin.toLowerCase() && event.actorName) {
        prior.name = event.actorName;
      }
      prior.events.push(event);
      buckets.set(key, prior);
    }
  }

  return [...buckets.values()]
    .map((bucket) => {
      const last = [...bucket.events].sort((a, b) => {
        const rank = rankEvent(b) - rankEvent(a);
        if (rank !== 0) return rank;
        return a.at < b.at ? 1 : -1;
      })[0]!;
      const files = new Set<string>();
      const sources = new Set<string>();
      for (const event of bucket.events) {
        for (const file of event.files) files.add(file);
        if (event.repo) files.add(event.repo);
        sources.add(SOURCE_LABEL[event.source] ?? event.source);
      }
      return {
        login: bucket.login,
        name: bucket.name,
        eventCount: bucket.events.length,
        lastAt: last.at,
        lastWhat: whatTheyDid(last.kind),
        lastWhere: placeOf(last),
        lastSource: SOURCE_LABEL[last.source] ?? last.source,
        lastSummary: last.summary,
        lastUrl: last.url,
        why: whyUnknown(last),
        files: [...files],
        sources: [...sources],
      };
    })
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

export type WhoResult = {
  kind: "github" | "mail" | "local" | "other";
  heading: string;
  lines: string[];
  openUrl?: string;
  openLabel?: string;
};

export function githubUrlFor(login: string): string | null {
  const clean = sanitizeLogin(login);
  if (!isValidLogin(clean)) return null;
  return `https://github.com/${clean}`;
}

export function isEmail(login: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login.trim());
}

export async function findOutWho(
  person: UnknownPerson,
  token?: string,
): Promise<WhoResult> {
  const login = person.login.trim();
  if (person.lastSource === "Local") {
    return {
      kind: "local",
      heading: `${login} showed up as a program on this computer.`,
      lines: [
        "That is not a stranger in the mail. Honesty Local saw it in the process list.",
        "If it is an AI app, press Treat as AI. If it is a person you know, press I know them.",
      ],
    };
  }
  if (isEmail(login) || person.lastSource === "Mail") {
    return {
      kind: "mail",
      heading: `${login} showed up in mail.`,
      lines: [
        person.lastSummary || "No extra line on the message.",
        person.lastWhere ? `With: ${person.lastWhere}` : "No other name on the thread.",
      ],
      openUrl: login.includes("@") ? `mailto:${login}` : undefined,
      openLabel: login.includes("@") ? "Open in mail" : undefined,
    };
  }

  const gh = githubUrlFor(login);
  if (gh) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`https://api.github.com/users/${sanitizeLogin(login)}`, { headers });
      if (res.status === 404) {
        return {
          kind: "github",
          heading: `No GitHub account named ${login}.`,
          lines: [
            "They still showed up in your record. Open what they did, or mark that you know them.",
          ],
          openUrl: person.lastUrl,
          openLabel: person.lastUrl ? "Open what they did" : undefined,
        };
      }
      if (!res.ok) {
        return {
          kind: "github",
          heading: `GitHub did not answer for ${login}.`,
          lines: [`HTTP ${res.status}. You can still open their GitHub page.`],
          openUrl: gh,
          openLabel: "Open GitHub",
        };
      }
      const body = (await res.json()) as {
        name?: string | null;
        bio?: string | null;
        company?: string | null;
        location?: string | null;
        html_url?: string;
        public_repos?: number;
        created_at?: string;
        type?: string;
      };
      const lines = [
        body.name ? `Name: ${body.name}` : "No display name on GitHub.",
        body.bio?.trim() ? body.bio.trim() : "No bio.",
        body.company ? `Company: ${body.company}` : null,
        body.location ? `Place: ${body.location}` : null,
        body.type ? `Account: ${body.type}` : null,
        typeof body.public_repos === "number" ? `Public repos: ${body.public_repos}` : null,
        body.created_at ? `GitHub since ${body.created_at.slice(0, 10)}` : null,
      ].filter((line): line is string => Boolean(line));
      return {
        kind: "github",
        heading: body.name ? `${body.name} (@${login})` : `@${login} on GitHub`,
        lines,
        openUrl: body.html_url ?? gh,
        openLabel: "Open GitHub",
      };
    } catch {
      return {
        kind: "github",
        heading: `Could not reach GitHub for ${login}.`,
        lines: ["Network failed. You can still open the page."],
        openUrl: gh,
        openLabel: "Open GitHub",
      };
    }
  }

  return {
    kind: "other",
    heading: `${login} showed up in the record.`,
    lines: [
      person.lastSummary || `${person.lastSource} · ${person.lastWhat}`,
      person.why,
    ],
    openUrl: person.lastUrl,
    openLabel: person.lastUrl ? "Open what they did" : undefined,
  };
}
