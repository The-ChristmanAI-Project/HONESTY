import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { readVault } from "@/lib/keys";
import { checkMail, checkPhone, shareText, type ScamCase } from "@/lib/scam";
import { useStation } from "@/lib/store";

export function ScamCardView({ scamCase }: { scamCase: ScamCase }) {
  const trusted = useStation((s) => s.settings.trustedContact);
  const [checks, setChecks] = useState<string[]>([]);
  const [busy, setBusy] = useState<"phone" | "mail" | null>(null);
  const card = scamCase.card;
  const tone = scamCase.level === "case" ? "danger" : "paper";

  async function runPhone() {
    setBusy("phone");
    const vault = readVault();
    const out: string[] = [];
    for (const number of scamCase.phones) {
      const r = await checkPhone(number, {
        accountSid: vault.twilioAccountSid,
        authToken: vault.twilioAuthToken,
      });
      out.push(`${r.number}: ${r.lines.join(" ")}`);
    }
    setChecks((prior) => [...prior, ...out]);
    setBusy(null);
  }

  async function runMail() {
    setBusy("mail");
    const out: string[] = [];
    for (const address of scamCase.mails) {
      const r = await checkMail(address);
      out.push(`${r.address}: ${r.lines.join(" ")}`);
    }
    setChecks((prior) => [...prior, ...out]);
    setBusy(null);
  }

  function shareHref(): string | null {
    const to = trusted.trim();
    if (!to) return null;
    const body = encodeURIComponent(shareText(scamCase, checks));
    if (to.includes("@")) {
      return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Please read this: ${card.heading}`)}&body=${body}`;
    }
    return `sms:${to.replace(/[^\d+]/g, "")}?&body=${body}`;
  }

  async function copyCard() {
    try {
      await navigator.clipboard.writeText(shareText(scamCase, checks));
      toast("Card copied. Paste it to someone you trust.");
    } catch {
      toast("Could not copy on this browser.");
    }
  }

  const href = shareHref();

  return (
    <div className="mt-3 rounded-md border border-danger/40 bg-surface-2 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-lg font-medium">{card.heading}</p>
        <Badge tone={tone}>{scamCase.level === "case" ? "may not exist" : "one thing to watch"}</Badge>
      </div>

      <p className="mt-3 text-xs uppercase tracking-wide text-subtle">What it saw</p>
      <ul className="mt-1 space-y-1 text-sm">
        {card.saw.length === 0 ? <li className="text-muted">Nothing.</li> : null}
        {card.saw.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <p className="mt-3 text-xs uppercase tracking-wide text-subtle">What it means</p>
      <ul className="mt-1 space-y-1 text-sm">
        {card.means.map((line) => (
          <li key={line} className={line.startsWith("  ") ? "pl-4 text-muted" : ""}>
            {line.trim()}
          </li>
        ))}
      </ul>

      {card.doNow.length > 0 ? (
        <>
          <p className="mt-3 text-xs uppercase tracking-wide text-subtle">What to do now</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
            {card.doNow.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </>
      ) : null}

      {checks.length > 0 ? (
        <>
          <p className="mt-3 text-xs uppercase tracking-wide text-subtle">Checks run</p>
          <ul className="mt-1 space-y-1 font-mono text-xs text-muted">
            {checks.map((line, i) => (
              <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {scamCase.phones.length > 0 ? (
          <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => void runPhone()}>
            {busy === "phone" ? "Checking" : "Check the number"}
          </Button>
        ) : null}
        {scamCase.mails.length > 0 ? (
          <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => void runMail()}>
            {busy === "mail" ? "Checking" : "Check the address"}
          </Button>
        ) : null}
        {href ? (
          <a
            href={href}
            className="inline-flex h-11 items-center rounded-sm border border-border bg-surface px-3 text-sm hover:bg-surface-2"
          >
            Show this to someone I trust
          </a>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => void copyCard()}>
            Copy this card
          </Button>
        )}
        {card.sources.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-sm border border-border bg-surface px-3 text-sm hover:bg-surface-2"
          >
            {s.label}
          </a>
        ))}
      </div>
      {!href ? (
        <p className="mt-2 text-xs text-subtle">
          Name someone you trust on the Station page and this card can go straight to them.
        </p>
      ) : null}
    </div>
  );
}
