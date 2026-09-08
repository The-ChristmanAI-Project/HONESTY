import { ExternalLink } from "lucide-react";
import { DIRECTION_LABEL } from "@/lib/comms";
import { KIND_LABEL, SOURCE_LABEL, isTrustedActor } from "@/lib/github";
import { absTime, relTime } from "@/lib/time";
import type { AccessEvent } from "@/lib/types";
import { Badge } from "./ui/badge";

export function EventFeed({
  events,
  owner,
  known,
  empty,
  isAi,
}: {
  events: AccessEvent[];
  owner: string;
  known: string[];
  empty: string;
  isAi?: (event: AccessEvent) => boolean;
}) {
  if (events.length === 0) {
    return <p className="py-10 text-sm text-muted">{empty}</p>;
  }

  return (
    <ol className="divide-y divide-border">
      {events.map((event) => {
        const trusted =
          event.source === "local" ||
          event.source === "datacenter" ||
          event.source === "home" ||
          isTrustedActor(event.actorLogin, owner, known);
        const ai = isAi?.(event);
        return (
          <li key={event.id} className="py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-fg">{event.counterpart || event.actorLogin}</p>
                  <Badge tone={trusted ? "sage" : "danger"}>{trusted ? "known" : "outside"}</Badge>
                  {ai ? <Badge tone="paper">AI</Badge> : null}
                  <Badge tone="paper">{KIND_LABEL[event.kind]}</Badge>
                  <Badge>{SOURCE_LABEL[event.source]}</Badge>
                  {event.direction ? (
                    <Badge tone="muted">{DIRECTION_LABEL[event.direction]}</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted">{event.summary}</p>
                {event.files.length > 0 ? (
                  <ul className="mt-2 space-y-1 font-mono text-xs text-subtle">
                    {event.files.slice(0, 6).map((file) => (
                      <li key={file} className="truncate">
                        {file}
                      </li>
                    ))}
                    {event.files.length > 6 ? (
                      <li>+{event.files.length - 6} more</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-xs tabular-nums text-muted" title={absTime(event.at)}>
                  {relTime(event.at)}
                </p>
                {event.url ? (
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs text-muted hover:text-fg"
                  >
                    Open
                    <ExternalLink className="size-3" strokeWidth={1.75} />
                  </a>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
