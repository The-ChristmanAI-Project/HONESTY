import { toast } from "sonner";
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

export async function pullLocal(): Promise<boolean> {
  const snap = await probeLocal();
  const was = useStation.getState().localSeated;
  if (!snap) {
    if (was) {
      useStation.getState().markLocalGone();
      toast("Honesty Local went quiet. This desk still has the wire.");
    }
    return false;
  }
  useStation.getState().applyLocal({
    machine: snap.machine,
    platform: snap.platform,
    running: snap.running ?? [],
    events: eventsFromLocal(snap),
  });
  if (!was) {
    const n = snap.running?.length ?? 0;
    toast(
      n
        ? `Honesty Local seated. ${n} AI program${n === 1 ? "" : "s"} running on the computer.`
        : "Honesty Local seated. No named AI desktop program is running.",
    );
  }
  return true;
}
