import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveUnknownPeople, whatTheyDid } from "./people.ts";
import type { AccessEvent, NamedAi } from "./types.ts";

const named: NamedAi[] = [{ id: "ai-claude", name: "Claude", aliases: ["claude"] }];

function ev(partial: Partial<AccessEvent> & Pick<AccessEvent, "id" | "actorLogin">): AccessEvent {
  return {
    at: "2026-09-07T12:00:00.000Z",
    kind: "star",
    source: "github",
    files: [],
    summary: "starred",
    ...partial,
  };
}

describe("people you don't know", () => {
  it("does not treat the owner, known people, or named AIs as unknown", () => {
    const people = deriveUnknownPeople(
      [
        ev({ id: "1", actorLogin: "EverettNC", kind: "push", summary: "pushed" }),
        ev({ id: "2", actorLogin: "Misty", kind: "mail", source: "mail", summary: "wrote" }),
        ev({ id: "3", actorLogin: "Claude", kind: "open", source: "local", summary: "running" }),
      ],
      "EverettNC",
      ["Misty"],
      named,
    );
    assert.equal(people.length, 0);
  });

  it("names the stranger, where they showed up, and what they did", () => {
    const people = deriveUnknownPeople(
      [
        ev({
          id: "s1",
          actorLogin: "someone-else",
          actorName: "Sam",
          repo: "EverettNC/HONESTY",
          kind: "star",
          summary: "Starred EverettNC/HONESTY",
          url: "https://github.com/EverettNC/HONESTY",
        }),
      ],
      "EverettNC",
      ["EverettNC"],
      named,
    );
    assert.equal(people.length, 1);
    assert.equal(people[0]?.login, "someone-else");
    assert.equal(people[0]?.lastWhat, "starred a repo");
    assert.equal(people[0]?.lastWhere, "EverettNC/HONESTY");
    assert.equal(people[0]?.lastSource, "GitHub");
    assert.match(people[0]?.why ?? "", /You have not said you know them/);
    assert.equal(whatTheyDid("mail"), "showed up in mail");
  });

  it("keeps a stranger who only showed up on this computer", () => {
    const people = deriveUnknownPeople(
      [
        ev({
          id: "local-1",
          actorLogin: "Jordan",
          source: "local",
          kind: "open",
          summary: "Jordan showed up on Everett.lan",
        }),
      ],
      "EverettNC",
      ["EverettNC"],
      named,
    );
    assert.equal(people.length, 1);
    assert.equal(people[0]?.login, "Jordan");
  });

  it("names the other person on a mail you sent", () => {
    const people = deriveUnknownPeople(
      [
        ev({
          id: "m1",
          actorLogin: "EverettNC",
          counterpart: "sam@example.com",
          source: "mail",
          kind: "mail",
          summary: "Mail out sam@example.com: hello",
        }),
      ],
      "EverettNC",
      ["EverettNC"],
      named,
    );
    assert.equal(people[0]?.login, "sam@example.com");
  });

  it("does not treat Continue as a stranger", () => {
    const people = deriveUnknownPeople(
      [
        ev({
          id: "c1",
          actorLogin: "Continue",
          source: "local",
          kind: "open",
          summary: "Continue is on Everett.lan now",
        }),
      ],
      "EverettNC",
      ["EverettNC"],
      named,
      (login) => login.toLowerCase() === "continue",
    );
    assert.equal(people.length, 0);
  });
});
