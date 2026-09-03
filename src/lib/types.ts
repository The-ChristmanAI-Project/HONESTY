export type EventSource =
  | "github"
  | "home"
  | "local"
  | "mail"
  | "wire"
  | "calendar"
  | "outlook"
  | "teams";

export type EventKind =
  | "push"
  | "star"
  | "fork"
  | "issue"
  | "pull"
  | "member"
  | "follow"
  | "release"
  | "create"
  | "delete"
  | "comment"
  | "open"
  | "modify"
  | "mail"
  | "call"
  | "message"
  | "meeting"
  | "other";

export type CommDirection = "in" | "out" | "with";

export type AccessEvent = {
  id: string;
  at: string;
  kind: EventKind;
  source: EventSource;
  actorLogin: string;
  actorName?: string;
  actorAvatar?: string;
  repo?: string;
  files: string[];
  summary: string;
  url?: string;
  sha?: string;
  direction?: CommDirection;
  counterpart?: string;
  subject?: string;
  threadId?: string;
};

export type FileTouch = {
  path: string;
  repo?: string;
  source: EventSource;
  lastAt: string;
  lastActor: string;
  lastKind: EventKind;
  count: number;
};

export type Actor = {
  login: string;
  name?: string;
  avatar?: string;
  eventCount: number;
  lastAt?: string;
  files: string[];
  kinds: EventKind[];
};

export type HonestyReport = {
  id: string;
  createdAt: string;
  title: string;
  body: string;
  eventCount: number;
  fileCount: number;
  actorCount: number;
  outsideCount: number;
};

export type StationSettings = {
  stationName: string;
  githubUser: string;
  githubOrg: string;
  pollSeconds: number;
};

export type ManualWatch = {
  id: string;
  path: string;
  note: string;
};

export type WireSourceStatus = {
  id: string;
  label: string;
  seated: boolean;
  count: number;
  note: string | null;
};

export type NamedAi = {
  id: string;
  name: string;
  aliases: string[];
  running?: boolean;
  runningSince?: string;
  runningFrom?: "hand" | "local";
};

export type AiSystem = {
  id: string;
  name: string;
  aliases: string[];
  origin: "scan" | "named";
  tracking: boolean;
  running: boolean;
  eventCount: number;
  lastAt?: string;
  lastSummary?: string;
  lastSource?: EventSource;
  files: string[];
  places: string[];
};
