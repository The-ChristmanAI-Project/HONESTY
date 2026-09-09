import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { EventFeed } from "@/components/event-feed";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input, Textarea } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { redirectToLoginIfRequired } from "@/lib/app-data";
import { DIRECTION_LABEL, counterpartOf, deriveChannels, deriveThreads } from "@/lib/comms";
import { KIND_LABEL, isComms } from "@/lib/github";
import { pullTheWire } from "@/lib/pull";
import { useStation } from "@/lib/store";
import { relTime } from "@/lib/time";
import type { CommDirection, EventKind } from "@/lib/types";

export const Route = createFileRoute("/wire")({ component: WirePage });

const CHANNELS: { kind: EventKind; label: string; direction: CommDirection }[] = [
  { kind: "mail", label: "Mail", direction: "in" },
  { kind: "call", label: "Call", direction: "with" },
  { kind: "message", label: "Text", direction: "in" },
  { kind: "meeting", label: "Meeting", direction: "with" },
];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "in", label: "In" },
  { key: "out", label: "Out" },
  { key: "mail", label: "Mail" },
  { key: "call", label: "Call" },
  { key: "message", label: "Text" },
  { key: "meeting", label: "Meeting" },
  { key: "hand", label: "Recorded" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function toLocalInput(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function WirePage() {
  const events = useStation((s) => s.events);
  const settings = useStation((s) => s.settings);
  const known = useStation((s) => s.knownActors);
  const mailWarning = useStation((s) => s.mailWarning);
  const mailLoginRequired = useStation((s) => s.mailLoginRequired);
  const mailLoginUrl = useStation((s) => s.mailLoginUrl);
  const pullingMail = useStation((s) => s.pullingMail);
  const wireSources = useStation((s) => s.wireSources);
  const [kind, setKind] = useState<EventKind>("message");
  const [direction, setDirection] = useState<CommDirection>("in");
  const [who, setWho] = useState("");
  const [summary, setSummary] = useState("");
  const [when, setWhen] = useState(toLocalInput());
  const [minutes, setMinutes] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<"traffic" | "people">("traffic");

  const comms = useMemo(() => events.filter(isComms), [events]);
  const channels = useMemo(() => deriveChannels(events), [events]);
  const threads = useMemo(() => deriveThreads(events), [events]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return comms.filter((event) => {
      if (filter === "in") {
        if (event.direction !== "in") return false;
      } else if (filter === "out") {
        if (event.direction !== "out") return false;
      } else if (filter === "mail") {
        if (event.kind !== "mail") return false;
      } else if (filter === "call") {
        if (event.kind !== "call") return false;
      } else if (filter === "message") {
        if (event.kind !== "message") return false;
      } else if (filter === "meeting") {
        if (event.kind !== "meeting") return false;
      } else if (filter === "hand") {
        if (event.source !== "wire") return false;
      }
      if (!q) return true;
      return (
        event.actorLogin.toLowerCase().includes(q) ||
        counterpartOf(event).toLowerCase().includes(q) ||
        event.summary.toLowerCase().includes(q) ||
        (event.subject ?? "").toLowerCase().includes(q)
      );
    });
  }, [comms, filter, query]);

  function pickChannel(next: EventKind) {
    setKind(next);
    const preset = CHANNELS.find((channel) => channel.kind === next);
    if (preset) setDirection(preset.direction);
  }

  function record(e: FormEvent) {
    e.preventDefault();
    const actor = (who.trim() || "You").replace(/^@/, "");
    const body = summary.trim();
    if (!body) {
      toast("Write what was said, or that a call happened.");
      return;
    }
    const label = CHANNELS.find((c) => c.kind === kind)?.label ?? "Text";
    const parsedWhen = when ? new Date(when) : new Date();
    const at = Number.isNaN(parsedWhen.getTime()) ? new Date().toISOString() : parsedWhen.toISOString();
    const duration = minutes.trim() ? ` (${minutes.trim()} min)` : "";
    const dirWord = DIRECTION_LABEL[direction].toLowerCase();
    useStation.getState().addEvent({
      id: `wire-${Date.now()}`,
      at,
      kind,
      source: "wire",
      actorLogin: actor,
      files: [],
      summary: `${label} ${dirWord} ${actor}${duration}: ${body}`,
      direction,
      counterpart: actor,
      subject: body.slice(0, 80),
    });
    setSummary("");
    setMinutes("");
    setWhen(toLocalInput());
    toast("Recorded.");
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader kicker="Mail, calls, texts" title="All communication. Yours.">
        Mail, calls, texts, meetings. This desk keeps every channel it can see and every word
        you write. Calendar, Outlook, and Teams load if they are already connected — optional.
        SMS, iMessage, Signal, WhatsApp: record them. A phone tap is not claimed.
      </PageHeader>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {channels
          .filter((channel) => channel.key !== "github" && channel.key !== "hand")
          .map((channel) => (
            <div key={channel.key} className="rounded-2xl border border-border bg-surface px-4 py-4">
              <dt className="kicker">{channel.label}</dt>
              <dd className="mt-2 font-display text-2xl tabular-nums tracking-tight">{channel.count}</dd>
            </div>
          ))}
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void pullTheWire(true)} disabled={pullingMail}>
          {pullingMail ? "Loading mail" : "Load mail"}
        </Button>
        {mailLoginRequired && mailLoginUrl ? (
          <Button
            variant="ghost"
            onClick={() =>
              redirectToLoginIfRequired({
                ok: false,
                data: null,
                loginRequired: true,
                loginUrl: mailLoginUrl,
              })
            }
          >
            Continue with Grok to load your data.
          </Button>
        ) : null}
        <Badge tone={comms.length ? "sage" : "muted"}>
          {comms.length} recorded
        </Badge>
      </div>
      {mailWarning ? <p className="mt-3 text-sm text-muted">{mailWarning}</p> : null}
      {wireSources.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {wireSources.map((source) => (
            <li key={source.id}>
              <Badge tone={source.seated ? "sage" : "muted"}>
                {source.label}
                {source.seated ? ` · ${source.count}` : " · optional"}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <Panel className="mt-6">
        <form onSubmit={record} className="space-y-4">
          <h2 className="text-xl">Record a communication</h2>
          <div className="flex flex-wrap gap-1">
            {CHANNELS.map((channel) => (
              <Chip
                key={channel.kind}
                active={kind === channel.kind}
                onClick={() => pickChannel(channel.kind)}
              >
                {channel.label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {(["in", "out", "with"] as const).map((dir) => (
              <Chip key={dir} active={direction === dir} onClick={() => setDirection(dir)}>
                {DIRECTION_LABEL[dir]}
              </Chip>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              Who
              <Input
                className="mt-2"
                value={who}
                onChange={(e) => setWho(e.target.value)}
                placeholder="Name or address"
              />
            </label>
            <label className="block text-sm">
              When
              <Input
                className="mt-2"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </label>
          </div>
          {kind === "call" ? (
            <label className="block max-w-xs text-sm">
              Minutes
              <Input
                className="mt-2"
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="Optional"
              />
            </label>
          ) : null}
          <label className="block text-sm">
            What passed
            <Textarea
              className="mt-2"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Subject, outcome, or the words themselves"
            />
          </label>
          <Button type="submit">Record it</Button>
        </form>
      </Panel>

      <Panel className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl">{view === "traffic" ? "What passed" : "People"}</h2>
          <div className="flex flex-wrap gap-1">
            <Chip active={view === "traffic"} onClick={() => setView("traffic")}>
              Traffic
            </Chip>
            <Chip active={view === "people"} onClick={() => setView("people")}>
              People
            </Chip>
          </div>
        </div>
        <Input
          className="mt-4"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search names, subjects, words"
          aria-label="Search mail, calls, and texts"
        />
        <div className="mt-3 flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <Chip key={item.key} active={filter === item.key} onClick={() => setFilter(item.key)}>
              {item.label}
            </Chip>
          ))}
        </div>
        {view === "traffic" ? (
          <EventFeed
            events={shown}
            owner={settings.githubUser}
            known={known}
            empty="Nothing in this filter. Record what passed — this desk does not wait on a paywall."
          />
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {threads.length === 0 ? (
              <li className="py-10 text-sm text-muted">No people yet. Record a mail, call, or text.</li>
            ) : (
              threads.map((thread) => (
                <li key={thread.key} className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="font-medium">{thread.who}</p>
                    <p className="mt-1 text-sm text-muted">{thread.lastSummary}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {thread.kinds.map((item) => (
                        <Badge key={item}>{KIND_LABEL[item]}</Badge>
                      ))}
                    </div>
                  </div>
                  <p className="font-mono text-xs tabular-nums text-muted">
                    {thread.count} · {relTime(thread.lastAt)}
                  </p>
                </li>
              ))
            )}
          </ul>
        )}
      </Panel>
    </div>
  );
}
