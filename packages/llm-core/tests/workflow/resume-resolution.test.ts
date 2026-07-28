import { describe, expect, it } from "bun:test";
import type { AdapterBundle } from "#adapters";
import type { DiagnosticEntry, TraceEvent } from "#shared/reporting";
import type { Outcome } from "#workflow/types";
import { applyAdapterOverrides, toResolvedAdapters } from "#workflow/runtime/adapters";
import { createResumeHandler } from "#workflow/runtime/resume-handler";
import type { ResumeHandlerDeps } from "#workflow/runtime/resume-types";
import type { PauseSession } from "#workflow/driver/types";
import type { PipelinePauseSnapshot } from "@wpkernel/pipeline/core";
import { diagnosticMessages } from "./helpers";

const TOKEN = "token-resolution";
const baseAdapters: AdapterBundle = { constructs: {} };
const readErrorDiagnostics = () => [] as DiagnosticEntry[];
const errorOutcome = (
  error: unknown,
  trace: TraceEvent[],
  diagnostics?: DiagnosticEntry[],
): Outcome<Record<string, unknown>> => ({
  status: "error",
  error,
  trace,
  diagnostics: diagnostics ?? [],
});
const finalizeResult: ResumeHandlerDeps<"agent">["finalizeResult"] = (input) => ({
  status: "ok",
  artefact: { value: input.result },
  trace: input.trace,
  diagnostics: input.getDiagnostics(),
});

const createPauseSession = (): PauseSession => {
  const snapshot: PipelinePauseSnapshot<unknown> = {
    stageIndex: 0,
    state: {},
    token: TOKEN,
    pauseKind: "human",
    createdAt: Date.now(),
  };
  return {
    snapshot,
    getDiagnostics: () => [],
    createdAt: snapshot.createdAt,
  };
};

type HandlerOptions = Pick<ResumeHandlerDeps<"agent">, "pipeline" | "resolveAdaptersForRun"> & {
  readContractDiagnostics?: ResumeHandlerDeps<"agent">["readContractDiagnostics"];
};

const createHandler = (options: HandlerOptions) =>
  createResumeHandler<"agent">({
    contractName: "agent",
    extensionRegistration: [],
    pipeline: options.pipeline,
    resolveAdaptersForRun: options.resolveAdaptersForRun,
    toResolvedAdapters,
    applyAdapterOverrides,
    readContractDiagnostics: options.readContractDiagnostics ?? (() => []),
    buildDiagnostics: [],
    strictErrorMessage: "strict",
    readErrorDiagnostics,
    errorOutcome,
    finalizeResult,
    baseAdapters,
    pauseSessions: new Map([[TOKEN, createPauseSession()]]),
  });

describe("Workflow resume resolution", () => {
  it("includes adapter-resolution diagnostics when resuming snapshots", async () => {
    const handler = createHandler({
      pipeline: {
        run: () => ({ artefact: { ok: true } }),
        resume: () => ({ artefact: { ok: true } }),
      },
      resolveAdaptersForRun: () => ({
        adapters: baseAdapters,
        diagnostics: [{ level: "warn", message: "resolution warning" }],
        constructs: {},
      }),
    });

    const outcome = await handler(TOKEN, undefined, {
      resume: { resolve: () => ({ input: "resume" }) },
    });

    expect(outcome.status).toBe("ok");
    expect(diagnosticMessages(outcome.diagnostics)).toContain("resolution warning");
  });

  it("applies strict contract diagnostics before resuming snapshots", async () => {
    let resumed = false;
    const handler = createHandler({
      pipeline: {
        run: () => ({ artefact: { ok: true } }),
        resume: () => {
          resumed = true;
          return { artefact: { ok: true } };
        },
      },
      resolveAdaptersForRun: () => ({
        adapters: baseAdapters,
        diagnostics: [],
        constructs: {},
      }),
      readContractDiagnostics: () => [
        { level: "warn", kind: "contract", message: "contract warning" },
      ],
    });

    const outcome = await handler(TOKEN, undefined, {
      diagnostics: "strict",
      resume: { resolve: () => ({ input: "resume" }) },
    });

    expect(outcome.status).toBe("error");
    expect(resumed).toBe(false);
    expect(diagnosticMessages(outcome.diagnostics)).toContain("contract warning");
  });

  it("applies resume adapter overrides to snapshot contexts", async () => {
    let capturedConstructs: AdapterBundle["constructs"];
    const handler = createHandler({
      pipeline: {
        run: () => ({ artefact: { ok: true } }),
        resume: (snapshot) => {
          capturedConstructs = (snapshot.state as { context?: { adapters?: AdapterBundle } })
            .context?.adapters?.constructs;
          return { artefact: { ok: true } };
        },
      },
      resolveAdaptersForRun: () => ({
        adapters: { constructs: { base: true } },
        diagnostics: [],
        constructs: {},
      }),
    });

    const outcome = await handler(TOKEN, undefined, {
      resume: {
        resolve: () => ({
          input: "resume",
          adapters: { constructs: { override: true } },
        }),
      },
    });

    expect(outcome.status).toBe("ok");
    expect(capturedConstructs).toEqual({ base: true, override: true });
  });

  it("re-resolves adapters when the resume adapter selects providers", async () => {
    const providersSeen: Array<Record<string, string> | undefined> = [];
    const handler = createHandler({
      pipeline: {
        run: () => ({ artefact: { ok: true } }),
        resume: () => ({ artefact: { ok: true } }),
      },
      resolveAdaptersForRun: (_runtime, providers) => {
        providersSeen.push(providers);
        return { adapters: baseAdapters, diagnostics: [], constructs: {} };
      },
    });
    const providers = { model: "alternate" };

    const outcome = await handler(TOKEN, undefined, {
      resume: { resolve: () => ({ input: "resume", providers }) },
    });

    expect(outcome.status).toBe("ok");
    expect(providersSeen).toEqual([undefined, providers]);
  });
});
