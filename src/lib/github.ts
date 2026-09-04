import type { AccessEvent, Actor, EventKind, FileTouch } from "./types";

export type GhActor = {
  login?: string;
  display_login?: string;
  avatar_url?: string;
};

export type GhRepo = { name?: string; url?: string };

export type GhCommitFile = { filename?: string; status?: string };

export type GhEvent = {
  id?: string | number;
  type?: string;
  created_at?: string;
  actor?: GhActor;
  repo?: GhRepo;
  payload?: Record<string, unknown>;
};

export type GhUser = {
  login?: string;
  name?: string;
  avatar_url?: string;
  public_repos?: number;
  html_url?: string;
};

export type GhRepoSummary = {
  full_name: string;
  html_url: string;
  private: boolean;
  pushed_at: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  description: string | null;
};

const KIND_BY_TYPE: Record<string, EventKind> = {
  PushEvent: "push",
  WatchEvent: "star",
  ForkEvent: "fork",
  IssuesEvent: "issue",
  IssueCommentEvent: "comment",
  PullRequestEvent: "pull",
  PullRequestReviewEvent: "pull",
  PullRequestReviewCommentEvent: "comment",
  MemberEvent: "member",
  PublicEvent: "other",
  FollowEvent: "follow",
  ReleaseEvent: "release",
  CreateEvent: "create",
  DeleteEvent: "delete",
  CommitCommentEvent: "comment",
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function sanitizeLogin(raw: string): string {
  return raw.trim().replace(/^@/, "").slice(0, 80);
}

export function isValidLogin(raw: string): boolean {
  return /^[A-Za-z0-9-]{1,39}$/.test(raw);
}

export function mapGhEvent(raw: GhEvent): AccessEvent | null {
  const id = raw.id != null ? `gh-${raw.id}` : null;
  const at = asString(raw.created_at);
  const actorLogin = asString(raw.actor?.login) ?? asString(raw.actor?.display_login);
  if (!id || !at || !actorLogin) return null;

  const repo = asString(raw.repo?.name);
  const payload = raw.payload ?? {};
  const kind = KIND_BY_TYPE[raw.type ?? ""] ?? "other";
  const avatar = asString(raw.actor?.avatar_url);
  const sha = asString(payload.head) ?? asString(payload.sha);

  const files: string[] = [];
  const commits = Array.isArray(payload.commits) ? payload.commits : [];
  for (const commit of commits) {
    if (commit && typeof commit === "object" && "message" in commit) {
      // Public payloads rarely include file lists; keep commit messages out of the path ledger.
    }
  }

  const summary = summarize(kind, repo, payload, actorLogin);
  const url = eventUrl(kind, repo, payload, sha);

  return {
    id,
    at,
    kind,
    source: "github",
    actorLogin,
    actorAvatar: avatar,
    repo,
    files,
    summary,
    url,
    sha,
    direction: kind === "comment" || kind === "issue" || kind === "pull" ? "with" : undefined,
    counterpart: actorLogin,
    subject: titleFromPayload(payload),
  };
}

function titleFromPayload(payload: Record<string, unknown>): string | undefined {
  const issue = payload.issue;
  const pr = payload.pull_request;
  return (
    (issue && typeof issue === "object" && "title" in issue
      ? asString((issue as { title?: unknown }).title)
      : undefined) ??
    (pr && typeof pr === "object" && "title" in pr
      ? asString((pr as { title?: unknown }).title)
      : undefined)
  );
}

function summarize(
  kind: EventKind,
  repo: string | undefined,
  payload: Record<string, unknown>,
  actor: string,
): string {
  const place = repo ?? "GitHub";
  const action = asString(payload.action);
  const size = asNumber(payload.size);
  const ref = asString(payload.ref)?.replace(/^refs\/heads\//, "");
  const issue = payload.issue;
  const pr = payload.pull_request;
  const title =
    (issue && typeof issue === "object" && "title" in issue
      ? asString((issue as { title?: unknown }).title)
      : undefined) ??
    (pr && typeof pr === "object" && "title" in pr
      ? asString((pr as { title?: unknown }).title)
      : undefined);

  switch (kind) {
    case "push":
      return `Pushed ${size ?? 1} commit${size === 1 ? "" : "s"} to ${place}${ref ? ` (${ref})` : ""}`;
    case "star":
      return `Starred ${place}`;
    case "fork":
      return `Forked ${place}`;
    case "issue":
      return `${cap(action ?? "touched")} issue${title ? `: ${title}` : ""} on ${place}`;
    case "pull":
      return `${cap(action ?? "touched")} pull request${title ? `: ${title}` : ""} on ${place}`;
    case "member":
      return `${cap(action ?? "changed")} collaborator access on ${place}`;
    case "follow":
      return `${actor} followed the account`;
    case "release":
      return `${cap(action ?? "published")} a release on ${place}`;
    case "create":
      return `Created ${asString(payload.ref_type) ?? "ref"} ${ref ?? ""} on ${place}`.trim();
    case "delete":
      return `Deleted ${asString(payload.ref_type) ?? "ref"} ${ref ?? ""} on ${place}`.trim();
    case "comment":
      return `Commented on ${place}${title ? `: ${title}` : ""}`;
    default:
      return `Activity on ${place}`;
  }
}

function eventUrl(
  kind: EventKind,
  repo: string | undefined,
  payload: Record<string, unknown>,
  sha?: string,
): string | undefined {
  if (sha && repo) return `https://github.com/${repo}/commit/${sha}`;
  const issue = payload.issue;
  if (issue && typeof issue === "object" && "html_url" in issue) {
    return asString((issue as { html_url?: unknown }).html_url);
  }
  const pr = payload.pull_request;
  if (pr && typeof pr === "object" && "html_url" in pr) {
    return asString((pr as { html_url?: unknown }).html_url);
  }
  const comment = payload.comment;
  if (comment && typeof comment === "object" && "html_url" in comment) {
    return asString((comment as { html_url?: unknown }).html_url);
  }
  if (repo) return `https://github.com/${repo}`;
  return undefined;
}

function cap(value: string): string {
  return value.length ? value[0]!.toUpperCase() + value.slice(1) : value;
}

export function mergeEvents(existing: AccessEvent[], incoming: AccessEvent[]): AccessEvent[] {
  const map = new Map<string, AccessEvent>();
  for (const event of existing) map.set(event.id, event);
  for (const event of incoming) {
    const prior = map.get(event.id);
    if (!prior) {
      map.set(event.id, event);
      continue;
    }
    map.set(event.id, {
      ...prior,
      ...event,
      files: event.files.length ? event.files : prior.files,
      counterpart: event.counterpart ?? prior.counterpart,
      direction: event.direction ?? prior.direction,
      subject: event.subject ?? prior.subject,
      threadId: event.threadId ?? prior.threadId,
    });
  }
  return [...map.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 800);
}

export function deriveFiles(events: AccessEvent[]): FileTouch[] {
  const map = new Map<string, FileTouch>();
  const chronological = [...events].sort((a, b) => (a.at < b.at ? -1 : 1));
  for (const event of chronological) {
    const paths =
      event.files.length > 0
        ? event.files
        : event.repo
          ? [`${event.repo}`]
          : [];
    for (const path of paths) {
      const key = `${event.source}:${path}`;
      const prior = map.get(key);
      map.set(key, {
        path,
        repo: event.repo,
        source: event.source,
        lastAt: event.at,
        lastActor: event.actorLogin,
        lastKind: event.kind,
        count: (prior?.count ?? 0) + 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

export function deriveActors(events: AccessEvent[]): Actor[] {
  const map = new Map<string, Actor>();
  for (const event of events) {
    const key = event.actorLogin.toLowerCase();
    const prior = map.get(key);
    const files = new Set(prior?.files ?? []);
    for (const file of event.files) files.add(file);
    if (!event.files.length && event.repo) files.add(event.repo);
    const kinds = new Set(prior?.kinds ?? []);
    kinds.add(event.kind);
    const lastAt =
      !prior?.lastAt || event.at > prior.lastAt ? event.at : prior.lastAt;
    map.set(key, {
      login: event.actorLogin,
      name: event.actorName ?? prior?.name,
      avatar: event.actorAvatar ?? prior?.avatar,
      eventCount: (prior?.eventCount ?? 0) + 1,
      lastAt,
      files: [...files],
      kinds: [...kinds],
    });
  }
  return [...map.values()].sort((a, b) => b.eventCount - a.eventCount);
}

export function isOnStation(repo: string | undefined, user: string, org: string): boolean {
  if (!repo) return false;
  const lower = repo.toLowerCase();
  const owner = user.trim().toLowerCase();
  const group = org.trim().toLowerCase();
  if (owner && (lower === owner || lower.startsWith(`${owner}/`))) return true;
  if (group && (lower === group || lower.startsWith(`${group}/`))) return true;
  return false;
}

export function belongsToStation(
  event: AccessEvent,
  user: string,
  org: string,
): boolean {
  if (
    event.source === "home" ||
    event.source === "mail" ||
    event.source === "wire" ||
    event.source === "calendar" ||
    event.source === "outlook" ||
    event.source === "teams"
  ) {
    return true;
  }
  if (event.repo) return isOnStation(event.repo, user, org);
  return event.actorLogin.toLowerCase() === user.trim().toLowerCase();
}

export function isTrustedActor(login: string, owner: string, known: string[]): boolean {
  const needle = login.toLowerCase();
  if (needle === owner.trim().toLowerCase()) return true;
  return known.some((name) => name.toLowerCase() === needle);
}

export const KIND_LABEL: Record<EventKind, string> = {
  push: "Push",
  star: "Star",
  fork: "Fork",
  issue: "Issue",
  pull: "Pull",
  member: "Access",
  follow: "Follow",
  release: "Release",
  create: "Create",
  delete: "Delete",
  comment: "Comment",
  open: "Open",
  modify: "Modify",
  mail: "Mail",
  call: "Call",
  message: "Text",
  meeting: "Meeting",
  other: "Activity",
};

export const SOURCE_LABEL: Record<AccessEvent["source"], string> = {
  github: "GitHub",
  home: "Home",
  local: "Local",
  mail: "Mail",
  wire: "Wire",
  calendar: "Calendar",
  outlook: "Outlook",
  teams: "Teams",
};

export function isComms(event: AccessEvent): boolean {
  if (
    event.source === "mail" ||
    event.source === "wire" ||
    event.source === "calendar" ||
    event.source === "outlook" ||
    event.source === "teams"
  ) {
    return true;
  }
  return (
    event.kind === "comment" ||
    event.kind === "issue" ||
    event.kind === "pull" ||
    event.kind === "mail" ||
    event.kind === "call" ||
    event.kind === "message" ||
    event.kind === "meeting"
  );
}
