import { toast } from "sonner";
import { probeBody, reasoningLine } from "./datacenter";
import { readVault, seatedCount, type KeyVault } from "./keys";
import { eventsFromLocal, type LocalSnapshot } from "./local-events";
import { useStation } from "./store";

export type {
  LocalLedgerItem,
  LocalProcess,
  LocalSeen,
  LocalSnapshot,
} from "./local-events";
export { eventsFromLocal, pruneStaleLive } from "./local-events";

const LOCAL_URL = "http://127.0.0.1:8787";

export async function probeLocal(): Promise<LocalSnapshot | null> {
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 900);
    const res = await fetch(`${LOCAL_URL}/api/status`, { signal: ctrl.signal });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as LocalSnapshot;
  } catch {
    return null;
  }
}

function applySnap(snap: LocalSnapshot) {
  useStation.getState().applyLocal({
    machine: snap.machine,
    platform: snap.platform,
    running: snap.running ?? [],
    models: snap.models ?? [],
    modelNote: snap.model_note ?? null,
    events: eventsFromLocal(snap),
  });
}

export async function pullLocal(): Promise<boolean> {
  const snap = await probeLocal();
  const was = useStation.getState().localSeated;
  if (!snap) {
    if (was) {
      useStation.getState().markLocalGone();
      toast("Honesty Local went quiet. This desk still has the record.");
    }
    return false;
  }
  applySnap(snap);
  if (!was) {
    const n = snap.running?.length ?? 0;
    const model = reasoningLine(snap.models ?? []);
    toast(
      [
        n
          ? `Honesty Local seated. ${n} AI program${n === 1 ? "" : "s"} on the computer.`
          : "Honesty Local seated. No named AI desktop program is running.",
        model ? `Reasoning: ${model}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  return true;
}

export async function probeDatacenter(vault?: KeyVault): Promise<boolean> {
  const seated = vault ?? readVault();
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(`${LOCAL_URL}/api/models/probe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(probeBody(seated)),
      signal: ctrl.signal,
    });
    window.clearTimeout(timer);
    if (!res.ok) return false;
    const snap = await probeLocal();
    if (snap) applySnap(snap);
    return true;
  } catch {
    return false;
  }
}

export async function pullDatacenterIfKeyed(): Promise<void> {
  if (!useStation.getState().localSeated) return;
  if (seatedCount(readVault()) === 0) return;
  await probeDatacenter();
}
