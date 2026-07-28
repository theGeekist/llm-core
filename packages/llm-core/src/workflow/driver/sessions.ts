import type { DiagnosticEntry } from "#shared/reporting";
import type { PauseSession } from "./types";
import { readPipelinePauseSnapshot } from "../pause";

export const createPauseSessions = () => new Map<unknown, PauseSession>();

type PauseSessionConsumption = {
  sessions: Map<unknown, PauseSession>;
  session: PauseSession;
  token: unknown;
};

export const consumePauseSession = (input: PauseSessionConsumption, outcome: { status: string }) =>
  (outcome.status === "ok" || outcome.status === "paused") &&
  input.sessions.get(input.token) === input.session &&
  input.sessions.delete(input.token);

export const recordPauseSession = (
  sessions: Map<unknown, PauseSession>,
  result: unknown,
  getDiagnostics: () => DiagnosticEntry[],
): boolean | null => {
  const snapshot = readPipelinePauseSnapshot(result);
  if (!snapshot) {
    return null;
  }
  const token = snapshot.token;
  if (token === null || token === undefined) {
    return false;
  }
  sessions.set(token, {
    snapshot,
    getDiagnostics,
    createdAt: snapshot.createdAt,
  });
  return true;
};
