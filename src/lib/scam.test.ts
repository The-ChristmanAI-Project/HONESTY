import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cardText,
  cleanPhone,
  deriveScamCase,
  levelOf,
  mailsIn,
  phonesIn,
  readSigns,
  shareText,
} from "./scam.ts";
import type { AccessEvent } from "./types.ts";

function msg(
  id: string,
  summary: string,
  extra: Partial<AccessEvent> = {},
): AccessEvent {
  return {
    id,
    at: `2026-09-2${id.slice(-1)}T12:00:00.000Z`,
    kind: "message",
    source: "wire",
    actorLogin: "james.walker.army@gmail.com",
    files: [],
    summary,
    counterpart: "james.walker.army@gmail.com",
    direction: "in",
    ...extra,
  };
}

describe("scam operation — reading one message", () => {
  it("finds nothing in a plain message", () => {
    assert.deepEqual(readSigns(msg("1", "Text in from Misty: dinner at 6?")), []);
  });

  it("hears the ask for gift cards", () => {
    const hits = readSigns(msg("1", "Text in from James: can you get me $800 in gift cards, my card is frozen"));
    assert.ok(hits.some((h) => h.sign === "money"));
    assert.ok(hits[0]!.quote.includes("gift cards"));
  });

  it("hears the deployment story, the no-video line, and the secrecy", () => {
    const hits = readSigns(
      msg(
        "2",
        "Text in from James: I am deployed in Syria, we cant video for security reasons, please dont tell your daughter about us",
      ),
    );
    const signs = new Set(hits.map((h) => h.sign));
    assert.ok(signs.has("unreachable"));
    assert.ok(signs.has("no_face"));
    assert.ok(signs.has("secrecy"));
  });

  it("hears the leave papers ask", () => {
    const hits = readSigns(msg("3", "Mail in from James: the army needs $1500 for my leave papers so I can come home to you"));
    assert.ok(hits.some((h) => h.sign === "leave_papers"));
    assert.ok(hits.some((h) => h.sign === "money"));
  });

  it("does not fire on the word continue or base alone", () => {
    assert.deepEqual(readSigns(msg("4", "Call with Brian: base salary discussion, continue tomorrow")), []);
  });
});

describe("scam operation — the rule", () => {
  it("nothing is clear", () => assert.equal(levelOf([]), "clear"));
  it("one sign is a flag", () => assert.equal(levelOf(["urgency"]), "flag"));
  it("two signs without money is a flag", () => assert.equal(levelOf(["urgency", "no_face"]), "flag"));
  it("three signs is a case", () => assert.equal(levelOf(["urgency", "no_face", "secrecy"]), "case"));
  it("money plus one is a case", () => assert.equal(levelOf(["money", "urgency"]), "case"));
  it("leave papers alone is a case", () => assert.equal(levelOf(["leave_papers"]), "case"));
  it("mule alone is a case", () => assert.equal(levelOf(["mule"]), "case"));
});

describe("scam operation — the case and the card", () => {
  const thread: AccessEvent[] = [
    msg("1", "Text in from James: hi beautiful, I found your profile and had to say hello"),
    msg("2", "Text in from James: I am a sergeant in the army, deployed overseas. I love you already. can we talk on whatsapp instead"),
    msg("3", "Text in from James: we cant video call for security reasons, please keep this between us"),
    msg("4", "Text in from James: I need $800 in gift cards today, my account is frozen, please dont tell your daughter"),
  ];

  it("builds a case from the whole thread", () => {
    const c = deriveScamCase("James", thread);
    assert.ok(c);
    assert.equal(c.level, "case");
    assert.equal(c.contacts, 4);
    assert.ok(c.claimsMilitary);
    assert.ok(c.signs.includes("money"));
    assert.ok(c.signs.includes("off_platform"));
    assert.ok(c.signs.includes("secrecy"));
    assert.ok(c.signs.includes("fast_love"));
    assert.ok(c.signs.includes("no_face"));
    assert.ok(c.signs.includes("unreachable"));
    assert.deepEqual(c.mails, ["james.walker.army@gmail.com"]);
  });

  it("speaks to her, not to the owner", () => {
    const c = deriveScamCase("James", thread)!;
    assert.equal(c.card.heading, "James may not exist.");
    assert.ok(c.card.saw.some((line) => line.includes("gift cards")));
    assert.ok(c.card.saw.some((line) => line.includes(".mil")));
    assert.ok(c.card.means.some((line) => line.includes("does not exist")));
    assert.ok(c.card.means.some((line) => line.includes("not about you")));
    assert.ok(c.card.means.some((line) => line.includes("leave")));
    assert.ok(c.card.doNow[0]!.startsWith("Do not send anything"));
    assert.ok(c.card.doNow.some((line) => line.includes("someone you trust")));
    assert.ok(c.card.sources.some((s) => s.url === "https://reportfraud.ftc.gov/"));
  });

  it("flags one move without calling it a case", () => {
    const c = deriveScamCase("Pat", [msg("1", "Text in from Pat: call me right now its urgent", { counterpart: "Pat" })])!;
    assert.equal(c.level, "flag");
    assert.equal(c.card.heading, "One thing about Pat to watch.");
    assert.ok(c.card.means[0]!.includes("proves nothing"));
  });

  it("says nothing to flag when the thread is clean", () => {
    const c = deriveScamCase("Misty", [msg("1", "Text in from Misty: dinner at 6?", { counterpart: "Misty" })])!;
    assert.equal(c.level, "clear");
    assert.deepEqual(c.card.doNow, []);
    assert.deepEqual(c.card.sources, []);
  });

  it("returns null when there is no communication at all", () => {
    assert.equal(deriveScamCase("x", [msg("1", "pushed", { kind: "push", source: "github" })]), null);
  });

  it("writes plain text the report and a trusted person can read", () => {
    const c = deriveScamCase("James", thread)!;
    const text = shareText(c, ["The number is real.", "A VOIP line."]);
    assert.ok(text.startsWith("From the Honesty desk."));
    assert.ok(text.includes("What it saw:"));
    assert.ok(text.includes("Checks run:"));
    assert.ok(cardText(c).length > 5);
  });
});

describe("scam operation — numbers and addresses", () => {
  it("reads phone numbers out of text", () => {
    assert.deepEqual(phonesIn("call me 419-744-0419 or +44 7700 900123"), ["4197440419", "+447700900123"]);
  });
  it("drops things that are not numbers", () => {
    assert.equal(cleanPhone("12345"), "");
    assert.equal(cleanPhone("+1 (614) 540-9299"), "+16145409299");
  });
  it("reads mail addresses out of text", () => {
    assert.deepEqual(mailsIn("write me at Sgt.Walker@Gmail.com please"), ["sgt.walker@gmail.com"]);
  });
});
