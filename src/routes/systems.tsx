import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { EventFeed } from "@/components/event-feed";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { deriveAiSystems, trailFor } from "@/lib/ai-scan";
import { fromTheirComputers, modelPlainLine, statusLabel } from "@/lib/datacenter";
import { SOURCE_LABEL } from "@/lib/github";
import { probeDatacenter } from "@/lib/local-agent";
import { pullTheRecord, pullTheWire } from "@/lib/pull";
import { useStation } from "@/lib/store";
import { relTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/systems")({ component: SystemsPage });

function SystemsPage() {
  const armed = useStation((s) => s.armed);
  const events = useStation((s) => s.events);
  const namedAis = useStation((s) => s.namedAis);
  const settings = useStation((s) => s.settings);
  const known = useStation((s) => s.knownActors);
  const pulling = useStation((s) => s.pulling);
  const localSeated = useStation((s) => s.localSeated);
  const models = useStation((s) => s.datacenterModels);
  const theirModels = fromTheirComputers(models);
  const modelNote = useStation((s) => s.modelNote);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [probing, setProbing] = useState(false);

  const systems = useMemo(
    () => deriveAiSystems(events, namedAis, armed),
    [events, namedAis, armed],
  );
  const tracking = systems.filter((system) => system.tracking);
  const current = systems.find((system) => system.id === selected) ?? systems[0] ?? null;
  const trail = current ? trailFor(current, events) : [];

  async function scan() {
    await Promise.all([pullTheRecord(), pullTheWire(true)]);
    const next = deriveAiSystems(
      useStation.getState().events,
      useStation.getState().namedAis,
      useStation.getState().armed,
    );
    toast(
      `Scan complete. ${next.length} AI system${next.length === 1 ? "" : "s"} in the record. ${
        useStation.getState().armed ? "Following each." : "Turn watching on to follow."
      }`,
    );
  }

  function nameAi(e: FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    useStation.getState().addAi(clean, aliases);
    setName("");
    setAliases("");
    toast(`${clean} named. ${armed ? "Following it." : "Turn watching on to follow it."}`);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        kicker="AIs"
        title="On your computer, or theirs."
        actions={
          <>
            <Button variant="secondary" onClick={() => void scan()} disabled={pulling}>
              {pulling ? "Looking" : "Look now"}
            </Button>
            <Badge tone={armed ? "sage" : "muted"}>
              {armed ? `${tracking.length} watching` : "Off"}
            </Badge>
            <Badge>{systems.length} systems</Badge>
          </>
        }
      >
        Programs on this computer are one thing. The model answering from Anthropic, NVIDIA,
        or OpenAI is another. People you don't know are a third thing — they live on People.
      </PageHeader>

      <Panel className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl">From their computers</h2>
            <p className="mt-1 text-sm text-muted">
              {localSeated
                ? "The company's machine doing the thinking. Claude the app is on your computer. claude-opus is on Anthropic's computers."
                : "Start Honesty Local. A browser tab cannot see their computers."}
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={!localSeated || probing}
            onClick={() => {
              setProbing(true);
              void probeDatacenter().then((ok) => {
                setProbing(false);
                toast(
                  ok
                    ? `Read ${useStation.getState().datacenterModels.length} model${
                        useStation.getState().datacenterModels.length === 1 ? "" : "s"
                      }.`
                    : "Honesty Local did not answer.",
                );
              });
            }}
          >
            {probing ? "Looking" : "See which model"}
          </Button>
        </div>
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
          {theirModels.length === 0 ? (
            <li className="text-sm text-muted">
              {localSeated
                ? "No model picked and none answering right now."
                : "Honesty Local is quiet."}
            </li>
          ) : null}
        </ul>
        {modelNote ? <p className="mt-3 font-mono text-xs text-subtle">{modelNote}</p> : null}
      </Panel>

      <Panel className="mt-6">
        <form onSubmit={nameAi} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-sm">
            Name an AI
            <Input
              className="mt-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Grok, Copilot, a local model"
            />
          </label>
          <label className="block min-w-0 flex-1 text-sm">
            Aliases
            <Input
              className="mt-2"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="optional logins, comma-separated"
            />
          </label>
          <Button type="submit">Watch it</Button>
        </form>
      </Panel>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <Panel>
          <h2 className="text-xl">AIs you're watching</h2>
          <ul className="mt-4 space-y-2">
            {systems.map((system) => (
              <li key={system.id}>
                <button
                  type="button"
                  onClick={() => setSelected(system.id)}
                  className={cn(
                    "w-full rounded-md px-3 py-3 text-left",
                    current?.id === system.id ? "bg-surface-2" : "hover:bg-surface-2",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{system.name}</p>
                    <Badge tone={system.running || system.tracking ? "sage" : "muted"}>
                      {system.running
                        ? "on this computer"
                        : system.tracking
                          ? "watching"
                          : "off"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-subtle">
                    {system.eventCount} time{system.eventCount === 1 ? "" : "s"}
                    {system.lastAt ? ` · ${relTime(system.lastAt)}` : " · not seen yet"}
                  </p>
                </button>
              </li>
            ))}
            {systems.length === 0 ? (
              <li className="text-sm text-muted">Name an AI, or arm the watch to scan.</li>
            ) : null}
          </ul>
        </Panel>

        <Panel className="lg:col-span-2">
          {current ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl">{current.name}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {current.running
                      ? "On this computer now. Honesty Local has it in the process list."
                      : current.tracking
                        ? "Tracker live. Process list, GitHub, mail, and wire hits attach here."
                        : "Named. Turn watching on to follow it."}
                  </p>
                </div>
                {namedAis.some((ai) => ai.id === current.id) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      useStation.getState().removeAi(current.id);
                      setSelected(null);
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-1">
                {current.places.slice(0, 8).map((place) => (
                  <Badge key={place}>
                    {SOURCE_LABEL[place as keyof typeof SOURCE_LABEL] ?? place}
                  </Badge>
                ))}
                {current.files.slice(0, 4).map((file) => (
                  <Badge key={file} tone="paper">
                    {file}
                  </Badge>
                ))}
              </div>
              <EventFeed
                events={trail}
                owner={settings.githubUser}
                known={known}
                empty={
                  current.running
                    ? "On this computer. Pull the desk if the live line is missing."
                    : current.tracking
                      ? "No movement yet. Following the process list, GitHub, mail, and calls."
                      : "No movement in the record. Turn watching on to follow."
                }
              />
            </>
          ) : (
            <p className="py-10 text-sm text-muted">No tracker selected.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
