import { format } from "date-fns";
import { deriveAiSystems, isAiLogin, isOutsideEvent, isOutsidePerson } from "./ai-scan";
import { deriveChannels, counterpartOf } from "./comms";
import { deriveActors, deriveFiles, isComms, isTrustedActor, KIND_LABEL, SOURCE_LABEL } from "./github";
import type { AccessEvent, DatacenterModel, HonestyReport, NamedAi, StationSettings } from "./types";

function stamp(iso: string): string {
  try {
    return format(new Date(iso), "d MMM yyyy HH:mm");
  } catch {
    return iso;
  }
}

export function buildReport(
  events: AccessEvent[],
  settings: StationSettings,
  knownActors: string[],
  namedAis: NamedAi[] = [],
  armed = false,
  models: DatacenterModel[] = [],
): HonestyReport {
  const createdAt = new Date().toISOString();
  const actors = deriveActors(events);
  const files = deriveFiles(events);
  const owner = settings.githubUser;
  const comms = events.filter(isComms);
  const channels = deriveChannels(events);
  const outside = actors.filter((actor) =>
    isOutsidePerson(actor.login, owner, knownActors, namedAis),
  );
  const systems = deriveAiSystems(events, namedAis, armed);
  const window =
    events.length === 0
      ? "no events yet"
      : `${stamp(events[events.length - 1]!.at)} → ${stamp(events[0]!.at)}`;

  const lines: string[] = [
    "HONESTY ABOVE ALL ELSE",
    `${settings.stationName} record`,
    `Generated ${stamp(createdAt)}`,
    `Watch: ${settings.githubUser}${settings.githubOrg ? ` · ${settings.githubOrg}` : ""}`,
    `Window: ${window}`,
    "",
    "SUMMARY",
    `  Events: ${events.length}`,
    `  Communications: ${comms.length}`,
    `  Files / targets: ${files.length}`,
    `  Actors: ${actors.length}`,
    `  AI systems: ${systems.length}`,
    `  Datacenter models: ${models.length}`,
    `  Outside actors: ${outside.length}`,
    "",
    "CHANNELS",
  ];

  for (const channel of channels.filter((item) => item.key !== "all")) {
    lines.push(`  ${channel.label}: ${channel.count}`);
  }

  lines.push("", "AI SYSTEMS");
  if (systems.length === 0) {
    lines.push("  None named or found.");
  } else {
    for (const system of systems) {
      const seat = system.running
        ? ", on this computer"
        : system.tracking
          ? ", tracking"
          : ", at rest";
      lines.push(
        `  ${system.name} (${system.origin}${seat}) — ${system.eventCount} hits${
          system.lastAt ? ` · last ${stamp(system.lastAt)}` : ""
        }`,
      );
    }
  }

  lines.push("", "DATACENTER");
  if (models.length === 0) {
    lines.push("  None detected. Honesty Local reads which model is answering.");
  } else {
    for (const model of models) {
      const where = model.where === "datacenter" ? "datacenter" : "this computer";
      const via = model.via ? ` via ${model.via}` : "";
      lines.push(
        `  ${model.name} (${model.provider}, ${model.status}, ${model.role}, ${where}${via})`,
      );
    }
  }

  lines.push("", "OUTSIDE");
  if (outside.length === 0) {
    lines.push("  None in this window. Owner and named people only.");
  } else {
    for (const actor of outside) {
      lines.push(
        `  ${actor.login} — ${actor.eventCount} event${actor.eventCount === 1 ? "" : "s"}${
          actor.lastAt ? ` · last ${stamp(actor.lastAt)}` : ""
        }`,
      );
    }
  }

  lines.push("", "ACTORS");
  for (const actor of actors) {
    const tag = isAiLogin(actor.login, namedAis)
      ? "ai"
      : isTrustedActor(actor.login, owner, knownActors)
        ? "known"
        : "outside";
    lines.push(`  ${actor.login} (${tag}) — ${actor.eventCount}`);
  }

  lines.push("", "COMMUNICATIONS");
  if (comms.length === 0) {
    lines.push(
      "  None recorded. Mail, calendar, Outlook, and Teams load when seated through Grok.",
    );
    lines.push("  Calls, texts, Signal, iMessage, and meetings this desk cannot hear are written by hand.");
  } else {
    for (const event of comms.slice(0, 120)) {
      const who = counterpartOf(event);
      const tagged = isOutsideEvent(event, owner, knownActors, namedAis)
        ? `${who} [outside]`
        : who;
      const dir = event.direction ? ` ${event.direction}` : "";
      lines.push(
        `  ${stamp(event.at)}  ${tagged}  ${KIND_LABEL[event.kind]}${dir}  ${SOURCE_LABEL[event.source]}  ${event.summary}`,
      );
    }
  }

  lines.push("", "FILES");
  const fileSlice = files.slice(0, 80);
  if (fileSlice.length === 0) {
    lines.push("  No file paths in this window. Pushes without a token often hide paths.");
  } else {
    for (const file of fileSlice) {
      lines.push(
        `  ${file.path} — ${file.lastActor} — ${KIND_LABEL[file.lastKind].toLowerCase()} — ${stamp(file.lastAt)} ×${file.count}`,
      );
    }
  }

  lines.push("", "LEDGER");
  for (const event of events.slice(0, 120)) {
    const who = isOutsideEvent(event, owner, knownActors, namedAis)
      ? `${event.actorLogin} [outside]`
      : event.actorLogin;
    const extra = event.files.length ? ` · ${event.files.slice(0, 3).join(", ")}` : "";
    lines.push(
      `  ${stamp(event.at)}  ${who}  ${KIND_LABEL[event.kind]}  ${event.summary}${extra}`,
    );
  }

  lines.push("", "LIMITS");
  lines.push("  This desk tracks communication it can see, and communication you write.");
  lines.push("  Gmail, Calendar, Outlook, and Teams load only when seated through Grok.");
  lines.push("  Phone calls, SMS, iMessage, Signal, WhatsApp, and other apps are on the record only if you write them here.");
  lines.push("  GitHub is the public record this desk can see from a browser. Private GitHub needs a token kept in this browser.");
  lines.push("  Honesty Local reads named AI desktop programs from this computer's process list.");
  lines.push("  Browser tabs are not programs. Kernel hooks and phone taps are not claimed.");
  lines.push("");

  return {
    id: `rep-${Date.now().toString(36)}`,
    createdAt,
    title: `Honesty report · ${format(new Date(createdAt), "d MMM yyyy HH:mm")}`,
    body: lines.join("\n"),
    eventCount: events.length,
    fileCount: files.length,
    actorCount: actors.length,
    outsideCount: outside.length,
  };
}