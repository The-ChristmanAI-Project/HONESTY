import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EventFeed } from "@/components/event-feed";
import { UnknownPersonRow } from "@/components/unknown-person";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { deriveAiSystems, eventTouchesAnyAi, isAiLogin, isOutsideEvent } from "@/lib/ai-scan";
import { deriveThreads } from "@/lib/comms";
import { deriveUnknownPeople } from "@/lib/people";
import {
  currentFromTheirComputers,
  currentOnYourComputer,
  modelPlainLine,
  statusLabel,
} from "@/lib/datacenter";
import { deriveFiles, isComms } from "@/lib/github";
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
  const datacenterModels = useStation((s) => s.datacenterModels);
  const liveLocal = namedAis.filter((ai) => ai.running && ai.runningFrom === "local");
  const theirModels = currentFromTheirComputers(datacenterModels);
  const localModels = currentOnYourComputer(datacenterModels);
  const files = useMemo(() => deriveFiles(events), [events]);
  const comms = useMemo(() => events.filter(isComms), [events]);
  const threads = useMemo(() => deriveThreads(events), [events]);
  const systems = useMemo(
    () => deriveAiSystems(events, namedAis, armed),
    [events, namedAis, armed],
  );
  const [filter, setFilter] = useState<"all" | "github" | "mail" | "outside" | "ai">("all");
  const FILTER_LABEL = {
    all: "all",
    github: "GitHub",
    mail: "mail",
    ai: "AIs",
    outside: "strangers",
  } as const;

  const unknownPeople = useMemo(
    () =>
      deriveUnknownPeople(events, settings.githubUser, known, namedAis, (login) =>
        isAiLogin(login, namedAis),
      ),
    [events, settings.githubUser, known, namedAis],
  );
  const outside = unknownPeople;

  const shown = useMemo(() => {
    return events.filter((event) => {
      if (filter === "github") return event.source === "github";
      if (filter === "mail") return isComms(event);
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
      toast("Watching. Checking GitHub, mail, and AIs.");
      await pullTheRecord();
      await pullTheWire();
      const found = deriveAiSystems(
        useStation.getState().events,
        useStation.getState().namedAis,
        true,
      );
      toast(
        `Found ${found.length} AI${found.length === 1 ? "" : "s"}. Following each.`,
      );
    } else {
      toast("Stopped. Your record stays.");
    }
  }

  async function onPull() {
    const [record, wire] = await Promise.all([pullTheRecord(), pullTheWire(true)]);
    const n = (record?.events.length ?? 0) + (wire?.events.length ?? 0);
    if (n > 0 || record?.ok) {
      toast(`Updated · ${n} this time`);
    } else {
      toast(record?.warnings[0] ?? "Pull returned no events. The ledger you wrote stays.");
    }
  }

  return (
    <div className="stagger-in mx-auto max-w-5xl">
      <PageHeader
        kicker="Your desk"
        title="The record, without spin."
        actions={
          <>
            <Button size="lg" variant={armed ? "secondary" : "primary"} onClick={() => void onArm()}>
              {armed ? "Stop watching" : "Start watching"}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => void onPull()} disabled={pulling}>
              <RefreshCw className={cn("size-4", pulling && "animate-spin")} strokeWidth={1.75} />
              Refresh
            </Button>
          </>
        }
      >
        An AI can run in two places: this computer, or the company's computers (Anthropic,
        NVIDIA, OpenAI). That is not "people you don't know." No paywall.
      </PageHeader>

      <div className="mt-8 grid items-start gap-4 sm:grid-cols-2">
        <Panel>
          <p className="kicker">On your computer</p>
          <h2 className="mt-2 text-xl">Programs here</h2>
          <p className="mt-1 text-sm text-muted">
            Claude, Cursor, Ollama — the apps on this machine.
          </p>
          <ul className="mt-4 space-y-3">
            {liveLocal.map((ai) => (
              <li key={ai.id} className="min-w-0">
                <p className="truncate font-medium">{ai.name}</p>
                <p className="font-mono text-xs text-subtle">app on {localMachine ?? "this computer"}</p>
              </li>
            ))}
            {localModels.map((model) => (
              <li key={`${model.provider}-${model.id}`} className="min-w-0">
                <p className="truncate font-medium">{model.name}</p>
                <p className="font-mono text-xs text-subtle">model on this computer</p>
              </li>
            ))}
            {!localSeated ? (
              <li className="text-sm text-muted">Honesty Local is off. Start it to see apps on this computer.</li>
            ) : liveLocal.length === 0 && localModels.length === 0 ? (
              <li className="text-sm text-muted">No named AI app is running here right now.</li>
            ) : null}
          </ul>
        </Panel>
        <Panel>
          <p className="kicker">From their computers</p>
          <h2 className="mt-2 text-xl">The model answering</h2>
          <p className="mt-1 text-sm text-muted">
            The company's machine doing the thinking. Not a person. Not a stranger on GitHub.
          </p>
          <ul className="mt-4 space-y-3">
            {theirModels.map((model) => (
              <li key={`${model.provider}-${model.id}-${model.source}`} className="min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">{model.name}</p>
                  <Badge tone={model.status === "in_use" ? "sage" : "muted"}>
                    {statusLabel(model)}
                  </Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-subtle">{modelPlainLine(model)}</p>
              </li>
            ))}
            {!localSeated ? (
              <li className="text-sm text-muted">Honesty Local is off. Start it to see who is answering from their computers.</li>
            ) : theirModels.length === 0 ? (
              <li className="text-sm text-muted">None answering right now.</li>
            ) : null}
          </ul>
          <Link
            to="/systems"
            className="mt-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-fg"
          >
            Full list
          </Link>
        </Panel>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Mail & calls" value={comms.length} />
        <Stat label="On your computer" value={liveLocal.length} />
        <Stat label="From their computers" value={theirModels.length} />
        <Stat label="People you don't know" value={outside.length} alert={outside.length > 0} />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
        <Badge tone={armed ? "sage" : "muted"}>{armed ? "Watching" : "Off"}</Badge>
        <span className="font-mono tabular-nums">
          Last update {lastFetchedAt ? relTime(lastFetchedAt) : "not yet"}
        </span>
        <span className="font-mono">@{settings.githubUser}</span>
      </div>
      {warnings[0] ? <p className="mt-3 text-sm text-danger">{warnings[0]}</p> : null}
      {mailWarning ? (
        <p className="mt-2 text-sm text-muted">Mail is optional. Record by hand either way.</p>
      ) : null}

      <Panel className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Not the cloud AI</p>
            <h2 className="mt-2 text-xl">People you don't know</h2>
            <p className="mt-1 max-w-[62ch] text-sm text-muted">
              Accounts that showed up in GitHub, mail, or calls. You have not named them. They
              are not you. They are not Claude on this computer.
            </p>
          </div>
          <Badge tone={unknownPeople.length ? "danger" : "muted"}>
            {unknownPeople.length} {unknownPeople.length === 1 ? "person" : "people"}
          </Badge>
        </div>
        <ul className="mt-4 divide-y divide-border">
          {unknownPeople.slice(0, 6).map((person) => (
            <li key={person.login}>
              <UnknownPersonRow person={person} />
            </li>
          ))}
          {unknownPeople.length === 0 ? (
            <li className="py-4 text-sm text-muted">
              Nobody unknown in the record right now. A new GitHub account, mail address, or
              name in a call lands here until you say you know them.
            </li>
          ) : null}
        </ul>
        <Link
          to="/people"
          className="mt-2 inline-flex min-h-11 items-center text-sm text-muted hover:text-fg"
        >
          Everyone
        </Link>
      </Panel>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl">Live ledger</h2>
            <div className="flex flex-wrap gap-1">
              {(["all", "github", "mail", "ai", "outside"] as const).map((key) => (
                <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
                  {FILTER_LABEL[key]}
                </Chip>
              ))}
            </div>
          </div>
          <EventFeed
            events={shown.slice(0, 24)}
            owner={settings.githubUser}
            known={known}
            isAi={(event) => eventTouchesAnyAi(event, systems)}
            empty="Nothing here yet. Start watching, or refresh."
          />
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel>
            <h2 className="text-xl">People you talked to</h2>
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
                <li className="text-sm text-muted">No mail or calls yet. Open Mail & calls and write it.</li>
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
                Mail & calls
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
