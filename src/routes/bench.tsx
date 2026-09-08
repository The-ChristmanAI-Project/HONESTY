import { createFileRoute } from "@tanstack/react-router";
import { useState, type DragEvent } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { dropRecording, fitLabel, stamp, type BenchResult } from "@/lib/bench";
import { readVault } from "@/lib/keys";
import { useStation } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bench")({ component: BenchPage });

function BenchPage() {
  const localSeated = useStation((s) => s.localSeated);
  const addEvent = useStation((s) => s.addEvent);
  const [over, setOver] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<BenchResult | null>(null);

  async function run(file: File) {
    if (!file) return;
    setWorking(true);
    setResult(null);
    const vault = readVault();
    const next = await dropRecording(file, vault.xai);
    setWorking(false);
    setResult(next);
    if (!next.ok) {
      toast(next.error || "The bench did not take that.");
      return;
    }
    toast(next.watched ? "Heard and watched." : "Heard. Picture not watched.");
    addEvent({
      id: `bench-${Date.now()}`,
      at: new Date().toISOString(),
      kind: "other",
      source: "home",
      actorLogin: "Bench",
      files: [next.filename || file.name],
      summary: next.watched
        ? `Heard and watched ${next.filename || file.name} (${Math.round(next.duration || 0)}s)`
        : `Heard ${next.filename || file.name}. Picture not watched.`,
    });
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void run(file);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker="Bench" title="Drop the recording.">
        Filament hears the audio. The picture is watched against those words. Not a transcript
        alone. Not a guessed screen.
      </PageHeader>

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => onDrop(e)}
        className={cn(
          "mt-8 rounded-2xl border border-dashed px-5 py-10 text-center transition-colors duration-quick",
          over ? "border-accent bg-accent/10" : "border-border-strong bg-surface",
        )}
      >
        <p className="font-display text-2xl text-fg">Drop a screen recording here.</p>
        <p className="mt-2 text-sm text-muted">
          Video with sound. Filament hears. Lucent watches the picture against those words.
        </p>
        <label className="mt-6 inline-flex min-h-12 cursor-pointer items-center justify-center rounded-md bg-accent px-5 text-base font-medium text-accent-fg">
          Choose file
          <input
            type="file"
            className="sr-only"
            accept="video/*,audio/*"
            disabled={working}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void run(file);
            }}
          />
        </label>
        {!localSeated ? (
          <p className="mt-4 text-sm text-danger">Honesty Local is off. Start it first.</p>
        ) : null}
        {working ? <p className="mt-4 text-sm text-muted">Hearing and watching. Stay here.</p> : null}
      </div>

      {result && !result.ok ? (
        <p className="mt-6 text-sm text-danger">{result.error}</p>
      ) : null}

      {result?.ok ? <Breakdown result={result} /> : null}
    </div>
  );
}

function Breakdown({ result }: { result: BenchResult }) {
  return (
    <div className="mt-8 space-y-6">
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl">{result.filename}</h2>
          <Badge>{stamp(result.duration || 0)}</Badge>
          {result.disk ? (
            <p className="mt-2 w-full font-mono text-xs text-subtle">{result.disk}</p>
          ) : null}
          <Badge tone={result.watched ? "sage" : "muted"}>
            {result.watched ? `watched · ${result.watcher}` : "not watched"}
          </Badge>
          {result.ear ? <Badge tone="paper">{result.ear}</Badge> : null}
        </div>
        {result.watch_error ? <p className="mt-3 text-sm text-danger">{result.watch_error}</p> : null}
      </Panel>

      <Panel>
        <h2 className="text-xl">Heard</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-fg">
          {result.heard?.trim() || "No speech. Empty ear stays empty."}
        </p>
        {result.ear_note ? <p className="mt-2 font-mono text-xs text-subtle">{result.ear_note}</p> : null}
      </Panel>

      {result.breakdown ? (
        <Panel>
          <h2 className="text-xl">Audio against the picture</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-fg">{result.breakdown}</p>
        </Panel>
      ) : null}

      {(result.compare ?? []).length > 0 ? (
        <Panel>
          <h2 className="text-xl">Beat by beat</h2>
          <ul className="mt-4 divide-y divide-border">
            {(result.compare ?? []).map((beat) => (
              <li key={beat.at} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-xs tabular-nums text-muted">{stamp(beat.at)}</p>
                  <Badge tone={beat.fit === "compare" ? "sage" : "muted"}>{fitLabel(beat.fit)}</Badge>
                </div>
                <p className="mt-1 text-sm text-fg">{beat.said || "—"}</p>
                <p className="mt-1 text-sm text-muted">{beat.seen || "No picture note at this beat."}</p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Button
        variant="secondary"
        onClick={() => {
          const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${(result.filename || "bench").replace(/[^\w.-]+/g, "-")}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        Download this breakdown
      </Button>
    </div>
  );
}
