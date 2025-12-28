import { describe, expect } from "bun:test";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAI as LlamaOpenAI } from "@llamaindex/openai";
import { openai } from "@ai-sdk/openai";
import {
  fromAiSdkModel,
  fromLangChainCallbackHandler,
  fromLangChainModel,
  fromLlamaIndexModel,
} from "#adapters";
import { Recipe } from "../../src/recipes/flow";
import { bindFirst, maybeMap } from "../../src/maybe";
import { expectTelemetryPresence, itIfEnvAll } from "./helpers";

const itWithOpenAI = itIfEnvAll("OPENAI_API_KEY");
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini-2024-07-18";

type RecordedEvent = { name: string; data: unknown };

class RecordingHandler extends BaseCallbackHandler {
  override name = "recording";
  customEvents: RecordedEvent[] = [];
  chainStarts = 0;
  chainEnds = 0;
  llmEnds = 0;

  override handleCustomEvent(eventName: string, data: unknown) {
    this.customEvents.push({ name: eventName, data });
  }

  override handleChainStart() {
    this.chainStarts += 1;
  }

  override handleChainEnd() {
    this.chainEnds += 1;
  }

  override handleLLMEnd() {
    this.llmEnds += 1;
  }
}

const traceEvents = [
  { name: "run.start", data: { recipe: "agent" } },
  { name: "provider.response", data: { modelId: "openai" } },
  { name: "run.end", data: { status: "ok" } },
];

const writeModelResult = (state: Record<string, unknown>, result: unknown) => {
  state.modelResult = result;
  return { output: state };
};

const buildPack = () =>
  Recipe.pack("trace", ({ step }) => ({
    trace: step("trace", ({ state, context }) => {
      const trace = context.adapters?.trace;
      if (!trace || !trace.emitMany) {
        throw new Error("Missing trace adapter.");
      }
      return maybeMap(bindFirst(writeTraceResult, state), trace.emitMany(traceEvents));
    }),
    model: step("model", ({ state, context }) => {
      const model = context.adapters?.model;
      if (!model) {
        throw new Error("Missing model adapter.");
      }
      return maybeMap(bindFirst(writeModelResult, state), model.generate({ prompt: "Say hello." }));
    }).dependsOn("trace"),
  }));

const writeTraceResult = (state: Record<string, unknown>, _result: unknown) => {
  void _result;
  state.traceEmitted = true;
  return { output: state };
};

type AdapterModel =
  | ReturnType<typeof fromAiSdkModel>
  | ReturnType<typeof fromLangChainModel>
  | ReturnType<typeof fromLlamaIndexModel>;

const buildWorkflow = (
  model: AdapterModel,
  trace: ReturnType<typeof fromLangChainCallbackHandler>,
) => Recipe.flow("agent").use(buildPack()).defaults({ adapters: { model, trace } }).build();

const assertTrace = (handler: RecordingHandler) => {
  expect(handler.customEvents).toHaveLength(traceEvents.length);
  expect(handler.chainStarts).toBe(1);
  expect(handler.chainEnds).toBe(1);
  expect(handler.llmEnds).toBe(1);
};

const assertOutcome = (result: { status: string; artefact?: unknown }) => {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") {
    return;
  }
  const artefact = result.artefact as { modelResult?: unknown };
  expectTelemetryPresence(artefact.modelResult as { telemetry?: unknown });
};

describe("Integration trace (AI SDK/OpenAI)", () => {
  itWithOpenAI(
    "runs a LangChain trace adapter with an AI SDK model",
    async () => {
      const handler = new RecordingHandler();
      const trace = fromLangChainCallbackHandler(handler);
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const model = fromAiSdkModel(openai(modelId));
      const workflow = buildWorkflow(model, trace);

      const result = await workflow.run({ input: "x" });
      assertOutcome(result);
      assertTrace(handler);
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration trace (LangChain/OpenAI)", () => {
  itWithOpenAI(
    "runs a LangChain trace adapter with a LangChain model",
    async () => {
      const handler = new RecordingHandler();
      const trace = fromLangChainCallbackHandler(handler);
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const model = fromLangChainModel(new ChatOpenAI({ model: modelId }));
      const workflow = buildWorkflow(model, trace);

      const result = await workflow.run({ input: "x" });
      assertOutcome(result);
      assertTrace(handler);
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration trace (LlamaIndex/OpenAI)", () => {
  itWithOpenAI(
    "runs a LangChain trace adapter with a LlamaIndex model",
    async () => {
      const handler = new RecordingHandler();
      const trace = fromLangChainCallbackHandler(handler);
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const model = fromLlamaIndexModel(new LlamaOpenAI({ model: modelId }));
      const workflow = buildWorkflow(model, trace);

      const result = await workflow.run({ input: "x" });
      assertOutcome(result);
      assertTrace(handler);
    },
    OPENAI_TIMEOUT_MS,
  );
});
