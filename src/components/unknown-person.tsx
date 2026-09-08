import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  findOutWho,
  githubUrlFor,
  type UnknownPerson,
  type WhoResult,
} from "@/lib/people";
import { readToken, useStation } from "@/lib/store";
import { relTime } from "@/lib/time";

export function UnknownPersonRow({ person }: { person: UnknownPerson }) {
  const [who, setWho] = useState<WhoResult | null>(null);
  const [looking, setLooking] = useState(false);

  async function look() {
    setLooking(true);
    const result = await findOutWho(person, readToken() || undefined);
    setWho(result);
    setLooking(false);
  }

  const github = githubUrlFor(person.login);

  return (
    <div className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{person.name ?? person.login}</p>
          <p className="mt-1 text-sm text-muted">
            {person.lastSource}
            {person.lastWhere ? ` · ${person.lastWhere}` : ""} · {person.lastWhat}
            {person.lastAt ? ` · ${relTime(person.lastAt)}` : ""}
          </p>
          <p className="mt-1 text-sm text-subtle">{person.why}</p>
          {person.lastSummary ? (
            <p className="mt-1 text-sm text-muted">{person.lastSummary}</p>
          ) : null}
        </div>
        <Badge tone="danger">you don't know them</Badge>
      </div>

      {who ? (
        <div className="mt-3 rounded-md border border-border bg-surface-2 px-3 py-3">
          <p className="font-medium">{who.heading}</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {who.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" disabled={looking} onClick={() => void look()}>
          {looking ? "Looking" : who ? "Look again" : "Who is this"}
        </Button>
        {github ? (
          <a
            href={github}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-sm border border-border bg-surface px-3 text-sm hover:bg-surface-2"
          >
            Open GitHub
          </a>
        ) : null}
        {person.lastUrl ? (
          <a
            href={person.lastUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-sm border border-border bg-surface px-3 text-sm hover:bg-surface-2"
          >
            Open what they did
          </a>
        ) : null}
        {who?.openUrl && who.openUrl !== github && who.openUrl !== person.lastUrl ? (
          <a
            href={who.openUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-sm border border-border bg-surface px-3 text-sm hover:bg-surface-2"
          >
            {who.openLabel ?? "Open"}
          </a>
        ) : null}
        {person.lastSource === "Local" ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              useStation.getState().addAi(person.login);
              toast(`${person.login} is an AI on this computer, not a stranger.`);
            }}
          >
            Treat as AI
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            useStation.getState().addKnown(person.login);
            toast(`${person.login} is someone you know.`);
          }}
        >
          I know them
        </Button>
      </div>
    </div>
  );
}
