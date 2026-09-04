import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import {
  CONDUCTOR_LOCAL,
  pullConductorFeed,
  publishConductor,
  seatConductorHook,
  type ConductorFeed,
  type ConductorStatus,
} from "@/lib/conductor";
import { pullLocal } from "@/lib/local-agent";
import { useStation } from "@/lib/store";
import { relTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/conductor")({ component: ConductorPage });

const STATUS_TONE: Record<ConductorStatus, "sage" | "paper" | "muted" | "danger"> = {
  clean: "sage",
  review: "paper",
  blocked: "paper",
  empty: "muted",
  dark: "danger",
};

const STATUS_LABEL: Record<ConductorStatus, string> = {
  clean: "running",
  review: "seen — not running",
  blocked: "blocked",
  empty: "named — not seen",
  dark: "quiet too long",
};

function ConductorPage() {
  const localSeated = useStation((s) => s.localSeated);
  const localMachine = useStation((s) => s.localMachine);
  const [feed, setFeed] = useState<ConductorFeed | null>(null);
  const [hook, setHook] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    await pullLocal();
    const next = await pullConductorFeed();
    setFeed(next);
    if (next) {
      useStation.getState().applyConductor(next);
      publishConductor(next);
    }
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(id);
  }, []);

  async function seatHook(e: React.FormEvent) {
    e.preventDefault();
    const url = hook.trim();
    if (!url) return;
    setBusy(true);
    const ok = await seatConductorHook(url);
    setBusy(false);
    toast(
      ok
        ? "Conductor hook seated. Honesty Local will POST each scan there."
        : "Could not seat the hook. Start Honesty Local first.",
    );
  }

  const beings = feed?.beings ?? [];
  const running = beings.filter((b) => b.status === "clean").length;
  const quiet = beings.filter((b) => b.status === "dark" || b.status === "empty").length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        kicker="Conductor"
        title="Honesty on the board."
        actions={
          <>
            <Button variant="secondary" onClick={() => void refresh()}>
              Scan now
            </Button>
            <Badge tone={feed ? "sage" : "muted"}>{feed ? "feed live" : "no feed"}</Badge>
            <Badge tone={localSeated ? "sage" : "muted"}>
              {localSeated ? "Local seated" : "Local quiet"}
            </Badge>
          </>
        }
      >
        The Conductor is the ruling board. Honesty sends who is running on this computer, live,
        every eight seconds. The 814KB Conductor artifact has no ingest of its own — this page and
        <span className="font-mono"> {CONDUCTOR_LOCAL}/conductor </span>
        are the seated rail. Open both. They share one feed.
      </PageHeader>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Panel>
          <p className="kicker">Running now</p>
          <p className="mt-2 font-display text-3xl">{running}</p>
          <p className="mt-1 text-sm text-muted">in the process list</p>
        </Panel>
        <Panel>
          <p className="kicker">Quiet / unnamed-on-disk</p>
          <p className="mt-2 font-display text-3xl">{quiet}</p>
          <p className="mt-1 text-sm text-muted">not in the process list</p>
        </Panel>
        <Panel>
          <p className="kicker">Machine</p>
          <p className="mt-2 font-display text-xl">{feed?.machine || localMachine || "—"}</p>
          <p className="mt-1 font-mono text-xs text-subtle">
            {feed?.last_scan ? relTime(feed.last_scan) : "no scan yet"}
            {feed?.armed ? " · armed" : " · at rest"}
          </p>
        </Panel>
      </div>

      <Panel className="mt-6">
        <h2 className="text-xl">Beings on the Honesty wing</h2>
        <p className="mt-2 text-sm text-muted">
          clean = running on this computer. review = seen before, not running now. empty / dark =
          named in the catalog, not on the process list. Browser tabs do not appear here.
        </p>
        <ul className="mt-4 divide-y divide-border">
          {beings.length === 0 ? (
            <li className="py-6 text-sm text-muted">
              {feed
                ? "Honesty Local is seated. No named AI desktop program is running."
                : "Start Honesty Local on this computer. Then this board fills."}
            </li>
          ) : (
            beings.map((being) => (
              <li key={being.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{being.name}</p>
                  <p className="text-sm text-muted">{being.mandate}</p>
                  <p className="mt-1 font-mono text-xs text-subtle">
                    {being.pids.length ? `pid ${being.pids.join(", ")} · ` : ""}
                    {being.artifacts} scans
                    {being.lastAt ? ` · ${relTime(being.lastAt)}` : ""}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[being.status]}>{STATUS_LABEL[being.status]}</Badge>
              </li>
            ))
          )}
        </ul>
      </Panel>

      <Panel className="mt-6">
        <h2 className="text-xl">Live ledger to the Conductor</h2>
        <ul className="mt-4 divide-y divide-border">
          {(feed?.ledger ?? []).slice().reverse().slice(0, 24).map((row) => (
            <li key={`${row.kind}-${row.name}-${row.at}`} className="py-3">
              <p>{row.summary}</p>
              <p className="font-mono text-xs text-subtle">
                {row.kind} · {relTime(row.at)}
              </p>
            </li>
          ))}
          {!feed?.ledger?.length ? (
            <li className="py-6 text-sm text-muted">No movement posted yet.</li>
          ) : null}
        </ul>
      </Panel>

      <Panel className="mt-6">
        <h2 className="text-xl">Seat a Conductor hook</h2>
        <p className="mt-2 text-sm text-muted">
          If The Conductor (or any other board) exposes a POST URL, Honesty Local will send the
          snapshot there after every scan. Leave empty if you only need this rail and{" "}
          <a className="text-muted underline" href={`${CONDUCTOR_LOCAL}/conductor`}>
            the Local conductor page
          </a>
          .
        </p>
        <form onSubmit={(e) => void seatHook(e)} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="http://127.0.0.1:9xxx/honesty"
            aria-label="Conductor hook URL"
          />
          <Button type="submit" disabled={busy || !hook.trim()}>
            Seat hook
          </Button>
        </form>
        <p className={cn("mt-3 font-mono text-xs text-subtle")}>
          BroadcastChannel honesty-conductor · GET {CONDUCTOR_LOCAL}/api/conductor
        </p>
      </Panel>
    </div>
  );
}
