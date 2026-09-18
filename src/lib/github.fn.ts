import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  isOnStation,
  isValidLogin,
  mapGhEvent,
  sanitizeLogin,
  type GhEvent,
  type GhRepoSummary,
  type GhUser,
} from "./github";
import type { AccessEvent } from "./types";

const Input = z.object({
  username: z.string().min(1).max(80),
  org: z.string().max(80).optional(),
  token: z.string().max(240).optional(),
  knownShas: z.array(z.string().max(64)).max(40).optional(),
});

type PullResult = {
  ok: boolean;
  profile: GhUser | null;
  events: AccessEvent[];
  repos: GhRepoSummary[];
  warnings: string[];
  fetchedAt: string;
  rateRemaining: number | null;
};

async function ghJson<T>(
  path: string,
  token: string | undefined,
  warnings: string[],
  remaining: { value: number | null },
): Promise<T | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Honesty-Above-All-Else",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers,
      signal: controller.signal,
    });
    const left = res.headers.get("x-ratelimit-remaining");
    if (left) remaining.value = Number(left);
    if (res.status === 403 || res.status === 429) {
      warnings.push("GitHub asked the desk to slow down. Try again in a minute.");
      return null;
    }
    if (res.status === 401) {
      warnings.push("The token was refused. Clear it or paste a new one.");
      return null;
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      warnings.push(`GitHub returned ${res.status} for ${path}.`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : "network error";
    warnings.push(`Could not reach GitHub (${message}).`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const pullStation = createServerFn({ method: "POST" })
  .validator(Input)
  .handler(async ({ data }): Promise<PullResult> => {
    const warnings: string[] = [];
    const remaining = { value: null as number | null };
    const username = sanitizeLogin(data.username);
    if (!isValidLogin(username)) {
      return {
        ok: false,
        profile: null,
        events: [],
        repos: [],
        warnings: ["That GitHub name is not a valid login."],
        fetchedAt: new Date().toISOString(),
        rateRemaining: null,
      };
    }

    const token = data.token?.trim() || undefined;
    const orgRaw = data.org ? sanitizeLogin(data.org) : "";
    const org = orgRaw && isValidLogin(orgRaw) ? orgRaw : "";

    // Without a token GitHub returns public activity only. Private repositories
    // are invisible on that path, so a quiet feed can mean "nothing happened" or
    // "everything happened in private." The desk says which, rather than letting
    // an old date stand as a fact.
    const eventsPath = token
      ? `/users/${username}/events?per_page=40`
      : `/users/${username}/events/public?per_page=40`;

    if (!token) {
      warnings.push(
        "Public activity only. Work in private repositories is not visible on this feed, so the newest date here is not necessarily your newest work. Add a token to see private activity.",
      );
    }

    const [profile, ownEvents, reposRaw, orgEvents] = await Promise.all([
      ghJson<GhUser>(`/users/${username}`, token, warnings, remaining),
      ghJson<GhEvent[]>(eventsPath, token, warnings, remaining),
      ghJson<Array<Record<string, unknown>>>(
        `/users/${username}/repos?sort=pushed&per_page=20&type=all`,
        token,
        warnings,
        remaining,
      ),
      org
        ? ghJson<GhEvent[]>(
            `/orgs/${org}/events?per_page=30`,
            token,
            warnings,
            remaining,
          )
        : Promise.resolve(null),
    ]);

    const repos: GhRepoSummary[] = (reposRaw ?? [])
      .map((repo) => ({
        full_name: typeof repo.full_name === "string" ? repo.full_name : "",
        html_url: typeof repo.html_url === "string" ? repo.html_url : "",
        private: Boolean(repo.private),
        pushed_at: typeof repo.pushed_at === "string" ? repo.pushed_at : null,
        language: typeof repo.language === "string" ? repo.language : null,
        stargazers_count: typeof repo.stargazers_count === "number" ? repo.stargazers_count : 0,
        forks_count: typeof repo.forks_count === "number" ? repo.forks_count : 0,
        description: typeof repo.description === "string" ? repo.description : null,
      }))
      .filter((repo) => repo.full_name);

    const watchRepos = token
      ? repos
          .filter((repo) => !repo.private || Boolean(token))
          .filter((repo) => isOnStation(repo.full_name, username, org))
          .slice(0, 6)
      : [];

    const repoEventLists = token
      ? await Promise.all(
          watchRepos.map((repo) =>
            ghJson<GhEvent[]>(
              `/repos/${repo.full_name}/events?per_page=15`,
              token,
              warnings,
              remaining,
            ),
          ),
        )
      : [];

    const mapped: AccessEvent[] = [];
    for (const raw of [
      ...(ownEvents ?? []),
      ...(orgEvents ?? []),
      ...repoEventLists.flatMap((list) => list ?? []),
    ]) {
      const event = mapGhEvent(raw);
      if (!event) continue;
      if (event.repo && !isOnStation(event.repo, username, org)) continue;
      mapped.push(event);
    }

    const known = new Set(data.knownShas ?? []);
    const pushes = mapped.filter((event) => event.kind === "push" && event.sha && event.repo);
    const toEnrich = pushes
      .filter((event) => event.sha && !known.has(event.sha))
      .slice(0, token ? 4 : 1);

    await Promise.all(
      toEnrich.map(async (event) => {
        if (!event.repo || !event.sha) return;
        const commit = await ghJson<{ files?: { filename?: string }[]; html_url?: string }>(
          `/repos/${event.repo}/commits/${event.sha}`,
          token,
          warnings,
          remaining,
        );
        if (!commit) return;
        event.files = (commit.files ?? [])
          .map((file) => file.filename)
          .filter((name): name is string => Boolean(name))
          .slice(0, 40);
        if (commit.html_url) event.url = commit.html_url;
        const n = event.files.length;
        if (n) {
          event.summary = `Touched ${n} file${n === 1 ? "" : "s"} in ${event.repo}`;
        }
      }),
    );

    if (!profile && mapped.length === 0 && repos.length === 0) {
      warnings.push(`No public GitHub record found for ${username}.`);
    }

    return {
      ok: mapped.length > 0 || Boolean(profile),
      profile: profile ?? null,
      events: mapped,
      repos,
      warnings: [...new Set(warnings)],
      fetchedAt: new Date().toISOString(),
      rateRemaining: remaining.value,
    };
  });
