import { Link, useRouterState } from "@tanstack/react-router";
import {
  Ellipsis,
  FileText,
  Home,
  KeyRound,
  MessageSquare,
  Radio,
  Radar,
  ScrollText,
  Settings2,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Intro, introAlreadyPlayed } from "@/components/intro";
import { canPickFolder, hasFolder, scanFolder } from "@/lib/folder-watch";
import { pullTheRecord, pullTheWire } from "@/lib/pull";
import { useStation } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Desk", icon: Home },
  { to: "/ledger", label: "Ledger", icon: FileText },
  { to: "/wire", label: "Wire", icon: MessageSquare },
  { to: "/systems", label: "AIs", icon: Radar },
  { to: "/conductor", label: "Conductor", icon: Radio },
  { to: "/keys", label: "Keys", icon: KeyRound },
  { to: "/people", label: "People", icon: Users },
  { to: "/reports", label: "Reports", icon: ScrollText },
  { to: "/station", label: "Station", icon: Settings2 },
] as const;

const MOBILE_PRIMARY = ["/", "/wire", "/conductor", "/keys"] as const;
const MOBILE_MORE = ["/ledger", "/systems", "/people", "/reports", "/station"] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const armed = useStation((s) => s.armed);
  const hydrated = useStation((s) => s.hydrated);
  const pollSeconds = useStation((s) => s.settings.pollSeconds);
  const stationName = useStation((s) => s.settings.stationName);
  const actor = useStation((s) => s.settings.githubUser);
  const [moreOpen, setMoreOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(true);

  useEffect(() => {
    if (introAlreadyPlayed()) setIntroOpen(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) useStation.getState().setHydrated();
    };
    const result = useStation.persist.rehydrate();
    if (result) void result.then(finish, finish);
    else finish();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void pullTheRecord();
    if (useStation.getState().armed) void pullTheWire(false);
  }, [hydrated]);

  useEffect(() => {
    if (!armed || !hydrated) return;
    const id = window.setInterval(() => {
      void pullTheRecord();
      void pullTheWire(false);
      if (canPickFolder() && hasFolder()) {
        void scanFolder(actor).then((events) => {
          for (const event of events) useStation.getState().addEvent(event);
        });
      }
    }, Math.max(60, pollSeconds) * 1000);
    return () => window.clearInterval(id);
  }, [armed, hydrated, pollSeconds, actor]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const moreActive = MOBILE_MORE.includes(pathname as (typeof MOBILE_MORE)[number]);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-fg">
      {introOpen ? <Intro onDone={() => setIntroOpen(false)} /> : null}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
      >
        Skip to record
      </a>
      <div className="mx-auto flex min-h-dvh max-w-6xl">
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border px-4 py-6 md:flex">
          <Brand armed={armed} stationName={stationName} />
          <nav className="mt-8 flex flex-col gap-1" aria-label="Station">
            {NAV.map((item) => (
              <NavLink key={item.to} {...item} active={pathname === item.to} />
            ))}
          </nav>
          <p className="mt-auto pt-8 font-mono text-2xs leading-relaxed text-subtle">
            Yours. Arm Honesty to scan for AI systems in the record and follow each one. Not a
            paywall. Not a kernel.
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:hidden">
            <Brand armed={armed} stationName={stationName} compact />
            <span className="font-mono text-2xs text-muted">{armed ? "ARMED" : "AT REST"}</span>
          </header>
          <main id="main" className="min-w-0 flex-1 px-4 py-5 pb-24 md:px-8 md:py-8 md:pb-8">
            {children}
          </main>
        </div>
      </div>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button
            type="button"
            className="absolute inset-0 bg-bg/80"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-surface px-4 pb-28 pt-5">
            <p className="kicker">More</p>
            <ul className="mt-3 flex flex-col gap-1">
              {NAV.filter((item) => MOBILE_MORE.includes(item.to as (typeof MOBILE_MORE)[number])).map(
                (item) => {
                  const Icon = item.icon;
                  const active = pathname === item.to;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm",
                          active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                        )}
                        onClick={() => setMoreOpen(false)}
                      >
                        <Icon className="size-4" strokeWidth={1.75} />
                        {item.label}
                      </Link>
                    </li>
                  );
                },
              )}
            </ul>
          </div>
        </div>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-safe backdrop-blur-sm md:hidden"
        aria-label="Station"
      >
        <ul className="grid grid-cols-5">
          {MOBILE_PRIMARY.map((to) => {
            const item = NAV.find((entry) => entry.to === to);
            if (!item) return null;
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-2xs leading-none",
                    active ? "text-fg" : "text-muted",
                  )}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              className={cn(
                "flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 text-2xs leading-none",
                moreOpen || moreActive ? "text-fg" : "text-muted",
              )}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
            >
              <Ellipsis className="size-4 shrink-0" strokeWidth={1.75} />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

function Brand({
  armed,
  stationName,
  compact,
}: {
  armed: boolean;
  stationName: string;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative shrink-0">
        <img
          src="/family/family.jpg"
          alt=""
          className={cn(
            "rounded-sm object-cover ring-1 ring-accent/40",
            compact ? "size-10" : "size-12",
          )}
        />
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 block rounded-full",
            armed ? "pulse-dot" : "size-2 bg-subtle",
          )}
          aria-hidden="true"
        />
      </span>
      <div>
        <p className="font-display text-lg leading-none tracking-tight">Honesty</p>
        {!compact ? (
          <>
            <p className="mt-1 font-display text-sm italic text-muted">above all else</p>
            <p className="mt-3 kicker">{stationName}</p>
          </>
        ) : (
          <p className="font-display text-xs italic text-muted">above all else</p>
        )}
      </div>
    </div>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-quick ease-out",
        active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg",
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      {label}
    </Link>
  );
}
