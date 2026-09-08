import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DESK_BIND,
  LOCAL_BIND,
  RISK,
  dressStatus,
  pullConductorFeed,
  publishConductor,
  type ConductorBeing,
  type ConductorFeed,
  type ConductorStatus,
} from "@/lib/conductor";
import { pullLocal } from "@/lib/local-agent";
import { useStation } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/conductor")({ component: ConductorPage });

const MARK: Record<ConductorStatus, string> = {
  clean: "bg-cd-cyan",
  review: "bg-cd-amber",
  blocked: "bg-cd-amber",
  empty: "bg-cd-rose",
  dark: "bg-cd-red",
};

const MARK_BORDER: Record<ConductorStatus, string> = {
  clean: "border-cd-cyan",
  review: "border-cd-amber",
  blocked: "border-cd-amber",
  empty: "border-cd-rose",
  dark: "border-cd-red",
};

const MARK_TOP: Record<ConductorStatus, string> = {
  clean: "border-t-cd-cyan",
  review: "border-t-cd-amber",
  blocked: "border-t-cd-amber",
  empty: "border-t-cd-rose",
  dark: "border-t-cd-red",
};

const MARK_TEXT: Record<ConductorStatus, string> = {
  clean: "text-cd-cyan",
  review: "text-cd-amber",
  blocked: "text-cd-amber",
  empty: "text-cd-rose",
  dark: "text-cd-red",
};

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.96;
  window.speechSynthesis.speak(utter);
}

