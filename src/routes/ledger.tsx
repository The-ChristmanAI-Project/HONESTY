import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { KIND_LABEL, deriveFiles, isTrustedActor } from "@/lib/github";
import { useStation } from "@/lib/store";
import { absTime, relTime } from "@/lib/time";
import type { EventKind } from "@/lib/types";

export const Route = createFileRoute("/ledger")({ component: LedgerPage });

function LedgerPage() {
  const events = useStation((s) => s.events);
  const files = useMemo(() => deriveFiles(events), [events]);
  const settings = useStation((s) => s.settings);
  const known = useStation((s) => s.knownActors);
  const [query, setQuery] = useState("");
  const [path, setPath] = useState("");
  const [who, setWho] = useState("");
  const [tab, setTab] = useState<"files" | "events">("files");

  const q = query.trim().toLowerCase();
  const filteredFiles = useMemo(
    () =>
      files.filter(
        (file) =>
          !q ||
          file.path.toLowerCase().includes(q) ||
          file.lastActor.toLowerCase().includes(q) ||
          (file.repo ?? "").toLowerCase().includes(q),
      ),
    [files, q],
  );
  const filteredEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          !q ||
          event.actorLogin.toLowerCase().includes(q) ||
          event.summary.toLowerCase().includes(q) ||
          event.files.some((file) => file.toLowerCase().includes(q)) ||
          (event.repo ?? "").toLowerCase().includes(q),
      ),
    [events, q],
  );

  function recordOpen() {
    const filePath = path.trim();
    const actor = (who.trim() || "You").replace(/^@/, "");
    if (!filePath) {
      toast("Name the file that was opened.");
      return;
    }
    useStation.getState().addEvent({
      id: `home-open-${Date.now()}`,
      at: new Date().toISOString(),
      kind: "open" as EventKind,
      source: "home",
      actorLogin: actor,
      files: [filePath],
      summary: `${actor} opened ${filePath} on ${settings.stationName}`,
    });
    setPath("");
    toast("Opening recorded.");
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader kicker="File ledger" title="What was opened, and by whom.">
        GitHub pushes list files when GitHub sends them. Named AI programs on this computer sit
        in the events tab. Home openings you record here, or that the attached folder notices,
        sit in the same book.
      </PageHeader>

      <Panel className="mt-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            recordOpen();
          }}
        >
          <p className="text-sm font-medium">Record a home opening</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="path/to/file"
              aria-label="File path"
            />
            <Input
              className="sm:max-w-40"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="Who"
              aria-label="Who opened it"
            />
            <Button type="submit">Record</Button>
          </div>
        </form>
      </Panel>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by file, person, or repo"
          aria-label="Filter ledger"
          className="max-w-sm"
        />
        <div className="flex gap-1">
          <Chip active={tab === "files"} onClick={() => setTab("files")}>
            Files
          </Chip>
          <Chip active={tab === "events"} onClick={() => setTab("events")}>
            Events
          </Chip>
        </div>
      </div>

      {tab === "files" ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-2xl text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Last person</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Times</th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-muted">
                    No files match.
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => {
                  const trusted = isTrustedActor(file.lastActor, settings.githubUser, known);
                  return (
                    <tr key={`${file.source}:${file.path}`} className="border-b border-border">
                      <td className="px-4 py-3">
                        <p className="max-w-md truncate font-mono text-xs">{file.path}</p>
                        <p className="text-xs text-subtle">
                          {file.source === "github" ? "GitHub" : "Home"}
                          {file.repo ? ` · ${file.repo}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="mr-2">{file.lastActor}</span>
                        <Badge tone={trusted ? "sage" : "danger"}>
                          {trusted ? "known" : "outside"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted">{KIND_LABEL[file.lastKind]}</td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-muted">
                        <span title={absTime(file.lastAt)}>{relTime(file.lastAt)}</span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{file.count}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-2xl text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">What</th>
                <th className="px-4 py-3 font-medium">Files</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.slice(0, 80).map((event) => (
                <tr key={event.id} className="border-b border-border">
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-muted">
                    {absTime(event.at)}
                  </td>
                  <td className="px-4 py-3">{event.actorLogin}</td>
                  <td className="px-4 py-3 text-muted">{event.summary}</td>
                  <td className="px-4 py-3 font-mono text-xs text-subtle">
                    {event.files.slice(0, 2).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
