import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { UnknownPersonRow } from "@/components/unknown-person";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { isAiLogin } from "@/lib/ai-scan";
import { deriveThreads } from "@/lib/comms";
import { KIND_LABEL, deriveActors, isTrustedActor } from "@/lib/github";
import { deriveUnknownPeople } from "@/lib/people";
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

  const unknown = useMemo(
    () => deriveUnknownPeople(events, owner, known, namedAis, (login) => isAiLogin(login, namedAis)),
    [events, owner, known, namedAis],
  );
  const knownPeople = actors.filter(
    (actor) =>
      !isAiLogin(actor.login, namedAis) && isTrustedActor(actor.login, owner, known),
  );

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
      <PageHeader kicker="People" title="Who showed up.">
        People you don't know are accounts in GitHub, mail, or calls that you have not named.
        They are not the model on Anthropic's computers. Named AIs sit on AIs.
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

      <h2 className="mt-10 text-xl">People you don't know</h2>
      <p className="mt-2 max-w-[62ch] text-sm text-muted">
        Name, where they showed up, and what they did. Press I know them if they belong here.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {unknown.length === 0 ? (
          <li className="text-sm text-muted">
            Nobody unknown in the record. A new GitHub account or mail address lands here first.
          </li>
        ) : (
          unknown.map((person) => (
            <li key={person.login}>
              <Panel>
                <UnknownPersonRow person={person} />
              </Panel>
            </li>
          ))
        )}
      </ul>

      <h2 className="mt-10 text-xl">People you know</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {knownPeople.length === 0 ? (
          <li className="text-sm text-muted">You, so far. Name someone above to keep them here.</li>
        ) : (
          knownPeople.map((actor) => {
            const thread = threads.find(
              (item) => item.who.toLowerCase() === actor.login.toLowerCase(),
            );
            return (
              <li key={actor.login}>
                <Panel>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{actor.name ?? actor.login}</p>
                      <p className="mt-1 font-mono text-xs tabular-nums text-subtle">
                        {actor.eventCount} time{actor.eventCount === 1 ? "" : "s"}
                        {thread ? ` · ${thread.count} mail or calls` : ""}
                        {actor.lastAt ? ` · ${relTime(actor.lastAt)}` : ""}
                      </p>
                    </div>
                    <Badge tone="sage">you know them</Badge>
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
                </Panel>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