function ConductorPage() {
  const localSeated = useStation((s) => s.localSeated);
  const [feed, setFeed] = useState<ConductorFeed | null>(null);
  const [wing, setWing] = useState<string>("all");
  const [flag, setFlag] = useState<ConductorStatus | "all">("all");
  const [selId, setSelId] = useState<string | null>(null);
  const [rulings, setRulings] = useState<Record<string, "accept" | "back">>({});

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      await pullLocal();
      const next = await pullConductorFeed();
      if (cancelled) return;
      if (next) {
        publishConductor(next);
        setFeed(next);
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.speechSynthesis?.cancel();
    };
  }, []);

  const beings = feed?.beings ?? [];
  const running = feed?.running ?? [];
  const ranked = useMemo(
    () =>
      [...beings].sort(
        (a, b) => RISK[a.status] - RISK[b.status] || a.name.localeCompare(b.name),
      ),
    [beings],
  );

  const shown = ranked.filter((being) => {
    if (wing !== "all" && being.wing !== wing) return false;
    if (flag !== "all" && being.status !== flag) return false;
    return true;
  });

  const selected = beings.find((being) => being.id === selId) ?? null;
  const dark = beings.filter((b) => b.status === "dark").length;
  const empty = beings.filter((b) => b.status === "empty").length;
  const clean = beings.filter((b) => b.status === "clean").length;
  const review = beings.filter((b) => b.status === "review" || b.status === "blocked").length;

  const wings = [...new Set(beings.map((b) => b.wing).filter(Boolean))].map((name) => ({
    name,
    count: beings.filter((b) => b.wing === name).length,
  }));

  const flags: { key: ConductorStatus | "all"; name: string; count: number; status: ConductorStatus }[] = [
    { key: "dark", name: "Dark", count: dark, status: "dark" },
    { key: "empty", name: "Nothing shipped", count: empty, status: "empty" },
    { key: "review", name: "Awaiting ruling", count: review, status: "review" },
    { key: "clean", name: "Accepted", count: clean, status: "clean" },
  ];

  const standing =
    feed?.standing ??
    (localSeated
      ? `${running.length} named program(s) on this computer. Browser tabs are not programs.`
      : "Honesty Local is quiet. Conductor has no process list to take.");
  const cycle = new Date().toISOString().slice(0, 10);

  function rule(being: ConductorBeing, kind: "accept" | "back") {
    setRulings((prev) => ({ ...prev, [being.id]: kind }));
    useStation.getState().addEvent({
      id: `conductor-${kind}-${being.id}-${Date.now()}`,
      at: new Date().toISOString(),
      kind: "other",
      source: "local",
      actorLogin: "Conductor",
      files: [],
      summary:
        kind === "accept"
          ? `Conductor accepted ${being.name}. Evidence on file.`
          : `Conductor sent ${being.name} back. Intentions are not evidence.`,
    });
    toast(kind === "accept" ? `${being.name} accepted.` : `${being.name} sent back.`);
  }

  return (
    <div className="min-h-dvh bg-cd-bg text-cd-fg">
      <div className="h-1.5 bg-cd-cyan" />
      <header className="flex flex-wrap items-stretch justify-between gap-4 border-b border-cd-line bg-cd-raised px-5">
        <div className="flex min-w-0 items-center gap-5 py-3">
          <div>
            <p className="font-cd text-[1.7rem] leading-none tracking-tight">The Conductor</p>
            <p className="mt-1.5 font-cd-mono text-[10px] uppercase tracking-[0.22em] text-cd-mute">
              Honesty reports here · this computer
            </p>
          </div>
          <div className="hidden h-10 w-px bg-cd-line sm:block" />
          <p className="flex flex-col gap-1 font-cd-mono text-[11px] sm:flex-row sm:items-center sm:gap-2">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-cd-cyan" />
              <span className="text-cd-mute">CYCLE {cycle}</span>
            </span>
            <span className="text-cd-cyan">{LOCAL_BIND}</span>
            <span className="text-cd-mute/50">Local</span>
            <span className="text-cd-cyan">{DESK_BIND}</span>
            <span className="text-cd-mute/50">Desk</span>
            <span className="text-cd-mute">
              {localSeated
                ? running.length
                  ? running.map((row) => row.name).join(" · ")
                  : "seated"
                : "quiet"}
            </span>
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2 py-2" aria-label="Conductor">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center border border-cd-line px-4 font-cd-mono text-[11px] uppercase tracking-[0.14em] text-cd-mute hover:text-cd-fg"
          >
            Honesty desk
          </Link>
          <button
            type="button"
            className="inline-flex min-h-11 items-center border border-cd-line px-4 font-cd-mono text-[11px] uppercase tracking-[0.14em] text-cd-cyan"
            onClick={() => speak(standing)}
          >
            Read this to me
          </button>
        </nav>
      </header>

      <div className="grid min-h-[calc(100dvh-5rem)] lg:grid-cols-[240px_1fr]">
        <aside className="order-2 border-b border-cd-line bg-cd-raised py-5 lg:order-none lg:border-b-0 lg:border-r">
          <p className="px-4 pb-3 font-cd-mono text-[10px] uppercase tracking-[0.2em] text-cd-mute">
            On this computer · {beings.length}
          </p>
          <button
            type="button"
            onClick={() => setWing("all")}
            className={cn(
              "flex min-h-11 w-full items-center justify-between border-l-2 px-4 text-left text-sm",
              wing === "all" ? "border-cd-cyan bg-cd-panel text-cd-fg" : "border-transparent text-cd-mute",
            )}
          >
            <span>All</span>
            <span className="font-cd-mono text-[11px]">{beings.length}</span>
          </button>
          {wings.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => setWing(item.name)}
              className={cn(
                "flex min-h-11 w-full items-center justify-between border-l-2 px-4 text-left text-sm",
                wing === item.name
                  ? "border-cd-cyan bg-cd-panel text-cd-fg"
                  : "border-transparent text-cd-mute",
              )}
            >
              <span>{item.name}</span>
              <span className="font-cd-mono text-[11px]">{item.count}</span>
            </button>
          ))}
          <div className="mx-4 my-5 h-px bg-cd-line" />
          <p className="px-4 pb-3 font-cd-mono text-[10px] uppercase tracking-[0.2em] text-cd-mute">Flags</p>
          {flags.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFlag(item.key)}
              className={cn(
                "flex min-h-11 w-full items-center justify-between border-l-2 px-4 text-left text-sm",
                flag === item.key ? "bg-cd-panel text-cd-fg" : "text-cd-mute",
                MARK_BORDER[item.status],
              )}
            >
              <span>{item.name}</span>
              <span className={cn("font-cd-mono text-[11px]", MARK_TEXT[item.status])}>{item.count}</span>
            </button>
          ))}
          <p className="mt-6 px-4 font-cd text-sm italic leading-relaxed text-cd-mute">
            “A being that files nothing has told you everything.”
          </p>
        </aside>

        <main className="order-1 min-w-0 px-4 py-6 sm:px-7 lg:order-none">
          <section className="border border-cd-line border-l-[3px] border-l-cd-cyan bg-cd-panel px-5 py-5 sm:px-7">
            <p className="font-cd-mono text-[10px] uppercase tracking-[0.22em] text-cd-cyan">
              Standing order · {cycle}
            </p>
            <p className="mt-3 max-w-[74ch] font-cd text-[1.55rem] font-light leading-snug text-cd-fg">
              {standing}
            </p>
            <p className="mt-3 max-w-[74ch] text-sm leading-relaxed text-cd-mute">
              Honesty reports to this board. Named programs on this computer, and which
              model is answering. Not a kernel. Not a clearance stamp. Not someone else’s
              machine.
            </p>
          </section>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Catalog", value: beings.length, note: "named programs", status: "clean" as const },
              { label: "Running", value: clean, note: "in the process list", status: "clean" as const },
              { label: "Seen before", value: review, note: "not running now", status: "review" as const },
              { label: "Dark", value: dark, note: "quiet more than a day", status: "dark" as const },
            ].map((tile) => (
              <div
                key={tile.label}
                className={cn("border border-cd-line border-t-2 bg-cd-panel px-4 py-4", MARK_TOP[tile.status])}
              >
                <p className="font-cd-mono text-[10px] uppercase tracking-[0.16em] text-cd-mute">{tile.label}</p>
                <p className={cn("mt-2 font-cd text-4xl leading-none", MARK_TEXT[tile.status])}>{tile.value}</p>
                <p className="mt-1 text-xs text-cd-mute">{tile.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="font-cd text-[1.4rem] font-normal text-cd-fg">
              {wing === "all" ? "This computer" : wing}
            </h1>
            <p className="font-cd-mono text-[11px] text-cd-mute">
              {shown.length} shown · sorted by risk
            </p>
          </div>

          <ul className="border border-cd-line bg-cd-panel">
            {shown.map((being) => {
              const dress = dressStatus(being.status);
              const ruled = rulings[being.id];
              return (
                <li
                  key={being.id}
                  className="grid gap-2 border-b border-cd-line px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <button type="button" className="min-w-0 text-left" onClick={() => setSelId(being.id)}>
                    <span className="flex items-center gap-2">
                      <span className={cn("size-1.5 shrink-0 rounded-full", MARK[being.status])} />
                      <span className="text-[13.5px] text-cd-fg">{being.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate pl-4 text-[11px] text-cd-mute">
                      {being.title} · {being.wing}
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2 pl-4 sm:pl-0">
                    <span className={cn("font-cd-mono text-[10px] uppercase tracking-[0.14em]", MARK_TEXT[being.status])}>
                      {ruled === "accept" ? "Accepted this cycle" : ruled === "back" ? "Sent back" : dress.label}
                    </span>
                    <button
                      type="button"
                      className="min-h-11 border border-cd-line px-3 font-cd-mono text-[10.5px] uppercase tracking-wide text-cd-cyan"
                      onClick={() => rule(being, "accept")}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="min-h-11 border border-cd-rose/40 px-3 font-cd-mono text-[10.5px] uppercase tracking-wide text-cd-rose"
                      onClick={() => rule(being, "back")}
                    >
                      Send back
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {selected ? (
            <section className="mt-6 border border-cd-line bg-cd-panel p-5">
              <p className="font-cd-mono text-[10px] uppercase tracking-[0.2em] text-cd-mute">
                {selected.division ?? selected.wing}
              </p>
              <h2 className="mt-2 font-cd text-3xl font-light text-cd-fg">{selected.name}</h2>
              <p className="mt-1 text-sm text-cd-mute">{selected.title}</p>
              <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-cd-fg">{selected.mandate}</p>
              {selected.focus ? (
                <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-cd-mute">{selected.focus}</p>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="min-h-12 border border-cd-line px-5 font-cd-mono text-[11px] uppercase tracking-[0.12em] text-cd-cyan"
                  onClick={() => speak(`${selected.name}. ${selected.mandate}`)}
                >
                  Read this file to me
                </button>
                <button
                  type="button"
                  className="min-h-12 px-4 font-cd-mono text-[11px] uppercase tracking-[0.12em] text-cd-mute"
                  onClick={() => setSelId(null)}
                >
                  Close file
                </button>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
