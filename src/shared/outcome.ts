import type { TraceDiagnostics } from "./reporting";

export type PipelineArtefactInput<T> = {
  readonly artifact: T;
};

export const readPipelineArtefact = <T>(input: PipelineArtefactInput<T>) => input.artifact;

export type ExecutionOutcomeBase = TraceDiagnostics & {
  status: "ok" | "paused" | "error";
};

export type ExecutionOutcomeOk<T> = ExecutionOutcomeBase & {
  status: "ok";
  artefact: T;
};

export type ExecutionOutcomePaused<T> = ExecutionOutcomeBase & {
  status: "paused";
  token: unknown;
  artefact: Partial<T>;
};

export type ExecutionOutcomeError = ExecutionOutcomeBase & {
  status: "error";
  error: unknown;
};

export type ExecutionOutcome<T> =
  | ExecutionOutcomeOk<T>
  | ExecutionOutcomePaused<T>
  | ExecutionOutcomeError;
