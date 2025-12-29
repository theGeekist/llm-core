import type { DiagnosticEntry } from "../diagnostics";
import type { PauseSession } from "./types";
import { readPipelinePauseSnapshot } from "../pause";

export const createPauseSessions = () => new Map<unknown, PauseSession>();

export const recordPauseSession = (
  sessions: Map<unknown, PauseSession>,
  result: unknown,
  getDiagnostics: () => DiagnosticEntry[],
): boolean | null => {
  const snapshot = readPipelinePauseSnapshot(result);
  if (!snapshot) {
    return null;
  }
  if (snapshot.token === undefined) {
    return false;
  }
  sessions.set(snapshot.token, {
    snapshot,
    getDiagnostics,
    createdAt: snapshot.createdAt,
  });
  return true;
};
