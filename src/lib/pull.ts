import { pullStation } from "./github.fn";
import { pullLocal } from "./local-agent";
import { pullWire } from "./wire.fn";
import { readToken, useStation } from "./store";

export async function pullTheRecord() {
  const { settings, events, setPulling, applyPull } = useStation.getState();
  setPulling(true);
  try {
    await pullLocal();
    const knownShas = events
      .map((event) => event.sha)
      .filter((sha): sha is string => Boolean(sha))
      .slice(0, 40);
    const result = await pullStation({
      data: {
        username: settings.githubUser,
        org: settings.githubOrg || undefined,
        token: readToken() || undefined,
        knownShas,
      },
    });
    applyPull(result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pull failed.";
    applyPull({
      ok: false,
      events: [],
      repos: useStation.getState().repos,
      warnings: [message],
      fetchedAt: new Date().toISOString(),
      rateRemaining: null,
    });
    return null;
  }
}

export async function pullTheWire(force = true) {
  const state = useStation.getState();
  if (!force && state.mailLoginRequired) return null;
  state.setPullingMail(true);
  try {
    const result = await pullWire();
    useStation.getState().applyMail(result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Wire pull failed.";
    useStation.getState().applyMail({
      events: [],
      warning: message,
      loginRequired: false,
    });
    return null;
  }
}
