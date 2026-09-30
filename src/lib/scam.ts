// Scam Operation — the part of Honesty whose duty runs to the person being worked.
//
// Everything else on this desk answers to the station owner. This section answers to
// the person on the other end of a stranger's mail, text, or call: the one being told
// the deployed soldier needs gift cards, the surgeon abroad needs a customs fee, keep it
// between us, it has to be today. When it fires it speaks to that person, man or woman, in plain words.
//
// What it does: reads the communications this desk can see for a stranger, names the
// moves it saw, decides flag / case, and writes the three-line card. It can run two real
// outside checks from the browser: the phone number (Twilio Lookup, needs a seated key)
// and the mail address (public DNS + RDAP, no key).
//
// What it will not do: claim to verify military service. The government does not hand
// that to civilians and no product that says it does is telling the truth. Instead it
// quotes what the Army's own criminal investigators say a real soldier never needs.

import type { AccessEvent } from "./types.ts";

export type ScamSign =
  | "money"
  | "unreachable"
  | "off_platform"
  | "secrecy"
  | "urgency"
  | "no_face"
  | "fast_love"
  | "leave_papers"
  | "mule";

export type ScamLevel = "clear" | "flag" | "case";

export type ScamHit = {
  sign: ScamSign;
  label: string;
  quote: string;
  eventId: string;
  at: string;
};

export type ScamCase = {
  who: string;
  level: ScamLevel;
  signs: ScamSign[];
  hits: ScamHit[];
  contacts: number;
  firstAt: string;
  lastAt: string;
  phones: string[];
  mails: string[];
  claimsMilitary: boolean;
  card: ScamCard;
};

export type ScamCard = {
  heading: string;
  saw: string[];
  means: string[];
  doNow: string[];
  sources: { label: string; url: string }[];
};

export const SIGN_LABEL: Record<ScamSign, string> = {
  money: "asked for money",
  unreachable: "says they cannot be reached in person",
  off_platform: "wants to move the conversation off the app",
  secrecy: "asked for secrecy",
  urgency: "says it has to be now",
  no_face: "will not show a live face",
  fast_love: "professed love fast",
  leave_papers: "leave, release, or fee for a soldier",
  mule: "wants you to receive or forward money or packages",
};

