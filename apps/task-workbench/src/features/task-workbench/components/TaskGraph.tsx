import {
  Background,
  BackgroundVariant,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { copy, taskStateLabel } from "../copy";
import { graphNodeHeight, graphNodeWidth, layoutGraph } from "../graph";
import { detachedTaskCount } from "../graph-topology";
import type { WorkbenchTask } from "../model";
import { taskView } from "../task-state";

const taskLabel = (key: string): string => key.slice(key.indexOf("/") + 1);

interface TaskNodeData extends Record<string, unknown> {
  readonly label: ReactNode;
  readonly task: WorkbenchTask;
}

type TaskFlowNode = Node<TaskNodeData, "default">;

type GraphIconName = "fit" | "minus" | "plus" | "tree";

function GraphIcon({ name }: { readonly name: GraphIconName }) {
  if (name === "plus" || name === "minus") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M3 8h10" />
        {name === "plus" ? <path d="M8 3v10" /> : null}
      </svg>
    );
  }
  if (name === "fit") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M6 2H2v4M10 2h4v4M2 10v4h4M14 10v4h-4" />
      </svg>
    );
  }
  if (name === "tree") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <rect height="3" width="4" x="6" y="1.5" />
        <rect height="3" width="4" x="1" y="11.5" />
        <rect height="3" width="4" x="11" y="11.5" />
        <path d="M8 4.5v3H3v4M8 7.5h5v4" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M6 2H2v4M10 2h4v4M2 10v4h4M14 10v4h-4" />
    </svg>
  );
}

const pathKeys = (tasks: readonly WorkbenchTask[], selected: string): ReadonlySet<string> => {
  const upstream = new Set<string>();
  const downstream = new Set<string>();
  const byKey = new Map(tasks.map((task) => [task.key, task]));
  const visitUpstream = (key: string) => {
    if (upstream.has(key)) return;
    upstream.add(key);
    for (const dependency of byKey.get(key)?.dependsOn ?? []) visitUpstream(dependency);
  };
  const visitDownstream = (key: string) => {
    if (downstream.has(key)) return;
    downstream.add(key);
    for (const task of tasks) if (task.dependsOn.includes(key)) visitDownstream(task.key);
  };
  visitUpstream(selected);
  visitDownstream(selected);
  return new Set([...upstream, ...downstream]);
};

const taskNodes = (
  tasks: readonly WorkbenchTask[],
  positions: Awaited<ReturnType<typeof layoutGraph>>,
): readonly TaskFlowNode[] =>
  positions.map(({ task, x, y }) => {
    const hasDependants = tasks.some((candidate) => candidate.dependsOn.includes(task.key));
    const role =
      task.dependsOn.length === 0 ? copy.graph.root : hasDependants ? null : copy.graph.outcome;
    return {
      className: `task-flow-node state-${taskView(task)}`,
      data: {
        label: (
          <span className="task-flow-label">
            <strong>{taskLabel(task.key)}</strong>
            <small>
              <span>
                {taskStateLabel(taskView(task), task.status)} · {task.priority}
              </span>
              {role === null ? null : <em>{role}</em>}
            </small>
          </span>
        ),
        task,
      },
      id: task.key,
      height: graphNodeHeight,
      position: { x, y },
      selected: false,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      type: "default" as const,
      width: graphNodeWidth,
    };
  });

const taskEdges = (
  tasks: readonly WorkbenchTask[],
  selected: string,
  criticalPath: boolean,
): readonly Edge[] => {
  const available = new Set(tasks.map(({ key }) => key));
  const path = pathKeys(tasks, selected);
  return tasks.flatMap((task) =>
    task.dependsOn.flatMap((dependency) => {
      if (!available.has(dependency)) return [];
      const highlighted = criticalPath && path.has(dependency) && path.has(task.key);
      const colour = highlighted ? "#58a6ff" : "#30363d";
      return [
        {
          className: highlighted ? "selected-path" : "",
          id: `${dependency}->${task.key}`,
          markerEnd: { color: colour, height: 14, type: MarkerType.ArrowClosed, width: 14 },
          source: dependency,
          style: { stroke: colour, strokeWidth: highlighted ? 1.8 : 1.15 },
          target: task.key,
          type: "smoothstep",
        },
      ];
    }),
  );
};

