import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import {
  canPickFolder,
  clearFolder,
  folderName,
  pickFolder,
  scanFolder,
} from "@/lib/folder-watch";
import { pullTheRecord } from "@/lib/pull";
import { readToken, useStation, writeToken } from "@/lib/store";
import { absTime } from "@/lib/time";

export const Route = createFileRoute("/station")({ component: StationPage });

function StationPage() {
  const settings = useStation((s) => s.settings);
  const watches = useStation((s) => s.watches);
  const repos = useStation((s) => s.repos);
  const lastFetchedAt = useStation((s) => s.lastFetchedAt);
  const rateRemaining = useStation((s) => s.rateRemaining);
  const folderLabel = useStation((s) => s.folderLabel);
  const [user, setUser] = useState(settings.githubUser);
  const [org, setOrg] = useState(settings.githubOrg);
  const [station, setStation] = useState(settings.stationName);
  const [poll, setPoll] = useState(String(settings.pollSeconds));
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [watchPath, setWatchPath] = useState("");
  const [watchNote, setWatchNote] = useState("");
  const picker = canPickFolder();

  useEffect(() => {
    setHasToken(Boolean(readToken()));
  }, []);

  function saveIdentity(e: FormEvent) {
    e.preventDefault();
    const seconds = Number(poll);
    useStation.getState().setSettings({
      githubUser: user.trim() || "EverettNC",
      githubOrg: org.trim(),
      stationName: station.trim() || "Home Station",
      pollSeconds: Number.isFinite(seconds) ? Math.min(900, Math.max(60, seconds)) : 180,
    });
    toast("Station saved.");
  }

  function saveToken(e: FormEvent) {
    e.preventDefault();
    writeToken(token);
    setHasToken(Boolean(token.trim()));
    setToken("");
    toast(token.trim() ? "Token kept in this browser only." : "Token cleared.");
  }

  async function attach() {
    try {
      const name = await pickFolder();
      if (!name) {
        toast("This browser cannot attach a folder.");
        return;
      }
      useStation.getState().setFolderLabel(name);
      const events = await scanFolder(settings.githubUser);
      for (const event of events) useStation.getState().addEvent(event);
      toast(`Attached ${name}.`);
    } catch {
      toast("Folder attach cancelled.");
    }
  }

  function detach() {
    clearFolder();
    useStation.getState().setFolderLabel(null);
    toast("Folder detached.");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker="Station" title="How the watch is seated.">
        GitHub is pulled live. A personal token is optional and never leaves this browser except
        toward api.github.com. Without it, only the public record is visible.
      </PageHeader>

      <Panel className="mt-8">
        <h2 className="text-xl">Channels</h2>
        <p className="mt-2 text-sm text-muted">
          This desk is yours with no subscription. GitHub public events pull without a token.
          Optional GitHub token stays in this browser. Mail, calendar, Outlook, and Teams load
          only if already seated in Grok — optional, never required. Calls, SMS, iMessage,
          Signal, and WhatsApp are recorded by hand. Arm Honesty to scan GitHub, mail, the wire,
          and named AIs — then follow each in the record. It cannot see other programs on the
          computer. Kernel file-opens and phone taps are not claimed.
        </p>
      </Panel>

      <Panel className="mt-6">
        <form onSubmit={saveIdentity} className="space-y-4">
          <h2 className="text-xl">Identity</h2>
          <label className="block text-sm">
            Station name
            <Input className="mt-2" value={station} onChange={(e) => setStation(e.target.value)} />
          </label>
          <label className="block text-sm">
            GitHub user
            <Input className="mt-2" value={user} onChange={(e) => setUser(e.target.value)} />
          </label>
          <label className="block text-sm">
            GitHub org (optional)
            <Input className="mt-2" value={org} onChange={(e) => setOrg(e.target.value)} />
          </label>
          <label className="block text-sm">
            Poll while armed (seconds)
            <Input
              className="mt-2"
              type="number"
              min={60}
              max={900}
              value={poll}
              onChange={(e) => setPoll(e.target.value)}
            />
          </label>
          <Button type="submit">Save station</Button>
        </form>
      </Panel>

      <Panel className="mt-6">
        <h2 className="text-xl">Provider keys</h2>
        <p className="mt-2 text-sm text-muted">
          NVIDIA, Ollama, AWS, OpenAI, Anthropic sit on Keys. Drop a file there. This browser
          only. Not the GitHub token below.
        </p>
        <Link
          to="/keys"
          className="mt-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-fg"
        >
          Open the keys drop
        </Link>
      </Panel>

      <Panel className="mt-6">
        <form onSubmit={saveToken} className="space-y-4">
          <h2 className="text-xl">GitHub token</h2>
          <p className="text-sm text-muted">
            Classic or fine-grained, read-only on repo and metadata. Private files stay hidden
            without it. {hasToken ? "A token is on file." : "No token on file."}
          </p>
          <Input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={hasToken ? "Replace token" : "ghp_…"}
            aria-label="GitHub token"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Keep token</Button>
            {hasToken ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  writeToken("");
                  setHasToken(false);
                  setToken("");
                  toast("Token cleared.");
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel className="mt-6">
        <h2 className="text-xl">Attached folder</h2>
        <p className="mt-2 text-sm text-muted">
          Chromium can watch last-modified times on a folder you pick. It cannot see who at the
          operating system opened a file. Re-attach after a refresh.
        </p>
        <p className="mt-3 font-mono text-xs text-subtle">
          {folderLabel || folderName() || "No folder attached"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void attach()} disabled={!picker}>
            Attach folder
          </Button>
          <Button type="button" variant="ghost" onClick={detach}>
            Detach
          </Button>
        </div>
        {!picker ? (
          <p className="mt-3 text-sm text-muted">
            This browser has no folder picker. Record openings on the ledger instead.
          </p>
        ) : null}
      </Panel>

      <Panel className="mt-6">
        <h2 className="text-xl">Named watches</h2>
        <form
          className="mt-3 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!watchPath.trim()) return;
            useStation.getState().addWatch(watchPath, watchNote);
            setWatchPath("");
            setWatchNote("");
          }}
        >
          <Input
            value={watchPath}
            onChange={(e) => setWatchPath(e.target.value)}
            placeholder="Path or seat"
            aria-label="Watch path"
          />
          <Input
            value={watchNote}
            onChange={(e) => setWatchNote(e.target.value)}
            placeholder="Note"
            aria-label="Watch note"
          />
          <Button type="submit" variant="secondary">
            Add
          </Button>
        </form>
        <ul className="mt-4 divide-y divide-border">
          {watches.map((watch) => (
            <li key={watch.id} className="flex items-start justify-between gap-3 py-3">
              <div>
                <p className="font-mono text-xs">{watch.path}</p>
                {watch.note ? <p className="text-sm text-muted">{watch.note}</p> : null}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => useStation.getState().removeWatch(watch.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl">Repositories in view</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => void pullTheRecord()}>
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                useStation.getState().clearLedger();
                toast("Ledger cleared. Pull again for a clean record.");
              }}
            >
              Clear ledger
            </Button>
          </div>
        </div>
        <p className="mt-2 font-mono text-xs text-subtle">
          {lastFetchedAt ? `Last pull ${absTime(lastFetchedAt)}` : "Not pulled"}
          {rateRemaining != null ? ` · GitHub remaining ${rateRemaining}` : ""}
        </p>
        <ul className="mt-4 space-y-3">
          {repos.length === 0 ? (
            <li className="text-sm text-muted">No repositories returned.</li>
          ) : (
            repos.map((repo) => (
              <li key={repo.full_name} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={repo.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm font-medium text-muted hover:text-fg"
                  >
                    {repo.full_name}
                  </a>
                  <p className="text-xs text-subtle">
                    {repo.language ?? "—"}
                    {repo.pushed_at ? ` · pushed ${absTime(repo.pushed_at)}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  {repo.private ? <Badge tone="danger">private</Badge> : <Badge>public</Badge>}
                </div>
              </li>
            ))
          )}
        </ul>
      </Panel>
    </div>
  );
}
