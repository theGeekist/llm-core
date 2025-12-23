import type { BaseMemory } from "@langchain/core/memory";
import type { AdapterCallContext, Memory } from "../types";
import { mapMaybe } from "../../maybe";
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
    return mapMaybe(memory.loadMemoryVariables(input), toRecord);
  }

  function save(
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    context?: AdapterCallContext,
  ) {
    const diagnostics = validateMemorySaveInput(input, output);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return;
    }
    return mapMaybe(memory.saveContext(input, output), () => undefined);
  }

  return { load, save };
}

function toRecord(value: unknown) {
  return value as Record<string, unknown>;
}
