import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EventFeed } from "@/components/event-feed";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { deriveAiSystems, eventTouchesAnyAi, isOutsideEvent, isOutsidePerson } from "@/lib/ai-scan";
import { deriveChannels, deriveThreads } from "@/lib/comms";
import { deriveActors, deriveFiles, isComms } from "@/lib/github";
import { pullTheRecord, pullTheWire } from "@/lib/pull";
import { useStation } from "@/lib/store";
import { relTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Desk });

function Desk() {
  const armed = useStation((s) => s.armed);
  const pulling = useStation((s) => s.pulling);
  const events = useStation((s) => s.events);
  const settings = useStation((s) => s.settings);
  const known = useStation((s) => s.knownActors);
  const lastFetchedAt = useStation((s) => s.lastFetchedAt);
  const warnings = useStation((s) => s.warnings);
  const mailWarning = useStation((s) => s.mailWarning);
  const namedAis = useStation((s) => s.namedAis);
  const localSeated = useStation((s) => s.localSeated);
  const localMachine = useStation((s) => s.localMachine);
  const liveLocal = namedAis.filter((ai) => ai.running && ai.runningFrom === "local");
  const files = useMemo(() => deriveFiles(events), [events]);
  const actors = useMemo(() => deriveActors(events), [events]);
  const comms = useMemo(() => events.filter(isComms), [events]);
  const channels = useMemo(() => deriveChannels(events), [events]);
  const threads = useMemo(() => deriveThreads(events), [events]);
  const systems = useMemo(
    () => deriveAiSystems(events, namedAis, armed),
    [events, namedAis, armed],
  );
  const [filter, setFilter] = useState<"all" | "github" | "wire" | "outside" | "ai">("all");

  const voiceCount =
    (channels.find((c) => c.key === "call")?.count ?? 0) +
    (channels.find((c) => c.key === "meeting")?.count ?? 0);

  const outside = actors.filter((actor) =>
    isOutsidePerson(actor.login, settings.githubUser, known, namedAis),
  );

  const shown = useMemo(() => {
    return events.filter((event) => {
      if (filter === "github") return event.source === "github";
      if (filter === "wire") return isComms(event);
      if (filter === "ai") return eventTouchesAnyAi(event, systems);
      if (filter === "outside") {
        return isOutsideEvent(event, settings.githubUser, known, namedAis);
      }
      return true;
    });
  }, [events, filter, settings.githubUser, known, namedAis, systems]);

  async function onArm() {
    const next = !armed;
    useStation.getState().setArmed(next);
    if (next) {
      toast("Watch armed. Scanning AI systems, then following each in the record.");
      await pullTheRecord();
      await pullTheWire();
      const found = deriveAiSystems(
        useStation.getState().events,
        useStation.getState().namedAis,
        true,
      );
      toast(
        `Scan complete. ${found.length} AI system${found.length === 1 ? "" : "s"} on the watch. Following each.`,
      );
    } else {
      toast("Watch at rest. The ledger stays.");
    }
  }

  async function onPull() {
    const [record, wire] = await Promise.all([pullTheRecord(), pullTheWire(true)]);
    const n = (record?.events.length ?? 0) + (wire?.events.length ?? 0);
    if (n > 0 || record?.ok) {
      toast(`Record pulled · ${n} this pass`);
    } else {
      toast(record?.warnings[0] ?? "Pull returned no events. The ledger you wrote stays.");
    }
  }

  return (
    <div className="stagger-in mx-auto max-w-5xl">
      <PageHeader
        kicker="Home station desk"
        title="The record, without spin."
        actions={
          <>
            <Button size="lg" variant={armed ? "secondary" : "primary"} onClick={() => void onArm()}>
              {armed ? "Stand down" : "Arm the watch"}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => void onPull()} disabled={pulling}>
              <RefreshCw className={cn("size-4", pulling && "animate-spin")} strokeWidth={1.75} />
              Pull now
            </Button>
          </>
        }
      >
        Honesty Local reads named AI programs on this computer. Arm the watch for GitHub, mail,
        and the wire. Not a kernel hook. Not a paywall.
      </PageHeader>

      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="On the wire" value={comms.length} />
        <Stat label="AIs" value={systems.length} />
        <Stat label="Voice" value={voiceCount} />
        <Stat label="Outside" value={outside.length} alert={outside.length > 0} />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
        <Badge tone={armed ? "sage" : "muted"}>{armed ? "Armed" : "At rest"}</Badge>
        <span className="font-mono tabular-nums">
          Last pull {lastFetchedAt ? relTime(lastFetchedAt) : "not yet"}
        </span>
        <span className="font-mono">@{settings.githubUser}</span>
        <span className="font-mono">
          {localSeated
            ? `${localMachine ?? "Local"}: ${
                liveLocal.length ? liveLocal.map((ai) => ai.name).join(" · ") : "no named AI running"
              }`
            : "Honesty Local quiet"}
        </span>
      </div>
      {warnings[0] ? <p className="mt-3 text-sm text-danger">{warnings[0]}</p> : null}
      {mailWarning ? (
        <p className="mt-2 text-sm text-muted">Mail is optional. Record by hand either way.</p>
      ) : null}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl">Live ledger</h2>
            <div className="flex flex-wrap gap-1">
              {(["all", "github", "wire", "ai", "outside"] as const).map((key) => (
                <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
                  {key}
                </Chip>
              ))}
            </div>
          </div>
          <EventFeed
            events={shown.slice(0, 24)}
            owner={settings.githubUser}
            known={known}
            isAi={(event) => eventTouchesAnyAi(event, systems)}
            empty="No events in this filter. Arm the watch or pull the record."
          />
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel>
            <h2 className="text-xl">AI systems</h2>
            <ul className="mt-4 space-y-3">
              {systems.slice(0, 6).map((system) => (
                <li key={system.id} className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{system.name}</p>
                    <Badge tone={system.running || system.tracking ? "sage" : "muted"}>
                      {system.running
                        ? "on this computer"
                        : system.tracking
                          ? "following"
                          : "at rest"}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-subtle">
                    {system.eventCount} hits
                    {system.lastAt ? ` · ${relTime(system.lastAt)}` : " · not seen yet"}
                  </p>
                </li>
              ))}
              {systems.length === 0 ? (
                <li className="text-sm text-muted">Arm the watch to scan, or name an AI on Systems.</li>
              ) : null}
            </ul>
            <Link
              to="/systems"
              className="mt-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-fg"
            >
              Open trackers
            </Link>
          </Panel>

          <Panel>
            <h2 className="text-xl">People on the wire</h2>
            <ul className="mt-4 space-y-3">
              {threads.slice(0, 6).map((thread) => (
                <li key={thread.key} className="min-w-0">
                  <p className="truncate text-sm font-medium">{thread.who}</p>
                  <p className="truncate text-xs text-subtle">
                    {thread.count} · {relTime(thread.lastAt)} · {thread.lastSummary}
                  </p>
                </li>
              ))}
              {threads.length === 0 ? (
                <li className="text-sm text-muted">No communication yet. Open the Wire and write it.</li>
              ) : null}
            </ul>
            <div className="mt-4 flex flex-wrap gap-x-4">
              <Link
                to="/people"
                className="inline-flex min-h-11 items-center text-sm text-muted hover:text-fg"
              >
                Full list
              </Link>
              <Link
                to="/wire"
                className="inline-flex min-h-11 items-center text-sm text-muted hover:text-fg"
              >
                The wire
              </Link>
            </div>
          </Panel>

          <Panel>
            <h2 className="text-xl">Latest files</h2>
            <ul className="mt-4 space-y-2">
              {files.slice(0, 7).map((file) => (
                <li key={`${file.source}:${file.path}`} className="min-w-0">
                  <p className="truncate font-mono text-xs text-fg">{file.path}</p>
                  <p className="text-xs text-subtle">
                    {file.lastActor} · {relTime(file.lastAt)}
                  </p>
                </li>
              ))}
              {files.length === 0 ? (
                <li className="text-sm text-muted">No file paths yet.</li>
              ) : null}
            </ul>
            <Link
              to="/ledger"
              className="mt-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-fg"
            >
              Open ledger
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  alert,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-4">
      <dt className="kicker">{label}</dt>
      <dd
        className={cn(
          "mt-2 font-display text-2xl tabular-nums tracking-tight",
          alert ? "text-danger" : "text-fg",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
