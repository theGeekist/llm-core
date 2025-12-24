import type { PauseKind } from "../../adapters/types";
import type { DiagnosticEntry } from "../diagnostics";
import type { ExecutionIterator, PauseSession } from "./types";

export const isExecutionIterator = (value: unknown): value is ExecutionIterator => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const iterator = value as {
    next?: unknown;
    [Symbol.iterator]?: unknown;
    [Symbol.asyncIterator]?: unknown;
  };
  return typeof iterator.next === "function";
};

export const createPauseSessions = () => new Map<unknown, PauseSession>();

export const recordPauseSession = (
  sessions: Map<unknown, PauseSession>,
  result: unknown,
  iterator: ExecutionIterator | undefined,
  getDiagnostics: () => DiagnosticEntry[],
) => {
  const isPaused = (result as { paused?: boolean }).paused;
  if (!isPaused || !iterator) {
    return;
  }
  const token = (result as { token?: unknown }).token;
  if (token === undefined) {
    return;
  }
  const pauseKind = (result as { pauseKind?: PauseKind }).pauseKind;
  sessions.set(token, {
    iterator,
    pauseKind,
    getDiagnostics,
    createdAt: Date.now(),
  });
};
