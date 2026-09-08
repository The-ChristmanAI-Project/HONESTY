import { createServerFn } from "@tanstack/react-start";
import { ConnectorType } from "@/lib/app-data";
import { classifyCallToolError } from "@/lib/app-data/errors";
import type { CallToolResult } from "@/lib/app-data";
import type { AccessEvent, WireSourceStatus } from "./types";
import { mapCalendarRows, mapChatRows, mapMailRows } from "./wire-map";

export type WirePull = {
  ok: boolean;
  events: AccessEvent[];
  warning: string | null;
  loginRequired: boolean;
  loginUrl?: string;
  fetchedAt: string;
  sources: WireSourceStatus[];
};

type SourceAttempt = {
  id: string;
  label: string;
  events: AccessEvent[];
  seated: boolean;
  note: string | null;
  loginRequired: boolean;
  loginUrl?: string;
};

function windowIso(daysBack: number, daysForward = 0) {
  const start = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const end = new Date(Date.now() + daysForward * 24 * 60 * 60 * 1000).toISOString();
  return { start, end };
}

async function runTool(
  callTool: (
    toolName: string,
    args: Record<string, unknown>,
    options: { connectorType: (typeof ConnectorType)[keyof typeof ConnectorType] },
  ) => Promise<CallToolResult>,
  toolName: string,
  args: Record<string, unknown>,
  connectorType: (typeof ConnectorType)[keyof typeof ConnectorType],
): Promise<CallToolResult> {
  return callTool(toolName, args, { connectorType });
}

function fromResult(
  id: string,
  label: string,
  result: CallToolResult,
  events: AccessEvent[],
): SourceAttempt {
  if (result.ok) {
    return {
      id,
      label,
      events,
      seated: true,
      note: events.length ? null : `${label} seated, nothing in the last 21 days.`,
      loginRequired: false,
    };
  }
  const classified = classifyCallToolError(result);
  const kind = classified?.kind;
  const seatedNeeded =
    kind === "login" || kind === "not_connected" || kind === "access_denied" || kind === "scope_denied";
  return {
    id,
    label,
    events: [],
    seated: false,
    note: seatedNeeded ? `${label} not seated.` : (classified?.message ?? result.errorMessage ?? `${label} could not be pulled.`),
    loginRequired: Boolean(result.loginRequired) || kind === "login",
    loginUrl: result.loginUrl,
  };
}

export const pullWire = createServerFn({ method: "POST" }).handler(
  async (): Promise<WirePull> => {
    const fetchedAt = new Date().toISOString();
    const { start, end } = windowIso(21, 7);
    const { callTool } = await import("@/lib/app-data/client.server");

    const calArgs = {
      query: "",
      time_min: start,
      time_max: end,
      timeMin: start,
      timeMax: end,
      max_results: 40,
      maxResults: 40,
    };

    const [
      gmailAll,
      gmailSent,
      calendar,
      outlook,
      outlookCal,
      teams,
    ] = await Promise.all([
      runTool(callTool, "gmail_search", { query: "newer_than:21d", max_results: 40 }, ConnectorType.Gmail),
      runTool(
        callTool,
        "gmail_search",
        { query: "in:sent newer_than:21d", max_results: 25 },
        ConnectorType.Gmail,
      ),
      runTool(callTool, "google_calendar_search", calArgs, ConnectorType.GoogleCalendar),
      runTool(
        callTool,
        "outlook_search",
        { query: "newer_than:21d", max_results: 25 },
        ConnectorType.Outlook,
      ),
      runTool(callTool, "outlook_calendar_search", calArgs, ConnectorType.OutlookCalendar),
      runTool(
        callTool,
        "microsoft_teams_search",
        { query: "", max_results: 25 },
        ConnectorType.MicrosoftTeams,
      ),
    ]);

    const attempts: SourceAttempt[] = [
      fromResult("gmail", "Gmail", gmailAll, mapMailRows(gmailAll.data, { source: "mail", direction: "in" })),
      fromResult(
        "gmail-sent",
        "Gmail sent",
        gmailSent,
        mapMailRows(gmailSent.data, { source: "mail", direction: "out", idPrefix: "mail-sent" }),
      ),
      fromResult(
        "calendar",
        "Google Calendar",
        calendar,
        mapCalendarRows(calendar.data, { source: "calendar" }),
      ),
      fromResult(
        "outlook",
        "Outlook",
        outlook,
        mapMailRows(outlook.data, { source: "outlook", idPrefix: "outlook" }),
      ),
      fromResult(
        "outlook-cal",
        "Outlook Calendar",
        outlookCal,
        mapCalendarRows(outlookCal.data, { source: "outlook", idPrefix: "outlook-cal" }),
      ),
      fromResult("teams", "Teams", teams, mapChatRows(teams.data, { source: "teams" })),
    ];

    const events = attempts.flatMap((attempt) => attempt.events);
    const seated = attempts.filter((attempt) => attempt.seated);
    const loginHit = attempts.find((attempt) => attempt.loginRequired && attempt.loginUrl);
    const loginRequired = attempts.some((attempt) => attempt.loginRequired);
    const sources: WireSourceStatus[] = [
      {
        id: "gmail",
        label: "Gmail",
        seated: attempts[0]!.seated || attempts[1]!.seated,
        count: (attempts[0]?.events.length ?? 0) + (attempts[1]?.events.length ?? 0),
        note: attempts[0]!.seated || attempts[1]!.seated ? null : "Gmail not seated.",
      },
      {
        id: "calendar",
        label: "Calendar",
        seated: attempts[2]!.seated,
        count: attempts[2]!.events.length,
        note: attempts[2]!.note,
      },
      {
        id: "outlook",
        label: "Outlook",
        seated: attempts[3]!.seated || attempts[4]!.seated,
        count: (attempts[3]?.events.length ?? 0) + (attempts[4]?.events.length ?? 0),
        note: attempts[3]!.seated || attempts[4]!.seated ? null : "Outlook not seated.",
      },
      {
        id: "teams",
        label: "Teams",
        seated: attempts[5]!.seated,
        count: attempts[5]!.events.length,
        note: attempts[5]!.note,
      },
    ];

    let warning: string | null = null;
    if (seated.length === 0) {
      warning =
        "Mail, calendar, Outlook, and Teams are optional. This desk is yours either way. Record calls, texts, and meetings by hand. Load mail pulls seated channels when they exist.";
    } else {
      const missing = sources.filter((source) => !source.seated).map((source) => source.label);
      if (missing.length) warning = `${missing.join(", ")} optional — not seated.`;
    }

    return {
      ok: events.length > 0 || seated.length > 0,
      events,
      warning,
      loginRequired,
      loginUrl: loginHit?.loginUrl,
      fetchedAt,
      sources,
    };
  },
);
