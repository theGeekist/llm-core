import type { DiagnosticEntry } from "#shared/reporting";
import type { PauseSession } from "./types";
import { readPauseSnapshotToken, readPipelinePauseSnapshot } from "../pause";

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
  const token = readPauseSnapshotToken(snapshot);
  if (token === null) {
    return false;
  }
  sessions.set(token, {
    snapshot,
    getDiagnostics,
    createdAt: snapshot.createdAt,
  });
  return true;
};
