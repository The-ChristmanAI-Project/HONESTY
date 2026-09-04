import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import {
  EMPTY_VAULT,
  KEY_SLOTS,
  clearVault,
  maskSecret,
  parseDroppedFiles,
  parseDroppedText,
  readVault,
  seatedCount,
  slotSeated,
  writeVault,
  type KeySlotId,
  type KeyVault,
} from "@/lib/keys";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/keys")({ component: KeysPage });

function KeysPage() {
  const [vault, setVault] = useState<KeyVault>(EMPTY_VAULT);
  const [over, setOver] = useState(false);

  useEffect(() => {
    setVault(readVault());
  }, []);

  const save = useCallback((next: KeyVault, message: string) => {
    writeVault(next);
    setVault(next);
    toast(message);
  }, []);

  async function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setOver(false);
    const files = event.dataTransfer.files;
    if (files.length) {
      const next = await parseDroppedFiles(files, vault);
      save(next, `Seated ${seatedCount(next)} key slot${seatedCount(next) === 1 ? "" : "s"}.`);
      return;
    }
    const text = event.dataTransfer.getData("text/plain");
    if (text.trim()) {
      const next = parseDroppedText(text, vault);
      save(next, `Seated ${seatedCount(next)} key slot${seatedCount(next) === 1 ? "" : "s"}.`);
    }
  }

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    const next = await parseDroppedFiles(list, vault);
    save(next, `Seated ${seatedCount(next)} key slot${seatedCount(next) === 1 ? "" : "s"}.`);
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (!text.trim()) return;
    event.preventDefault();
    const next = parseDroppedText(text, vault);
    save(next, `Seated ${seatedCount(next)} key slot${seatedCount(next) === 1 ? "" : "s"}.`);
    event.currentTarget.value = "";
  }

  const seated = seatedCount(vault);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker="Keys" title="Drop them here.">
        NVIDIA, Ollama, AWS, OpenAI, Anthropic. They stay in this browser. They do not go to
        GitHub, the ledger, or the wire. Honesty Local stays on 8787. This desk is 8788.
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
        onDrop={(e) => void onDrop(e)}
        className={cn(
          "mt-8 rounded-2xl border border-dashed px-5 py-10 text-center transition-colors duration-quick",
          over ? "border-accent bg-accent/10" : "border-border-strong bg-surface",
        )}
      >
        <p className="font-display text-2xl text-fg">Drop a key file on the desk.</p>
        <p className="mt-2 text-sm text-muted">
          .env, AWS credentials, JSON, or a raw key. Paste works too.
        </p>
        <label className="mt-6 inline-flex min-h-12 cursor-pointer items-center justify-center rounded-md bg-accent px-5 text-base font-medium text-accent-fg">
          Choose file
          <input
            type="file"
            className="sr-only"
            multiple
            onChange={(e) => {
              void onPick(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <textarea
          className="mt-6 h-24 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-subtle outline-none focus:border-border-strong"
          placeholder="Paste a key or a block of KEY=value"
          aria-label="Paste keys"
          onPaste={onPaste}
        />
      </div>

      <p className="mt-4 font-mono text-xs text-subtle">
        {seated} of {KEY_SLOTS.length} seated · this browser only
      </p>

      <ul className="mt-6 grid gap-4">
        {KEY_SLOTS.map((slot) => (
          <li key={slot.id}>
            <KeyCard
              id={slot.id}
              label={slot.label}
              hint={slot.hint}
              vault={vault}
              onSave={(next) => save(next, `${slot.label} seated.`)}
            />
          </li>
        ))}
      </ul>

      {seated > 0 ? (
        <Button
          className="mt-6"
          variant="ghost"
          onClick={() => {
            clearVault();
            setVault(readVault());
            toast("Keys cleared from this browser.");
          }}
        >
          Clear every key
        </Button>
      ) : null}
    </div>
  );
}

function KeyCard({
  id,
  label,
  hint,
  vault,
  onSave,
}: {
  id: KeySlotId;
  label: string;
  hint: string;
  vault: KeyVault;
  onSave: (next: KeyVault) => void;
}) {
  const seated = slotSeated(vault, id);
  const [nvidia, setNvidia] = useState("");
  const [ollama, setOllama] = useState("");
  const [openai, setOpenai] = useState("");
  const [anthropic, setAnthropic] = useState("");
  const [awsId, setAwsId] = useState("");
  const [awsSecret, setAwsSecret] = useState("");
  const [awsRegion, setAwsRegion] = useState(vault.awsRegion);

  function keep(event: FormEvent) {
    event.preventDefault();
    const next = { ...vault };
    if (id === "nvidia" && nvidia.trim()) next.nvidia = nvidia.trim();
    if (id === "ollama" && ollama.trim()) next.ollama = ollama.trim();
    if (id === "openai" && openai.trim()) next.openai = openai.trim();
    if (id === "anthropic" && anthropic.trim()) next.anthropic = anthropic.trim();
    if (id === "aws") {
      if (awsId.trim()) next.awsAccessKeyId = awsId.trim();
      if (awsSecret.trim()) next.awsSecretAccessKey = awsSecret.trim();
      if (awsRegion.trim()) next.awsRegion = awsRegion.trim();
    }
    onSave(next);
    setNvidia("");
    setOllama("");
    setOpenai("");
    setAnthropic("");
    setAwsId("");
    setAwsSecret("");
  }

  function clearSlot() {
    const next = { ...vault };
    if (id === "nvidia") next.nvidia = "";
    if (id === "ollama") next.ollama = "";
    if (id === "openai") next.openai = "";
    if (id === "anthropic") next.anthropic = "";
    if (id === "aws") {
      next.awsAccessKeyId = "";
      next.awsSecretAccessKey = "";
      next.awsRegion = "";
    }
    onSave(next);
  }

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl">{label}</h2>
          <p className="mt-1 font-mono text-xs text-subtle">{hint}</p>
        </div>
        <Badge tone={seated ? "sage" : "muted"}>{seated ? "seated" : "empty"}</Badge>
      </div>
      {seated && id !== "aws" ? (
        <p className="mt-3 font-mono text-sm text-muted">{maskSecret(vault[id])}</p>
      ) : null}
      {seated && id === "aws" ? (
        <p className="mt-3 font-mono text-sm text-muted">
          {maskSecret(vault.awsAccessKeyId)}
          {vault.awsRegion ? ` · ${vault.awsRegion}` : ""}
        </p>
      ) : null}
      <form onSubmit={keep} className="mt-4 space-y-3">
        {id === "nvidia" ? (
          <Input
            type="password"
            autoComplete="off"
            value={nvidia}
            onChange={(e) => setNvidia(e.target.value)}
            placeholder={seated ? "Replace NVIDIA key" : "NVIDIA / NGC key"}
            aria-label="NVIDIA key"
          />
        ) : null}
        {id === "ollama" ? (
          <Input
            type="password"
            autoComplete="off"
            value={ollama}
            onChange={(e) => setOllama(e.target.value)}
            placeholder={seated ? "Replace Ollama key" : "Ollama key"}
            aria-label="Ollama key"
          />
        ) : null}
        {id === "openai" ? (
          <Input
            type="password"
            autoComplete="off"
            value={openai}
            onChange={(e) => setOpenai(e.target.value)}
            placeholder={seated ? "Replace OpenAI key" : "OpenAI key"}
            aria-label="OpenAI key"
          />
        ) : null}
        {id === "anthropic" ? (
          <Input
            type="password"
            autoComplete="off"
            value={anthropic}
            onChange={(e) => setAnthropic(e.target.value)}
            placeholder={seated ? "Replace Anthropic key" : "Anthropic key"}
            aria-label="Anthropic key"
          />
        ) : null}
        {id === "aws" ? (
          <>
            <Input
              autoComplete="off"
              value={awsId}
              onChange={(e) => setAwsId(e.target.value)}
              placeholder={vault.awsAccessKeyId ? "Replace access key id" : "AWS access key id"}
              aria-label="AWS access key id"
            />
            <Input
              type="password"
              autoComplete="off"
              value={awsSecret}
              onChange={(e) => setAwsSecret(e.target.value)}
              placeholder={vault.awsSecretAccessKey ? "Replace secret" : "AWS secret access key"}
              aria-label="AWS secret access key"
            />
            <Input
              autoComplete="off"
              value={awsRegion}
              onChange={(e) => setAwsRegion(e.target.value)}
              placeholder="Region (us-east-1)"
              aria-label="AWS region"
            />
          </>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Keep</Button>
          {seated ? (
            <Button type="button" variant="ghost" onClick={clearSlot}>
              Clear
            </Button>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}
