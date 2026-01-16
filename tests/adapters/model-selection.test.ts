import { describe, expect, it } from "bun:test";
import { selectModel } from "../../src/adapters/model-selection";

const createCapture = () => ({
  tokens: [] as Array<{ providerId: string; tokens?: Record<string, string> | null }>,
  baseUrls: 0,
});

const readGenerate = (model: { generate?: unknown }) => typeof model.generate === "function";

const setEnv = (key: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
};

const setProcess = (value: typeof process | undefined) => {
  (globalThis as { process?: typeof process }).process = value;
};

describe("adapter model selection", () => {
  it("passes token inputs to custom readers", () => {
    const capture = createCapture();
    const model = selectModel(
      {
        source: "ai-sdk",
        providerId: "openai",
        modelId: "gpt-4o-mini",
        tokens: { openai: "sk-local" },
      },
      {
        readToken: (input) => {
          capture.tokens.push(input);
          return input.tokens?.openai ?? null;
        },
      },
    );

    expect(capture.tokens.length).toBe(1);
    expect(capture.tokens[0]?.providerId).toBe("openai");
    expect(readGenerate(model)).toBe(true);
  });

  it("falls back to defaults when selection is incomplete", () => {
    const capture = createCapture();
    const model = selectModel(
      { source: null, providerId: null, modelId: null },
      {
        defaultSource: "langchain",
        defaultProviders: { langchain: "ollama" },
        readToken: (input) => {
          capture.tokens.push(input);
          return null;
        },
        readOllamaBaseUrl: () => {
          capture.baseUrls += 1;
          return "http://localhost:11435";
        },
      },
    );

    expect(capture.tokens[0]?.providerId).toBe("ollama");
    expect(capture.baseUrls).toBe(1);
    expect(readGenerate(model)).toBe(true);
  });

  it("uses selection tokens when provided", () => {
    const model = selectModel({
      source: "ai-sdk",
      providerId: "openai",
      modelId: "gpt-4o-mini",
      tokens: { openai: "sk-openai" },
    });

    expect(readGenerate(model)).toBe(true);
  });

  it("handles anthropic tokens", () => {
    const model = selectModel({
      source: "ai-sdk",
      providerId: "anthropic",
      modelId: "claude-3-5-sonnet-20240620",
      tokens: { anthropic: "sk-ant" },
    });

    expect(readGenerate(model)).toBe(true);
  });

  it("treats selection without source as a direct selection", () => {
    const model = selectModel({ providerId: "openai" });

    expect(readGenerate(model)).toBe(true);
  });

  it("returns a selector function when only options are provided", () => {
    const selector = selectModel({ defaultSource: "ai-sdk" });

    expect(typeof selector).toBe("function");
  });

  it("returns langchain and llamaindex adapters", () => {
    const langchainModel = selectModel({ source: "langchain", providerId: "openai" });
    const llamaIndexModel = selectModel({ source: "llamaindex", providerId: "openai" });

    expect(readGenerate(langchainModel)).toBe(true);
    expect(readGenerate(llamaIndexModel)).toBe(true);
  });

  it("uses environment tokens when provided", () => {
    const prevOpenAi = process.env.OPENAI_API_KEY;
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    setEnv("OPENAI_API_KEY", "sk-openai");
    setEnv("ANTHROPIC_API_KEY", "sk-anthropic");

    const openAiModel = selectModel({ source: "ai-sdk", providerId: "openai" });
    const anthropicModel = selectModel({ source: "ai-sdk", providerId: "anthropic" });

    expect(readGenerate(openAiModel)).toBe(true);
    expect(readGenerate(anthropicModel)).toBe(true);

    setEnv("OPENAI_API_KEY", prevOpenAi);
    setEnv("ANTHROPIC_API_KEY", prevAnthropic);
  });

  it("handles missing process environment", () => {
    const prevProcess = process;

    setProcess(undefined);
    const model = selectModel({ source: "ai-sdk", providerId: "openai" });
    setProcess(prevProcess);

    expect(readGenerate(model)).toBe(true);
  });
});
