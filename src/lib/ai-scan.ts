import type { AccessEvent, AiSystem, EventSource, NamedAi } from "./types";

export const AI_CATALOG: { name: string; aliases: string[] }[] = [
  { name: "Grok", aliases: ["grok", "xai", "grok-bot"] },
  { name: "Copilot", aliases: ["copilot", "copilot-swe-agent", "github-copilot"] },
  { name: "Claude", aliases: ["claude", "anthropic"] },
  { name: "ChatGPT", aliases: ["chatgpt", "openai", "gpt-4", "gpt4"] },
  { name: "Gemini", aliases: ["gemini", "bard"] },
  { name: "Cursor", aliases: ["cursor", "cursor-ai"] },
  { name: "Dependabot", aliases: ["dependabot", "dependabot[bot]"] },
  { name: "GitHub Actions", aliases: ["github-actions", "github-actions[bot]", "actions-user"] },
  { name: "Renovate", aliases: ["renovate", "renovate[bot]"] },
  { name: "Perplexity", aliases: ["perplexity"] },
  { name: "Mistral", aliases: ["mistral"] },
];

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function tokenish(value: string): string {
  return norm(value).replace(/\[bot\]$/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function looksLikeBot(login: string): boolean {
  const n = norm(login);
  return n.includes("[bot]") || n.endsWith("-bot") || n.endsWith("[bot]");
}

export function haystack(event: AccessEvent): string {
  return [
    event.actorLogin,
    event.actorName ?? "",
    event.counterpart ?? "",
    event.subject ?? "",
    event.summary,
    event.repo ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

export function aliasHits(text: string, aliases: string[]): boolean {
  const hay = ` ${tokenish(text)} `;
  const raw = ` ${norm(text)} `;
  return aliases.some((alias) => {
    const a = norm(alias);
    if (!a) return false;
    if (raw.includes(a)) return true;
    const t = tokenish(alias);
    return t.length > 1 && hay.includes(` ${t} `);
  });
}

export function eventTouchesSystem(
  event: AccessEvent,
  system: { aliases: string[]; name: string },
): boolean {
  const aliases = [...system.aliases, system.name];
  if (aliasHits(event.actorLogin, aliases)) return true;
  if (event.actorName && aliasHits(event.actorName, aliases)) return true;
  if (event.counterpart && aliasHits(event.counterpart, aliases)) return true;
  return aliasHits(haystack(event), aliases);
}

function catalogMatch(login: string): { name: string; aliases: string[] } | null {
  for (const row of AI_CATALOG) {
    if (aliasHits(login, [row.name, ...row.aliases])) return row;
  }
  if (looksLikeBot(login)) {
    return { name: login.replace(/\[bot\]/gi, "").trim() || login, aliases: [login] };
  }
  return null;
}

export function isAiLogin(login: string, named: NamedAi[]): boolean {
  if (catalogMatch(login)) return true;
  return named.some((ai) => aliasHits(login, [ai.name, ...ai.aliases]));
}

export function trailFor(
  system: { name: string; aliases: string[] },
  events: AccessEvent[],
): AccessEvent[] {
  return events.filter((event) => eventTouchesSystem(event, system));
}

export function deriveAiSystems(
  events: AccessEvent[],
  named: NamedAi[],
  armed: boolean,
): AiSystem[] {
  const map = new Map<string, AiSystem>();

  function upsert(
    id: string,
    name: string,
    aliases: string[],
    origin: "scan" | "named",
    event?: AccessEvent,
  ) {
    const key = norm(name) || id;
    const prior = map.get(key);
    const files = new Set(prior?.files ?? []);
    const places = new Set(prior?.places ?? []);
    const mergedAliases = new Set([...(prior?.aliases ?? []), ...aliases, name]);
    if (event) {
      for (const file of event.files) files.add(file);
      if (event.repo) places.add(event.repo);
      if (event.source) places.add(event.source);
    }
    const lastAt =
      event && (!prior?.lastAt || event.at > prior.lastAt) ? event.at : prior?.lastAt;
    const lastSummary =
      event && (!prior?.lastAt || event.at >= (prior.lastAt ?? ""))
        ? event.summary
        : prior?.lastSummary;
    const lastSource: EventSource | undefined =
      event && (!prior?.lastAt || event.at >= (prior.lastAt ?? ""))
        ? event.source
        : prior?.lastSource;
    map.set(key, {
      id: prior?.id ?? id,
      name: prior?.name ?? name,
      aliases: [...mergedAliases],
      origin: prior?.origin === "named" || origin === "named" ? "named" : "scan",
      tracking: armed,
      running: prior?.running ?? false,
      eventCount: (prior?.eventCount ?? 0) + (event ? 1 : 0),
      lastAt,
      lastSummary,
      lastSource,
      files: [...files],
      places: [...places],
    });
  }

  for (const namedAi of named) {
    upsert(namedAi.id, namedAi.name, namedAi.aliases, "named");
  }

  const chronological = [...events].sort((a, b) => (a.at < b.at ? -1 : 1));
  for (const event of chronological) {
    let hit = false;
    for (const system of [...map.values()]) {
      if (eventTouchesSystem(event, system)) {
        upsert(system.id, system.name, system.aliases, system.origin, event);
        hit = true;
      }
    }
    if (hit) continue;
    const found =
      catalogMatch(event.actorLogin) ??
      (event.counterpart ? catalogMatch(event.counterpart) : null);
    if (found) {
      upsert(`scan-${norm(found.name)}`, found.name, found.aliases, "scan", event);
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.tracking !== b.tracking) return a.tracking ? -1 : 1;
    if ((a.lastAt ?? "") !== (b.lastAt ?? "")) return (a.lastAt ?? "") < (b.lastAt ?? "") ? 1 : -1;
    return b.eventCount - a.eventCount;
  });
}

export function eventTouchesAnyAi(event: AccessEvent, systems: AiSystem[]): boolean {
  return systems.some((system) => eventTouchesSystem(event, system));
}
