import type { Runtime, ArtefactOf, Outcome, RecipeName } from "../types";
import type { DiagnosticEntry } from "#shared/reporting";
import { createResumeDiagnostic } from "#shared/diagnostics";
import { applyDiagnosticsMode } from "#shared/reporting";
import { createInvalidResumeDiagnostics } from "./resume-diagnostics";
import type { TraceEvent } from "#shared/reporting";
import { isRecord } from "#shared/guards";
import type { ResumeSession } from "./resume-session";
import type { ActiveResumeSession } from "./resume-exec";
import type { PauseKind } from "#adapters/types";
import { toPauseKind } from "../pause";

type ResumeTokenEnvelope = {
  token?: unknown;
  resumeKey?: unknown;
};

/** @internal */
export const readResumeTokenInput = (value: unknown): { token: unknown; resumeKey?: string } => {
  if (!isRecord(value) || !("resumeKey" in value)) {
    return { token: value };
  }
  const typed = value as ResumeTokenEnvelope;
  const resumeKey = typeof typed.resumeKey === "string" ? typed.resumeKey : undefined;
  return { token: "token" in typed ? typed.token : value, resumeKey };
};

export const readResumeTokenFromSession = (session: ResumeSession, token: unknown) => {
  if (session.kind === "pause") {
    return session.session.snapshot.token ?? token;
  }
  if (session.kind === "snapshot") {
    return session.snapshot.token ?? token;
  }
  return token;
};

export const readPauseKindFromSession = (session: ActiveResumeSession): PauseKind | null => {
  const pauseKind =
    session.kind === "pause" ? session.session.snapshot.pauseKind : session.snapshot.pauseKind;
  return toPauseKind(pauseKind);
};

type ResumeAdapterRequired<N extends RecipeName> =
  | { ok: true; adapter: NonNullable<Runtime["resume"]> }
  | { ok: false; outcome: Outcome<ArtefactOf<N>> };

type RequireResumeAdapterInput<N extends RecipeName> = {
  resumeAdapter: Runtime["resume"] | undefined;
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  buildDiagnostics: DiagnosticEntry[];
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>;
};

export const requireResumeAdapter = <N extends RecipeName>(
  input: RequireResumeAdapterInput<N>,
): ResumeAdapterRequired<N> => {
  const resumeAdapter = input.resumeAdapter;
  if (resumeAdapter && typeof resumeAdapter.resolve === "function") {
    return { ok: true, adapter: resumeAdapter };
  }
  const diagnostics = applyDiagnosticsMode(
    [...input.buildDiagnostics, createResumeDiagnostic("Resume requires a resume adapter.")],
    input.diagnosticsMode,
  );
  return {
    ok: false,
    outcome: input.errorOutcome(
      new Error("Resume requires a resume adapter."),
      input.trace,
      diagnostics,
    ),
  };
};

type InvalidResumeTokenInput<N extends RecipeName> = {
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  buildDiagnostics: DiagnosticEntry[];
  message: string;
  code: string;
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>;
};

export const invalidResumeTokenOutcome = <N extends RecipeName>(
  input: InvalidResumeTokenInput<N>,
) => {
  const diagnostics = createInvalidResumeDiagnostics({
    buildDiagnostics: input.buildDiagnostics,
    diagnosticsMode: input.diagnosticsMode,
    message: input.message,
    code: input.code,
  });
  return input.errorOutcome(new Error(input.message), input.trace, diagnostics);
};
