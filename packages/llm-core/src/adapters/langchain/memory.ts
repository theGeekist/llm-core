import type { BaseMemory } from "@langchain/core/memory";
import type { AdapterRequest, Memory } from "../types";
import { toTrue } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
import {
  reportDiagnostics,
  validateMemoryLoadInput,
  validateMemorySaveInput,
} from "../input-validation";

export function fromLangChainMemory(memory: BaseMemory): Memory {
  function load({ input, context }: AdapterRequest<{ input: Record<string, unknown> }>) {
    const diagnostics = validateMemoryLoadInput(input);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return {};
    }
    return maybeMap(toRecord, memory.loadMemoryVariables(input));
  }

  function save({
    input,
    output,
    context,
  }: AdapterRequest<{
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  }>) {
    const diagnostics = validateMemorySaveInput(input, output);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return false;
    }
    return maybeMap(toTrue, memory.saveContext(input, output));
  }

  return { load, save };
}

function toRecord(value: unknown) {
  return value as Record<string, unknown>;
}