// Each pattern is tested against the lowercased text of one communication.
// Word boundaries where a short word would otherwise hit inside another word.
const PATTERNS: { sign: ScamSign; re: RegExp }[] = [
  {
    sign: "money",
    re: /\$\s?\d{2,}|\b(gift ?cards?|itunes|steam cards?|google play cards?|wire (me|the|some|money|transfer)|western union|moneygram|bitcoin|crypto|usdt|zelle|cash ?app|venmo|paypal me|send (me )?(some |the )?money|needs? \$?\d|customs? (fee|duty|charge)|clearance fee|processing fee|shipping fee|loan me|borrow|my account (is|got) (frozen|blocked|locked))\b/,
  },
  {
    sign: "unreachable",
    re: /\b(deployed|deployment|on deployment|on a mission|peacekeeping|oil ?rig|offshore|on the rig|in the field|combat zone|overseas|abroad|syria|afghanistan|yemen|iraq|somalia|mali|cannot (leave|come home|travel)|can'?t (leave|come home|travel)|no (leave|vacation) (yet|until))\b/,
  },
  {
    sign: "off_platform",
    re: /\b(whats ?app|telegram|signal app|hangouts|google chat|viber|kik|wechat|move (this |our chat )?to|text me (at|on)|my (private|personal) (number|email)|delete (this|the) (app|account)|not safe (here|on here))\b/,
  },
  {
    sign: "secrecy",
    re: /\b(don'?t tell|do not tell|between (us|you and me)|our (little )?secret|keep (this|it) (quiet|private|secret)|(your|the) (family|kids|children|daughter|son) (won'?t|wouldn'?t|will not) understand|nobody (needs|has) to know|no one (needs|has) to know)\b/,
  },
  {
    sign: "urgency",
    re: /\b(right now|today only|before (tonight|midnight|tomorrow|the deadline)|urgent(ly)?|emergency|asap|immediately|last chance|only (a few )?hours|or (i|they|we) (lose|will lose)|time is running out)\b/,
  },
  {
    sign: "no_face",
    re: /\b(can'?t (video|facetime|face ?time)|cannot (video|facetime)|no (video|camera|webcam)|camera (is )?(broken|not working|not allowed)|video (is )?(not allowed|forbidden|restricted)|security reasons|for security|not allowed to (call|video|show))\b/,
  },
  {
    sign: "fast_love",
    re: /\b(i love you|love of my life|my (wife|husband|queen|king|soulmate|future wife|future husband)|soul ?mate|marry me|want to marry|spend (my|the rest of my) life with you|god (sent|brought) you)\b/,
  },
  {
    sign: "leave_papers",
    re: /\b(leave (papers|request|form|application)|release (papers|form|fee)|vacation (papers|fee|request)|early retirement|retirement (papers|fee)|(pay|money) (for|to get) (leave|home|discharge)|discharge (papers|fee)|communication fee|satellite phone|army (internet|phone|laptop)|military (fee|tax|charge)|request (my|his|the) leave)\b/,
  },
  {
    sign: "mule",
    re: /\b(receive (a |the )?(package|parcel|box|money|funds)|forward (the |a )?(money|funds|package)|hold (the |some )?money for me|my (package|box|trunk|luggage|consignment) (is|got) (held|stuck|seized)|diplomat|courier company|open an account for me)\b/,
  },
];

const MILITARY = /\b(army|marine|marines|navy|air ?force|soldier|sergeant|sgt|captain|major|colonel|lieutenant|general|corporal|private first class|deployed|deployment|base|unit|battalion|platoon|military)\b/;

const PHONE = /(\+?\d[\d\s().-]{7,}\d)/g;
const MAIL = /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g;

function textOf(event: AccessEvent): string {
  return [event.summary, event.subject ?? ""].join(" ").toLowerCase();
}

function snippet(text: string, re: RegExp): string {
  const m = re.exec(text);
  if (!m || m.index === undefined) return "";
  const start = Math.max(0, m.index - 40);
  const end = Math.min(text.length, m.index + m[0].length + 40);
  const raw = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${raw}${end < text.length ? "…" : ""}`;
}

/** Normalize a phone string to digits with a leading + when it had one. */
export function cleanPhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return raw.trim().startsWith("+") ? `+${digits}` : digits;
}

export function phonesIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(PHONE)) {
    const clean = cleanPhone(m[1] ?? "");
    if (clean) out.add(clean);
  }
  return [...out];
}

export function mailsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(MAIL)) out.add(m[0].toLowerCase());
  return [...out];
}

export function isComm(event: AccessEvent): boolean {
  return (
    event.kind === "mail" ||
    event.kind === "call" ||
    event.kind === "message" ||
    event.kind === "meeting"
  );
}

/** Read one communication for the moves. Pure. */
export function readSigns(event: AccessEvent): ScamHit[] {
  const text = textOf(event);
  const hits: ScamHit[] = [];
  for (const { sign, re } of PATTERNS) {
    if (!re.test(text)) continue;
    hits.push({
      sign,
      label: SIGN_LABEL[sign],
      quote: snippet(text, new RegExp(re.source, re.flags)),
      eventId: event.id,
      at: event.at,
    });
  }
  return hits;
}

/**
 * The rule, stated once:
 *   one sign is a flag;
 *   three distinct signs is a case;
 *   money plus any other sign is a case;
 *   leave-papers or mule on their own is a case (the Army says so, see sources).
 */
export function levelOf(signs: ScamSign[]): ScamLevel {
  const set = new Set(signs);
  if (set.size === 0) return "clear";
  if (set.has("leave_papers") || set.has("mule")) return "case";
  if (set.has("money") && set.size >= 2) return "case";
  if (set.size >= 3) return "case";
  return "flag";
}

const SOURCES: ScamCard["sources"] = [
  { label: "Report it to the FTC", url: "https://reportfraud.ftc.gov/" },
  { label: "Report it to the FBI (IC3)", url: "https://www.ic3.gov/" },
];

/** The Army's own investigators (Army CID) publish what a real soldier never needs. */
export const ARMY_NEVER: string[] = [
  "Soldiers and their families are not charged money for a soldier to go on leave.",
  "Nobody has to request leave on a soldier's behalf, and no general writes to you about it.",
  "Soldiers are not charged money or taxes to communicate, to marry, or to retire early.",
  "Soldiers have medical insurance; their friends do not pay their medical bills.",
  "Deployed soldiers do not need the public's money to eat, to phone home, or to fly home.",
  "Deployed soldiers do not find large sums of money and need your help moving it.",
];

function plainWho(who: string): string {
  return who.trim() || "this person";
}

export function buildCard(input: {
  who: string;
  level: ScamLevel;
  hits: ScamHit[];
  contacts: number;
  claimsMilitary: boolean;
  phones: string[];
  mails: string[];
}): ScamCard {
  const who = plainWho(input.who);
  const signs = [...new Set(input.hits.map((h) => h.sign))];
  const saw: string[] = [];
  for (const sign of signs) {
    const first = input.hits.find((h) => h.sign === sign)!;
    saw.push(
      first.quote
        ? `${who} ${SIGN_LABEL[sign]}: "${first.quote}"`
        : `${who} ${SIGN_LABEL[sign]}.`,
    );
  }
  if (input.mails.some((m) => !m.endsWith(".mil")) && input.claimsMilitary) {
    saw.push(
      `${who} says military but writes from ${input.mails.filter((m) => !m.endsWith(".mil")).join(", ")}. Serving members have a .mil address.`,
    );
  }

  const means: string[] = [];
  if (input.level === "case") {
    means.push(
      `These are the moves of a person who does not exist. Not a guess about ${who}'s heart. A match against the script that thousands of people are read every day.`,
    );
    means.push("This is not about you. The script is the same for everyone it is sent to.");
  } else if (input.level === "flag") {
    means.push(
      `One of the moves of a known scam. On its own it proves nothing. Watch for a second one, especially money.`,
    );
  } else {
    means.push("Nothing on the record matches a known scam move.");
  }
  if (input.claimsMilitary) {
    means.push("The Army's own investigators say a real soldier never needs any of this:");
    means.push(...ARMY_NEVER.map((line) => `  ${line}`));
  }

  const doNow: string[] = [];
  if (input.level !== "clear") {
    doNow.push("Do not send anything. Not money, not cards, not a photo of your ID.");
    doNow.push(`Do not tell ${who} you checked.`);
    doNow.push("Show this card to someone you trust before you answer again.");
    if (input.phones.length) {
      doNow.push("Press Check the number to see what kind of line it is.");
    }
    if (input.mails.length) {
      doNow.push("Press Check the address to see how old the sender's domain is and whether it takes mail.");
    }
    if (input.level === "case") {
      doNow.push("Report it. It takes five minutes and it is how these get shut down.");
    }
  }

  const heading =
    input.level === "case"
      ? `${who} may not exist.`
      : input.level === "flag"
        ? `One thing about ${who} to watch.`
        : `Nothing to flag about ${who}.`;

  return { heading, saw, means, doNow, sources: input.level === "clear" ? [] : SOURCES };
}

/** Build the case for one stranger from the communications on the record. Pure. */
export function deriveScamCase(who: string, events: AccessEvent[]): ScamCase | null {
  const comms = events.filter(isComm).sort((a, b) => (a.at < b.at ? -1 : 1));
  if (comms.length === 0) return null;
  const hits: ScamHit[] = [];
  const phones = new Set<string>();
  const mails = new Set<string>();
  let claimsMilitary = false;
  for (const event of comms) {
    hits.push(...readSigns(event));
    const text = textOf(event);
    if (MILITARY.test(text)) claimsMilitary = true;
    for (const p of phonesIn(`${event.summary} ${event.counterpart ?? ""} ${event.actorLogin}`)) {
      phones.add(p);
    }
    for (const m of mailsIn(`${event.summary} ${event.counterpart ?? ""} ${event.actorLogin}`)) {
      mails.add(m);
    }
  }
  const signs = [...new Set(hits.map((h) => h.sign))];
  const level = levelOf(signs);
  const card = buildCard({
    who,
    level,
    hits,
    contacts: comms.length,
    claimsMilitary,
    phones: [...phones],
    mails: [...mails],
  });
  return {
    who,
    level,
    signs,
    hits,
    contacts: comms.length,
    firstAt: comms[0]!.at,
    lastAt: comms[comms.length - 1]!.at,
    phones: [...phones],
    mails: [...mails],
    claimsMilitary,
    card,
  };
}

/** Plain-text form of the card, for the report and for reading aloud. */
export function cardText(c: ScamCase): string[] {
  const lines = [c.card.heading, "  What it saw:"];
  if (c.card.saw.length === 0) lines.push("    nothing");
  for (const s of c.card.saw) lines.push(`    ${s}`);
  lines.push("  What it means:");
  for (const s of c.card.means) lines.push(`    ${s}`);
  if (c.card.doNow.length) {
    lines.push("  What to do now:");
    for (const s of c.card.doNow) lines.push(`    ${s}`);
  }
  for (const s of c.card.sources) lines.push(`  ${s.label}: ${s.url}`);
  return lines;
}

// ---------------------------------------------------------------------------
// Outside checks. Real calls. Each says plainly when it could not check.
// ---------------------------------------------------------------------------

export type PhoneCheck = {
  ok: boolean;
  number: string;
  lines: string[];
  lineType?: string;
  carrier?: string;
  country?: string;
  valid?: boolean;
};

/** Twilio Lookup v2 with line type intelligence. Needs account SID + auth token seated. */
export async function checkPhone(
  raw: string,
  creds: { accountSid: string; authToken: string },
): Promise<PhoneCheck> {
  const number = cleanPhone(raw);
  if (!number) return { ok: false, number: raw, lines: ["That is not a phone number I can read."] };
  if (!creds.accountSid || !creds.authToken) {
    return {
      ok: false,
      number,
      lines: ["Not checked. No Twilio key on the Keys page. Seat one and press again."],
    };
  }
  const e164 = number.startsWith("+") ? number : `+1${number.replace(/^1/, "")}`;
  try {
    const res = await fetch(
      `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${creds.accountSid}:${creds.authToken}`)}`,
        },
      },
    );
    if (res.status === 401 || res.status === 403) {
      return { ok: false, number: e164, lines: ["Twilio refused the key. Check it on the Keys page."] };
    }
    if (res.status === 404) {
      return { ok: true, number: e164, valid: false, lines: ["Twilio says this number does not exist."] };
    }
    if (!res.ok) {
      return { ok: false, number: e164, lines: [`Twilio did not answer. HTTP ${res.status}.`] };
    }
    const body = (await res.json()) as {
      valid?: boolean;
      country_code?: string | null;
      national_format?: string | null;
      line_type_intelligence?: {
        type?: string | null;
        carrier_name?: string | null;
        error_code?: number | null;
      } | null;
    };
    const type = body.line_type_intelligence?.type ?? undefined;
    const carrier = body.line_type_intelligence?.carrier_name ?? undefined;
    const country = body.country_code ?? undefined;
    const lines: string[] = [];
    lines.push(body.valid === false ? "Twilio says this number is not valid." : "The number is real.");
    if (country) lines.push(`Country: ${country}.`);
    if (type) {
      const said: Record<string, string> = {
        mobile: "A mobile line.",
        landline: "A landline.",
        fixedVoip: "A VoIP line tied to an address, like a home internet phone.",
        nonFixedVoip:
          "A VoIP line not tied to any address. Anyone anywhere can get one in a minute. This is the kind scammers use.",
        personal: "A personal number.",
        tollFree: "A toll-free number.",
        premium: "A premium-rate number.",
        voicemail: "A voicemail-only number.",
        unknown: "Twilio could not tell what kind of line it is.",
      };
      lines.push(said[type] ?? `Line type: ${type}.`);
    }
    if (carrier) lines.push(`Carrier: ${carrier}.`);
    if (type === "nonFixedVoip" && country === "US") {
      lines.push("A US internet number is not a base overseas and is not a rig.");
    }
    return { ok: true, number: e164, lines, lineType: type, carrier, country, valid: body.valid };
  } catch {
    return { ok: false, number: e164, lines: ["Could not reach Twilio from this browser."] };
  }
}

export type MailCheck = {
  ok: boolean;
  address: string;
  domain: string;
  lines: string[];
  takesMail?: boolean;
  hasSpf?: boolean;
  registered?: string;
  ageDays?: number;
  freeMail?: boolean;
  dotMil?: boolean;
};

const FREE_MAIL = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "icloud.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "yandex.com",
  "gmx.com",
  "zoho.com",
]);

type DnsAnswer = { Status?: number; Answer?: { type: number; data: string }[] };

async function dns(name: string, type: "MX" | "TXT"): Promise<DnsAnswer | null> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { Accept: "application/dns-json" } },
    );
    if (!res.ok) return null;
    return (await res.json()) as DnsAnswer;
  } catch {
    return null;
  }
}

function registrable(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  if (parts.length <= 2) return domain;
  // common two-part public suffixes
  const last2 = parts.slice(-2).join(".");
  if (/^(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/.test(last2)) return parts.slice(-3).join(".");
  return last2;
}

/** Public DNS + RDAP. No key. Says how old the domain is and whether it takes mail. */
export async function checkMail(address: string): Promise<MailCheck> {
  const clean = address.trim().toLowerCase();
  const at = clean.lastIndexOf("@");
  if (at < 1) return { ok: false, address, domain: "", lines: ["That is not a mail address I can read."] };
  const domain = clean.slice(at + 1);
  const root = registrable(domain);
  const lines: string[] = [];
  const dotMil = domain.endsWith(".mil");
  const freeMail = FREE_MAIL.has(domain);

  if (dotMil) lines.push("A .mil address. That is the military's own mail system.");
  if (freeMail) lines.push(`A free ${domain} address. Anyone can make one in a minute. A serving soldier writes from .mil.`);

  const mx = await dns(domain, "MX");
  let takesMail: boolean | undefined;
  if (mx === null) {
    lines.push("Could not reach public DNS from this browser to see whether the domain takes mail.");
  } else {
    takesMail = Boolean(mx.Answer?.some((a) => a.type === 15));
    lines.push(takesMail ? "The domain takes mail." : "The domain has no mail server. Mail to it goes nowhere.");
  }

  const txt = await dns(domain, "TXT");
  let hasSpf: boolean | undefined;
  if (txt !== null) {
    hasSpf = Boolean(txt.Answer?.some((a) => a.type === 16 && /v=spf1/i.test(a.data)));
    if (!freeMail && !dotMil) {
      lines.push(hasSpf ? "It publishes an SPF record, so it says which servers may send as it." : "No SPF record. Anyone can send mail that claims to be from it.");
    }
  }

  let registered: string | undefined;
  let ageDays: number | undefined;
  if (!freeMail && !dotMil) {
    try {
      const tld = root.slice(root.lastIndexOf(".") + 1);
      const rdapUrl =
        tld === "com" || tld === "net"
          ? `https://rdap.verisign.com/${tld}/v1/domain/${encodeURIComponent(root)}`
          : `https://rdap.org/domain/${encodeURIComponent(root)}`;
      const res = await fetch(rdapUrl, { headers: { Accept: "application/rdap+json" } });
      if (res.ok) {
        const body = (await res.json()) as {
          events?: { eventAction?: string; eventDate?: string }[];
        };
        const reg = body.events?.find((e) => e.eventAction === "registration")?.eventDate;
        if (reg) {
          registered = reg.slice(0, 10);
          ageDays = Math.floor((Date.now() - new Date(reg).getTime()) / 86_400_000);
          if (ageDays < 90) {
            lines.push(`The domain ${root} was registered ${ageDays} days ago (${registered}). Brand new domains are a scam tell.`);
          } else if (ageDays < 365) {
            lines.push(`The domain ${root} is ${Math.round(ageDays / 30)} months old (registered ${registered}).`);
          } else {
            lines.push(`The domain ${root} has been registered since ${registered}.`);
          }
        } else {
          lines.push(`The registry did not say when ${root} was registered.`);
        }
      } else if (res.status === 404) {
        lines.push(`No registry record for ${root}. The domain may not be registered at all.`);
      } else {
        lines.push(`The registry did not answer for ${root}. HTTP ${res.status}.`);
      }
    } catch {
      lines.push(`Could not reach the domain registry for ${root} from this browser.`);
    }
  }

  return { ok: true, address: clean, domain, lines, takesMail, hasSpf, registered, ageDays, freeMail, dotMil };
}

/** Text of the card plus checks, ready to hand to a trusted person. */
export function shareText(c: ScamCase, checks: string[] = []): string {
  const lines = [
    "From the Honesty desk.",
    "",
    ...cardText(c),
  ];
  if (checks.length) {
    lines.push("", "Checks run:");
    for (const line of checks) lines.push(`  ${line}`);
  }
  return lines.join("\n");
}
