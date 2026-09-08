import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export const Route = createFileRoute("/bench")({ component: BenchDoor });

const THEBENCH = "http://127.0.0.1:4849";

function BenchDoor() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker="Bench" title="THEBENCH is the bench.">
        This desk watches who is on your computer and who is answering from theirs. THEBENCH
        takes the tape. One bench. Bags land on ELEMENTS.
      </PageHeader>

      <Panel className="mt-8">
        <p className="text-sm text-muted">
          Drop the recording on THEBENCH. Filament hears. Lucent watches. The bag is
          /Volumes/ELEMENTS/EVIDENCE. Honesty does not keep a second drop.
        </p>
        <a href={THEBENCH} className="mt-6 inline-flex">
          <Button>Open THEBENCH</Button>
        </a>
        <p className="mt-3 font-mono text-xs text-subtle">{THEBENCH}</p>
      </Panel>
    </div>
  );
}
