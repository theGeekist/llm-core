import {
  createSpecificationGraph,
  createSpecificationSourceSnapshot,
} from "../features/specifications/runtime";

export const graphFromSource = (input: unknown): ReturnType<typeof createSpecificationGraph> => {
  try {
    return createSpecificationGraph(input as never);
  } catch (graphError) {
    try {
      const source = createSpecificationSourceSnapshot(input as never);
      return createSpecificationGraph({
        graphId: `${source.sourceId}.loaded` as never,
        version: source.format.version,
        sources: [source],
        nodes: [],
        relationships: [],
      });
    } catch {
      throw graphError;
    }
  }
};
