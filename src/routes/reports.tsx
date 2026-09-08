import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { buildReport } from "@/lib/report";
import { useStation } from "@/lib/store";
import { absTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

function ReportsPage() {
  const reports = useStation((s) => s.reports);
  const events = useStation((s) => s.events);
  const settings = useStation((s) => s.settings);
  const known = useStation((s) => s.knownActors);
  const namedAis = useStation((s) => s.namedAis);
  const armed = useStation((s) => s.armed);
  const models = useStation((s) => s.datacenterModels);
  const [openId, setOpenId] = useState<string | null>(reports[0]?.id ?? null);
  const open = reports.find((report) => report.id === openId) ?? reports[0] ?? null;

  function generate() {
    const report = buildReport(events, settings, known, namedAis, armed, models);
    useStation.getState().addReport(report);
    setOpenId(report.id);
    toast("Report kept.");
  }

  function download(body: string, title: string) {
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w.-]+/g, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy(body: string) {
    try {
      await navigator.clipboard.writeText(body);
      toast("Copied the report.");
    } catch {
      toast("Could not copy.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        kicker="Reports"
        title="Kept, as written."
        actions={
          <Button size="lg" onClick={generate} disabled={events.length === 0}>
            Keep a report
          </Button>
        }
      >
        A snapshot of the ledger in this browser. Generate whenever you want a dated copy.
      </PageHeader>

      {reports.length === 0 ? (
        <p className="mt-10 text-sm text-muted">
          No reports yet. Pull the record, then keep one. Empty windows are not filed.
        </p>
      ) : (
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-3">
          <ul className="flex flex-col gap-2">
            {reports.map((report) => (
              <li key={report.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(report.id)}
                  className={cn(
                    "w-full rounded-md px-3 py-3 text-left",
                    open?.id === report.id ? "bg-surface-2" : "hover:bg-surface",
                  )}
                >
                  <p className="text-sm font-medium">{report.title}</p>
                  <p className="mt-1 font-mono text-xs text-subtle">
                    {report.eventCount} events · {report.outsideCount} outside
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {open ? (
            <Panel className="lg:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="paper">{absTime(open.createdAt)}</Badge>
                <Badge>{open.actorCount} people</Badge>
                <Badge tone={open.outsideCount ? "danger" : "sage"}>
                  {open.outsideCount} outside
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void copy(open.body)}>
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => download(open.body, open.title)}
                >
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    useStation.getState().removeReport(open.id);
                    setOpenId(null);
                  }}
                >
                  Discard
                </Button>
              </div>
              <pre className="ledger-rule mt-5 max-h-lg overflow-auto whitespace-pre-wrap rounded-md bg-bg p-4 font-mono text-xs leading-8 text-muted">
                {open.body}
              </pre>
            </Panel>
          ) : null}
        </div>
      )}
    </div>
  );
}
