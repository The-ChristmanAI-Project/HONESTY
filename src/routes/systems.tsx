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
import { SOURCE_LABEL } from "@/lib/github";
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
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");

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
        useStation.getState().armed ? "Following each." : "Arm the watch to follow."
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
    toast(`${clean} named. ${armed ? "Tracker started." : "Arm the watch to follow it."}`);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        kicker="AI systems"
        title="Scan, then follow."
        actions={
          <>
            <Button variant="secondary" onClick={() => void scan()} disabled={pulling}>
              {pulling ? "Scanning" : "Scan now"}
            </Button>
            <Badge tone={armed ? "sage" : "muted"}>
              {armed ? `${tracking.length} tracking` : "At rest"}
            </Badge>
            <Badge>{systems.length} systems</Badge>
          </>
        }
      >
        Honesty Local reads named AI programs on this computer. Arm the watch to follow each
        name through GitHub, mail, and the wire.
      </PageHeader>

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
          <h2 className="text-xl">Trackers</h2>
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
                          ? "following"
                          : "at rest"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-subtle">
                    {system.eventCount} · {system.origin}
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
                        : "Named. Arm the watch to follow it through the record."}
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
                      ? "No movement yet. Following the process list, GitHub, mail, and the wire."
                      : "No movement in the record. Arm the watch to follow."
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
