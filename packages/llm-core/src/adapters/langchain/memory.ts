import type { BaseMemory } from "@langchain/core/memory";
import type { AdapterCallContext, Memory } from "../types";
import { toTrue } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
import {
  reportDiagnostics,
  validateMemoryLoadInput,
  validateMemorySaveInput,
} from "../input-validation";

export function fromLangChainMemory(memory: BaseMemory): Memory {
  function load(input: Record<string, unknown>, context?: AdapterCallContext) {
    const diagnostics = validateMemoryLoadInput(input);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return {};
    }
    return maybeMap(toRecord, memory.loadMemoryVariables(input));
  }

  function save(
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    context?: AdapterCallContext,
  ) {
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
