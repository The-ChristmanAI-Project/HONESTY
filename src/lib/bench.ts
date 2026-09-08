export type BenchWord = {
  word: string;
  start: number;
  end: number;
};

export type BenchBeat = {
  at: number;
  said: string;
  seen: string;
  fit: string;
};

export type BenchWatch = {
  at: number;
  seen: string;
};

export type BenchResult = {
  ok: boolean;
  error?: string;
  filename?: string;
  duration?: number;
  width?: number;
  height?: number;
  has_audio?: boolean;
  has_video?: boolean;
  heard?: string;
  words?: BenchWord[];
  ear?: string | null;
  ear_note?: string | null;
  watched?: boolean;
  watcher?: string | null;
  watch_error?: string | null;
  watch?: BenchWatch[];
  compare?: BenchBeat[];
  breakdown?: string;
  frames?: number;
  disk?: string;
};

const LOCAL = "http://127.0.0.1:8787/api/bench";

export function fitLabel(fit: string): string {
  if (fit === "compare") return "said and seen";
  if (fit === "picture-no-speech") return "picture, no speech";
  if (fit === "said-no-picture") return "speech, no picture yet";
  if (fit === "quiet") return "quiet";
  return fit;
}

export function stamp(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export async function dropRecording(file: File, xai = ""): Promise<BenchResult> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 240000);
  try {
    const res = await fetch(LOCAL, {
      method: "POST",
      headers: {
        "X-Honesty-Filename": file.name,
        ...(xai.trim() ? { "X-Honesty-Xai": xai.trim() } : {}),
      },
      body: file,
      signal: ctrl.signal,
    });
    const data = (await res.json()) as BenchResult;
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || `Bench returned ${res.status}.` };
    }
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : "network";
    if (message.toLowerCase().includes("abort")) {
      return { ok: false, error: "The bench ran long and stopped. Try a shorter clip." };
    }
    return { ok: false, error: "Honesty Local did not take the recording. Start Local first." };
  } finally {
    window.clearTimeout(timer);
  }
}
