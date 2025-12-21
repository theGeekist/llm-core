import type { BaseMemory } from "@langchain/core/memory";
import type { AdapterMemory } from "../types";
import { mapMaybe } from "../maybe";

export function fromLangChainMemory(memory: BaseMemory): AdapterMemory {
  function load(input: Record<string, unknown>) {
    return mapMaybe(memory.loadMemoryVariables(input), toRecord);
  }

  function save(input: Record<string, unknown>, output: Record<string, unknown>) {
    return mapMaybe(memory.saveContext(input, output), () => undefined);
  }

  return { load, save };
}

function toRecord(value: unknown) {
  return value as Record<string, unknown>;
}