function TaskGraphViewport({
  focusVersion,
  onSelect,
  selected,
  tasks,
}: {
  readonly focusVersion: number;
  readonly onSelect: (task: WorkbenchTask) => void;
  readonly selected: string;
  readonly tasks: readonly WorkbenchTask[];
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TaskFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [criticalPath, setCriticalPath] = useState(false);
  const [graphReady, setGraphReady] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const focusedVersion = useRef(0);
  const initialised = useRef(false);
  const layoutRequest = useRef(0);
  const nodesInitialised = useNodesInitialized({ includeHiddenNodes: true });
  const { fitView, getNode, getZoom, setCenter, zoomTo } = useReactFlow<TaskFlowNode, Edge>();

  const applyLayout = useCallback(async () => {
    const request = layoutRequest.current + 1;
    layoutRequest.current = request;
    const positions = await layoutGraph(tasks);
    if (request !== layoutRequest.current) return;
    setNodes([...taskNodes(tasks, positions)]);
    setEdges([...taskEdges(tasks, "", false)]);
    setLayoutRevision((value) => value + 1);
  }, [setEdges, setNodes, tasks]);

  useEffect(() => {
    void applyLayout();
  }, [applyLayout]);

  useEffect(() => {
    if (initialised.current || !nodesInitialised || layoutRevision === 0 || selected === "") return;
    const node = getNode(selected);
    if (node === undefined) return;
    initialised.current = true;
    const width = node.measured?.width ?? node.width ?? graphNodeWidth;
    const height = node.measured?.height ?? node.height ?? graphNodeHeight;
    window.requestAnimationFrame(() => {
      void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        duration: 0,
        zoom: 1,
      }).finally(() => setGraphReady(true));
    });
  }, [getNode, layoutRevision, nodesInitialised, selected, setCenter]);

  useEffect(() => {
    const lineage = criticalPath ? pathKeys(tasks, selected) : new Set<string>();
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const className = [
          `task-flow-node state-${taskView(node.data.task)}`,
          criticalPath && lineage.has(node.id) ? "in-lineage" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const isSelected = node.id === selected;
        if (node.className === className && node.selected === isSelected) return node;
        changed = true;
        return { ...node, className, selected: isSelected };
      });
      return changed ? next : current;
    });
    setEdges((current) => {
      if (!criticalPath && current.every((edge) => edge.className !== "selected-path")) {
        return current;
      }
      return [...taskEdges(tasks, selected, criticalPath)];
    });
  }, [criticalPath, layoutRevision, selected, setEdges, setNodes, tasks]);

  useEffect(() => {
    if (focusVersion === 0 || focusVersion === focusedVersion.current || layoutRevision === 0)
      return;
    focusedVersion.current = focusVersion;
    const node = getNode(selected);
    if (node === undefined) return;
    const width = node.measured?.width ?? 160;
    const height = node.measured?.height ?? 76;
    void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
      duration: 280,
      zoom: getZoom(),
    });
  }, [focusVersion, getNode, getZoom, layoutRevision, selected, setCenter]);

  const changeZoom = (factor: number): void => {
    const next = Math.min(6, Math.max(0.03, getZoom() * factor));
    void zoomTo(next, { duration: 140 });
  };

  const detached = detachedTaskCount(tasks);

  return (
    <div className={`task-graph-surface ${graphReady ? "ready" : "initialising"}`}>
      <ReactFlow<TaskFlowNode, Edge>
        edges={edges}
        elementsSelectable
        maxZoom={6}
        minZoom={0.03}
        nodes={nodes}
        nodesDraggable
        nodesFocusable
        onEdgesChange={onEdgesChange}
        onNodeClick={(_event, node) => onSelect(node.data.task)}
        onNodesChange={onNodesChange}
        onlyRenderVisibleElements={graphReady}
        panOnDrag
        panOnScroll
        panOnScrollSpeed={0.8}
        preventScrolling
        selectionOnDrag={false}
        zoomActivationKeyCode="Meta"
        zoomOnPinch
        zoomOnScroll={false}
      >
        <Background color="#27303a" gap={18} size={0.7} variant={BackgroundVariant.Dots} />
        <Panel className="graph-control-cluster" position="top-left">
          <div className="graph-control-row">
            <button
              aria-label={copy.graph.zoomIn}
              onClick={() => changeZoom(1.6)}
              title={copy.graph.zoomIn}
            >
              <GraphIcon name="plus" />
            </button>
            <button
              aria-label={copy.graph.zoomOut}
              onClick={() => changeZoom(0.625)}
              title={copy.graph.zoomOut}
            >
              <GraphIcon name="minus" />
            </button>
            <button
              aria-label={copy.graph.showEntireGraph}
              onClick={() => void fitView({ duration: 180, padding: 0.12 })}
              title={copy.graph.showEntireGraph}
            >
              <GraphIcon name="fit" />
            </button>
          </div>
          <button
            aria-label={copy.graph.toggleLineage}
            aria-pressed={criticalPath}
            className="critical-path-toggle"
            onClick={() => setCriticalPath((value) => !value)}
            title={copy.graph.toggleLineage}
          >
            <GraphIcon name="tree" />
            <span>{copy.graph.lineage}</span>
            <i />
          </button>
        </Panel>
        <Panel className="graph-direction" position="top-right">
          <span>{copy.graph.directionRoots}</span>
          <span>{copy.graph.directionOutcomes}</span>
          {detached === 0 ? null : <span>{copy.graph.detached(detached)}</span>}
        </Panel>
        <Panel className="graph-interaction-hint" position="bottom-left">
          {copy.graph.hint}
        </Panel>
      </ReactFlow>
      <div aria-live="polite" className="graph-loading-state" role="status">
        <div aria-hidden="true" className="graph-loading-map">
          <i />
          <i />
          <i />
        </div>
        <strong>{copy.graph.loadingTitle}</strong>
        <span>{copy.graph.loadingDetail}</span>
      </div>
    </div>
  );
}

export function TaskGraph(props: {
  readonly focusVersion: number;
  readonly onSelect: (task: WorkbenchTask) => void;
  readonly selected: string;
  readonly tasks: readonly WorkbenchTask[];
}) {
  return (
    <ReactFlowProvider>
      <TaskGraphViewport {...props} />
    </ReactFlowProvider>
  );
}
