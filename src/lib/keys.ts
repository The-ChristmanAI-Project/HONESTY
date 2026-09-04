const STORAGE = "honesty.keys.v1";

export type KeySlotId = "nvidia" | "ollama" | "aws" | "openai" | "anthropic";

export type KeyVault = {
  nvidia: string;
  ollama: string;
  openai: string;
  anthropic: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
};

export const EMPTY_VAULT: KeyVault = {
  nvidia: "",
  ollama: "",
  openai: "",
  anthropic: "",
  awsAccessKeyId: "",
  awsSecretAccessKey: "",
  awsRegion: "",
};

export const KEY_SLOTS: {
  id: KeySlotId;
  label: string;
  hint: string;
}[] = [
  { id: "nvidia", label: "NVIDIA", hint: "NVIDIA_API_KEY or NGC_API_KEY" },
  { id: "ollama", label: "Ollama", hint: "OLLAMA_API_KEY" },
  { id: "aws", label: "AWS", hint: "access key, secret, region" },
  { id: "openai", label: "OpenAI", hint: "OPENAI_API_KEY" },
  { id: "anthropic", label: "Anthropic", hint: "ANTHROPIC_API_KEY" },
];

const ALIASES: Record<string, keyof KeyVault> = {
  NVIDIA_API_KEY: "nvidia",
  NGC_API_KEY: "nvidia",
  NVAPI_KEY: "nvidia",
  NVIDIA_KEY: "nvidia",
  OLLAMA_API_KEY: "ollama",
  OLLAMA_KEY: "ollama",
  OPENAI_API_KEY: "openai",
  OPENAI_KEY: "openai",
  ANTHROPIC_API_KEY: "anthropic",
  ANTHROPIC_KEY: "anthropic",
  CLAUDE_API_KEY: "anthropic",
  AWS_ACCESS_KEY_ID: "awsAccessKeyId",
  AWS_SECRET_ACCESS_KEY: "awsSecretAccessKey",
  AWS_REGION: "awsRegion",
  AWS_DEFAULT_REGION: "awsRegion",
};

export function emptyVault(): KeyVault {
  return { ...EMPTY_VAULT };
}

export function readVault(): KeyVault {
  if (typeof window === "undefined") return emptyVault();
  try {
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return emptyVault();
    const parsed = JSON.parse(raw) as Partial<KeyVault>;
    return {
      nvidia: typeof parsed.nvidia === "string" ? parsed.nvidia : "",
      ollama: typeof parsed.ollama === "string" ? parsed.ollama : "",
      openai: typeof parsed.openai === "string" ? parsed.openai : "",
      anthropic: typeof parsed.anthropic === "string" ? parsed.anthropic : "",
      awsAccessKeyId: typeof parsed.awsAccessKeyId === "string" ? parsed.awsAccessKeyId : "",
      awsSecretAccessKey:
        typeof parsed.awsSecretAccessKey === "string" ? parsed.awsSecretAccessKey : "",
      awsRegion: typeof parsed.awsRegion === "string" ? parsed.awsRegion : "",
    };
  } catch {
    return emptyVault();
  }
}

export function writeVault(vault: KeyVault) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE, JSON.stringify(vault));
}

export function clearVault() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE);
}

export function slotSeated(vault: KeyVault, id: KeySlotId): boolean {
  if (id === "aws") return Boolean(vault.awsAccessKeyId && vault.awsSecretAccessKey);
  return Boolean(vault[id]);
}

export function maskSecret(value: string): string {
  const clean = value.trim();
  if (!clean) return "";
  if (clean.length <= 4) return "••••";
  return `•••• ${clean.slice(-4)}`;
}

export function seatedCount(vault: KeyVault): number {
  return KEY_SLOTS.filter((slot) => slotSeated(vault, slot.id)).length;
}

function assign(vault: KeyVault, name: string, value: string) {
  const key = name.trim().replace(/^export\s+/i, "").replace(/["']/g, "");
  const mapped = ALIASES[key.toUpperCase()] ?? ALIASES[key];
  const clean = value.trim().replace(/^["']|["']$/g, "");
  if (!mapped || !clean) return;
  vault[mapped] = clean;
}

function guessBare(vault: KeyVault, value: string) {
  const clean = value.trim();
  if (!clean || clean.includes("\n") || clean.includes("=")) return;
  if (clean.startsWith("sk-ant-")) vault.anthropic = clean;
  else if (clean.startsWith("sk-")) vault.openai = clean;
  else if (/^AKIA[0-9A-Z]{16}$/i.test(clean)) vault.awsAccessKeyId = clean;
  else if (/^nvapi-/i.test(clean) || /^nvdev-/i.test(clean)) vault.nvidia = clean;
}

export function parseDroppedText(text: string, current: KeyVault): KeyVault {
  const next = { ...current };
  const body = text.replace(/^\uFEFF/, "").trim();
  if (!body) return next;

  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    if (json && typeof json === "object" && !Array.isArray(json)) {
      for (const [name, value] of Object.entries(json)) {
        if (typeof value === "string") assign(next, name, value);
      }
      return next;
    }
  } catch {
    /* not JSON */
  }

  const lines = body.split(/\r?\n/);
  let inDefault = true;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    const profile = trimmed.match(/^\[(.+)]$/);
    if (profile) {
      inDefault = profile[1].toLowerCase() === "default";
      continue;
    }
    const env = trimmed.match(/^(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (env) {
      assign(next, env[1], env[2]);
      continue;
    }
    const cred = trimmed.match(/^(aws_access_key_id|aws_secret_access_key|region)\s*=\s*(.+)$/i);
    if (cred && inDefault) {
      assign(
        next,
        cred[1].toLowerCase() === "region" ? "AWS_REGION" : cred[1].toUpperCase(),
        cred[2],
      );
    }
  }

  if (lines.length === 1) guessBare(next, body);
  return next;
}

export async function parseDroppedFiles(files: FileList | File[], current: KeyVault): Promise<KeyVault> {
  let next = { ...current };
  for (const file of Array.from(files)) {
    const text = await file.text();
    next = parseDroppedText(text, next);
  }
  return next;
}
