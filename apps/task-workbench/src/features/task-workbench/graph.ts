import type { GraphNode, WorkbenchTask } from "./model";

type ElkInstance = InstanceType<(typeof import("elkjs/lib/elk.bundled.js"))["default"]>;

let elkEngine: Promise<ElkInstance> | null = null;
const loadElk = (): Promise<ElkInstance> => {
  elkEngine ??= import("elkjs/lib/elk.bundled.js").then(({ default: Elk }) => new Elk());
  return elkEngine;
};
export const graphNodeWidth = 160;
export const graphNodeHeight = 76;

export const layoutGraph = async (
  tasks: readonly WorkbenchTask[],
): Promise<readonly GraphNode[]> => {
  const available = new Set(tasks.map(({ key }) => key));
  const graph = await (
    await loadElk()
  ).layout({
    children: tasks.map(({ key }) => ({
      height: graphNodeHeight,
      id: key,
      width: graphNodeWidth,
    })),
    edges: tasks.flatMap((task) =>
      task.dependsOn.flatMap((dependency) =>
        available.has(dependency)
          ? [{ id: `${dependency}->${task.key}`, sources: [dependency], targets: [task.key] }]
          : [],
      ),
    ),
    id: "task-graph",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.spacing.nodeNodeBetweenLayers": "82",
      "elk.padding": "[top=54,left=54,bottom=54,right=54]",
      "elk.spacing.nodeNode": "44",
    },
  });
  const positions = new Map(
    graph.children?.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]) ?? [],
  );
  return tasks.map((task) => ({ task, ...(positions.get(task.key) ?? { x: 0, y: 0 }) }));
};
