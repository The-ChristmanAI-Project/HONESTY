import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { isAiLogin } from "@/lib/ai-scan";
import { deriveThreads } from "@/lib/comms";
import { KIND_LABEL, deriveActors, isTrustedActor } from "@/lib/github";
import { useStation } from "@/lib/store";
import { relTime } from "@/lib/time";

export const Route = createFileRoute("/people")({ component: PeoplePage });

function PeoplePage() {
  const events = useStation((s) => s.events);
  const actors = useMemo(() => deriveActors(events), [events]);
  const threads = useMemo(() => deriveThreads(events), [events]);
  const known = useStation((s) => s.knownActors);
  const namedAis = useStation((s) => s.namedAis);
  const owner = useStation((s) => s.settings.githubUser);
  const [name, setName] = useState("");

  const ranked = actors
    .filter((actor) => !isAiLogin(actor.login, namedAis))
    .sort((a, b) => {
      const at = isTrustedActor(a.login, owner, known) ? 1 : 0;
      const bt = isTrustedActor(b.login, owner, known) ? 1 : 0;
      return at - bt || b.eventCount - a.eventCount;
    });

  function addKnown(e: FormEvent) {
    e.preventDefault();
    const login = name.trim();
    if (!login) return;
    useStation.getState().addKnown(login);
    setName("");
    toast(`${login} marked known`);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader kicker="People" title="Who you spoke with.">
        Mail, calls, texts, meetings, GitHub. Named AI programs sit on AIs, not here. The owner
        is known. Anyone else is outside until you name them.
      </PageHeader>

      <form
        onSubmit={addKnown}
        className="mt-6 flex max-w-lg flex-col gap-3 sm:flex-row sm:items-center"
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name or login"
          aria-label="Known person"
        />
        <Button type="submit">Mark known</Button>
      </form>

      {known.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {known.map((login) => (
            <li key={login}>
              <button
                type="button"
                onClick={() => useStation.getState().removeKnown(login)}
                className="min-h-11 rounded-sm border border-border bg-surface px-3 text-sm text-muted hover:text-fg"
              >
                {login} · remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {ranked.length === 0 ? (
          <li className="text-sm text-muted">No people in the record yet. Put a communication on the Wire.</li>
        ) : (
          ranked.map((actor) => {
            const trusted = isTrustedActor(actor.login, owner, known);
            const ai = isAiLogin(actor.login, namedAis);
            const thread = threads.find(
              (item) => item.who.toLowerCase() === actor.login.toLowerCase(),
            );
            return (
              <li key={actor.login}>
                <Panel>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{actor.login}</p>
                      <p className="mt-1 font-mono text-xs tabular-nums text-subtle">
                        {actor.eventCount} event{actor.eventCount === 1 ? "" : "s"}
                        {thread ? ` · ${thread.count} on the wire` : ""}
                        {actor.lastAt ? ` · ${relTime(actor.lastAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      <Badge tone={trusted ? "sage" : "danger"}>{trusted ? "known" : "outside"}</Badge>
                      {ai ? <Badge tone="paper">AI</Badge> : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {actor.kinds.map((kind) => (
                      <Badge key={kind}>{KIND_LABEL[kind]}</Badge>
                    ))}
                  </div>
                  {actor.files.length > 0 ? (
                    <p className="mt-3 truncate font-mono text-xs text-subtle">
                      {actor.files.slice(0, 3).join(" · ")}
                    </p>
                  ) : null}
                  {!trusted ? (
                    <Button
                      className="mt-4"
                      size="sm"
                      variant="secondary"
                      onClick={() => useStation.getState().addKnown(actor.login)}
                    >
                      Mark known
                    </Button>
                  ) : null}
                </Panel>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
