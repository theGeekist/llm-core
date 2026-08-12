import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { CommandRunner } from "./components/CommandRunner";
import { EvidencePanel } from "./components/EvidencePanel";
import { RemediationDrawer } from "./components/RemediationDrawer";
import { SplitHandle } from "./components/SplitHandle";
import { TaskBriefView } from "./components/TaskBriefView";
import {
  priorityCode,
  queueView,
  TaskRail,
  taskLabel,
  type QueueView,
} from "./components/TaskRail";
import { copy, resolutionText, taskStateLabel } from "./copy";
import { useTaskBrief, type TaskBriefState } from "./hooks/useTaskBrief";
import type { WorkbenchDocument, WorkbenchPlan, WorkbenchTask } from "./model";
import { loadContext, loadPlan, runCommand } from "./services/task-workbench-api";
import { taskResolutions, taskView } from "./task-state";

const DocumentViewer = lazy(() =>
  import("./components/DocumentViewer").then((module) => ({ default: module.DocumentViewer })),
);
const NewTaskDialog = lazy(() =>
  import("./components/NewTaskDialog").then((module) => ({ default: module.NewTaskDialog })),
);
const TaskGraph = lazy(() =>
  import("./components/TaskGraph").then((module) => ({ default: module.TaskGraph })),
);

const priorityDisplay = (priority: string): string => `${priorityCode(priority)} - ${priority}`;

const ItemList = ({ items }: { readonly items: readonly string[] }) =>
  items.length === 0 ? (
    <span className="muted">{copy.common.none}</span>
  ) : (
    <ul>
      {items.map((item) => (
        <li key={item}>
          <code>{item}</code>
        </li>
      ))}
    </ul>
  );

function Inspector({
  briefState,
  contextAvailable,
  copied,
  onClosePanel,
  onCloseRemediation,
  onCopyContext,
  onInspectTask,
  onInspectWorkspace,
  onPlan,
  onPreviewDocument,
  onRunContext,
  onResolveWorkspace,
  onEvidence,
  remediating,
  task,
  workspacePaths,
}: {
  readonly briefState: TaskBriefState;
  readonly contextAvailable: boolean;
  readonly copied: boolean;
  readonly onClosePanel: () => void;
  readonly onCloseRemediation: () => void;
  readonly onCopyContext: () => void;
  readonly onInspectTask: (key: string) => void;
  readonly onInspectWorkspace: () => void;
  readonly onPlan: (plan: WorkbenchPlan) => void;
  readonly onPreviewDocument: (document: WorkbenchDocument) => void;
  readonly onRunContext: () => void;
  readonly onResolveWorkspace: () => void;
  readonly onEvidence: (value: string) => void;
  readonly remediating: boolean;
  readonly task: WorkbenchTask;
  readonly workspacePaths: readonly string[];
}) {
  const blockers = [...task.blockers, ...task.safetyBlockers];
  const resolutions = taskResolutions(task);
  return (
    <aside className="inspector">
      <div className="inspector-header">
        <strong>{taskLabel(task.key)}</strong>
        <div>
          <button aria-label={copy.inspector.moreActions}>⋮</button>
          <button aria-label={copy.inspector.close} onClick={onClosePanel}>
            ×
          </button>
        </div>
      </div>
      <div className="inspector-scroll">
        <div className="task-properties">
          <div>
            <span>{copy.inspector.status}</span>
            <strong className={`property-status state-${taskView(task)}`}>
              <i /> {taskStateLabel(taskView(task), task.status)} <small>⌄</small>
            </strong>
          </div>
          <div>
            <span>{copy.inspector.priority}</span>
            <strong className={`property-priority priority-${task.priority}`}>
              {priorityDisplay(task.priority)}
            </strong>
          </div>
          <div>
            <span>{copy.inspector.stage}</span>
            <code>{task.stage}</code>
          </div>
        </div>
        <TaskBriefView {...briefState} variant="compact" />
        <details className="inspector-section">
          <summary>
            <span>⌄ {copy.inspector.dependencies}</span>
            <b>{task.dependsOn.length}</b>
          </summary>
          <ItemList items={task.dependsOn} />
        </details>
        <details className="inspector-section">
          <summary>
            <span>⌄ {copy.documents.decisions}</span>
            <b>{task.decisions.length}</b>
          </summary>
          <div className="inspector-document-list">
            {task.decisions.map((document) => (
              <div key={document.path}>
                <button onClick={() => onPreviewDocument(document)}>{document.id}</button>
                <a href={document.obsidianUrl}>{copy.documents.openInObsidian}</a>
              </div>
            ))}
          </div>
        </details>
        <details className="inspector-section blockers-section" open>
          <summary>
            <span>⌄ {copy.inspector.blockers}</span>
            <b>{blockers.length}</b>
          </summary>
          {remediating ? (
            <RemediationDrawer
              initialPaths={workspacePaths}
              key={task.key}
              onClose={onCloseRemediation}
              onEvidence={onEvidence}
              onPlan={onPlan}
              task={task}
            />
          ) : resolutions.length > 0 ? (
            <section className="resolution-section">
              {resolutions.map((resolution, index) => {
                const text = resolutionText(resolution);
                return (
                  <article
                    className={`resolution-card kind-${resolution.kind}`}
                    key={`${resolution.kind}:${index}`}
                  >
                    <strong>{text.title}</strong>
                    <p>{text.detail}</p>
                    <p className="resolution-next">{text.next}</p>
                    {resolution.path === undefined ? null : <code>{resolution.path}</code>}
                    <div className="resolution-actions">
                      {resolution.kind === "workspace" ? (
                        <button className="resolve-action" onClick={onResolveWorkspace}>
                          {copy.actions.resolve}
                        </button>
                      ) : null}
                      {resolution.kind === "workspace" ? (
                        <button onClick={onInspectWorkspace}>
                          {copy.inspector.inspectChanges}
                        </button>
                      ) : null}
                      {resolution.relatedTask === undefined ? null : (
                        <button onClick={() => onInspectTask(resolution.relatedTask ?? "")}>
                          {copy.inspector.inspectDependency}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          ) : (
            <section className="resolution-section ready-resolution">
              <strong>{copy.inspector.noBlockers}</strong>
            </section>
          )}
        </details>
      </div>
      <div className="command-bar inspector-command-bar">
        <button className="primary-context-action" onClick={onRunContext}>
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <path d="M5 3.5 12 8l-7 4.5z" />
          </svg>
          {copy.actions.runContext}
        </button>
        <a href={task.document.obsidianUrl}>↗ {copy.documents.openInObsidian}</a>
        <button onClick={() => onPreviewDocument(task.document)}>
          ▤ {copy.documents.previewTask}
        </button>
        <button disabled={!contextAvailable} onClick={onCopyContext}>
          ▣ {copied ? copy.actions.copied : copy.actions.copyContext}
        </button>
      </div>
    </aside>
  );
}

const storedWidth = (key: string, fallback: number): number => {
  const stored = Number(window.localStorage.getItem(key));
  return Number.isFinite(stored) && stored > 0 ? stored : fallback;
};

const storedBoolean = (key: string, fallback: boolean): boolean => {
  const stored = window.localStorage.getItem(key);
  return stored === null ? fallback : stored === "true";
};

function PanelToggleIcon({ side }: { readonly side: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <rect height="11" width="13" x="1.5" y="2.5" />
      <path d={side === "left" ? "M5 3v10" : "M11 3v10"} />
    </svg>
  );
}

function WorkbenchLoadingState() {
  return (
    <main aria-live="polite" className="centred-state workbench-loading-state" role="status">
      <div aria-hidden="true" className="graph-loading-map">
        <i />
        <i />
        <i />
      </div>
      <strong>{copy.app.loading}</strong>
    </main>
  );
}

function GraphModuleLoadingState() {
  return (
    <div className="task-graph-surface initialising">
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

export function TaskWorkbench() {
  const [plan, setPlan] = useState<WorkbenchPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [context, setContext] = useState("");
  const [contextLoading, setContextLoading] = useState(false);
  const [view, setView] = useState<QueueView>("ready");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [commandOutput, setCommandOutput] = useState("");
  const [remediating, setRemediating] = useState(false);
  const [openDocument, setOpenDocument] = useState<WorkbenchDocument | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [graphFocusVersion, setGraphFocusVersion] = useState(0);
  const [taskPaneWidth, setTaskPaneWidth] = useState(() =>
    storedWidth("architect.stitch.taskPaneWidth", 260),
  );
  const [contextPaneWidth, setContextPaneWidth] = useState(() =>
    storedWidth("architect.stitch.contextPaneWidth", 360),
  );
  const [evidencePaneHeight, setEvidencePaneHeight] = useState(() =>
    storedWidth("architect.stitch.evidencePaneHeight", 220),
  );
  const [taskPaneOpen, setTaskPaneOpen] = useState(() =>
    storedBoolean("architect.stitch.taskPaneOpen", true),
  );
  const [contextPaneOpen, setContextPaneOpen] = useState(() =>
    storedBoolean("architect.stitch.contextPaneOpen", true),
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const next = await loadPlan();
      setPlan(next);
      setSelected((current) => {
        if (current !== "" && next.tasks.some(({ key }) => key === current)) return current;
        const defaultTask =
          next.tasks.find(({ canStart }) => canStart) ??
          next.tasks.find((task) => taskView(task) === "needs-action") ??
          next.tasks.find(({ status }) => status === "proposed" || status === "ready") ??
          next.tasks.find((task) => taskView(task) === "active") ??
          next.tasks[0];
        return defaultTask?.key ?? "";
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  const selectedTask = plan?.tasks.find(({ key }) => key === selected) ?? null;
  const briefState = useTaskBrief(selected);
  useEffect(() => {
    window.localStorage.setItem("architect.stitch.taskPaneWidth", String(taskPaneWidth));
  }, [taskPaneWidth]);
  useEffect(() => {
    window.localStorage.setItem("architect.stitch.contextPaneWidth", String(contextPaneWidth));
  }, [contextPaneWidth]);
  useEffect(() => {
    window.localStorage.setItem("architect.stitch.evidencePaneHeight", String(evidencePaneHeight));
  }, [evidencePaneHeight]);
  useEffect(() => {
    window.localStorage.setItem("architect.stitch.taskPaneOpen", String(taskPaneOpen));
  }, [taskPaneOpen]);
  useEffect(() => {
    window.localStorage.setItem("architect.stitch.contextPaneOpen", String(contextPaneOpen));
  }, [contextPaneOpen]);
  useEffect(() => {
    const togglePanes = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "b") return;
      event.preventDefault();
      if (event.altKey) setContextPaneOpen((value) => !value);
      else setTaskPaneOpen((value) => !value);
    };
    window.addEventListener("keydown", togglePanes);
    return () => window.removeEventListener("keydown", togglePanes);
  }, []);
  const filtered = useMemo(() => {
    const normalised = query.trim().toLowerCase();
    return (plan?.tasks ?? []).filter(
      (task) =>
        queueView(task) === view &&
        (normalised === "" || `${task.key} ${task.title}`.toLowerCase().includes(normalised)),
    );
  }, [plan, query, view]);
  const workspacePaths = useMemo(
    () =>
      selectedTask === null
        ? []
        : taskResolutions(selectedTask).flatMap((resolution) =>
            resolution.kind === "workspace" && resolution.path !== undefined
              ? [resolution.path]
              : [],
          ),
    [selectedTask],
  );
  useEffect(() => {
    setRemediating(workspacePaths.length > 0);
  }, [selected, workspacePaths]);

  const runContext = async () => {
    if (selected === "") return;
    setContextLoading(true);
    try {
      setContext(await loadContext(selected));
    } catch (reason) {
      setContext(
        copy.messages.contextFailed(reason instanceof Error ? reason.message : String(reason)),
      );
    } finally {
      setContextLoading(false);
    }
  };

  const inspectWorkspace = async () => {
    setCommandOutput(copy.messages.inspectingChanges);
    try {
      const result = await runCommand("workspace.status", selected);
      setCommandOutput(`${result.command.label}\n\n${result.output}`);
    } catch (reason) {
      setCommandOutput(
        copy.messages.workspaceInspectionFailed(
          reason instanceof Error ? reason.message : String(reason),
        ),
      );
    }
  };

  const selectTask = (task: WorkbenchTask, navigateGraph: boolean) => {
    setSelected(task.key);
    setContextPaneOpen(true);
    if (navigateGraph) setGraphFocusVersion((value) => value + 1);
  };

  const inspectTask = (key: string) => {
    const task = plan?.tasks.find((candidate) => candidate.key === key);
    if (task !== undefined) selectTask(task, true);
  };

  if (plan === null && error === null) return <WorkbenchLoadingState />;
  if (plan === null) return <main className="centred-state error">{error}</main>;
  if (selectedTask === null) return <main className="centred-state">{copy.app.noTask}</main>;

  return (
    <main
      className="workbench-shell"
      style={
        {
          "--context-pane-width": contextPaneOpen ? `${contextPaneWidth}px` : "0px",
          "--context-divider-width": contextPaneOpen ? "4px" : "0px",
          "--evidence-pane-height": `${evidencePaneHeight}px`,
          "--task-pane-width": taskPaneOpen ? `${taskPaneWidth}px` : "0px",
          "--task-divider-width": taskPaneOpen ? "4px" : "0px",
        } as CSSProperties
      }
    >
      <header className="topbar">
        <div className="workbench-identity">
          <strong>
            {copy.app.title} {copy.app.version}
          </strong>
          <div className="workspace-breadcrumb">
            <span>{plan.workspace.branch}</span>
            <i>/</i>
            <code>{selectedTask.authority}</code>
            <i>/</i>
            <b>rev:{plan.workspace.revision}</b>
          </div>
        </div>
        <div className="workspace-meta">
          <label className="global-search">
            <input
              aria-label={copy.toolbar.search}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.toolbar.searchPlaceholder}
              value={query}
            />
            <span>⌕</span>
          </label>
          <CommandRunner onResult={setCommandOutput} task={selected} />
          <button
            aria-label={copy.toolbar.toggleTasks}
            aria-pressed={taskPaneOpen}
            className="pane-toggle"
            onClick={() => setTaskPaneOpen((value) => !value)}
            title={copy.toolbar.toggleTasksHint}
          >
            <PanelToggleIcon side="left" />
          </button>
          <button
            aria-label={copy.toolbar.toggleContext}
            aria-pressed={contextPaneOpen}
            className="pane-toggle"
            onClick={() => setContextPaneOpen((value) => !value)}
            title={copy.toolbar.toggleContextHint}
          >
            <PanelToggleIcon side="right" />
          </button>
          <button
            aria-label={copy.toolbar.refresh}
            className="toolbar-icon"
            onClick={() => void refresh()}
          >
            ↻
          </button>
          <button aria-label={copy.toolbar.settings} className="toolbar-icon">
            ⚙
          </button>
          <span className="workbench-avatar">{copy.app.avatar}</span>
        </div>
      </header>
      <div className="task-pane-slot" hidden={!taskPaneOpen}>
        <TaskRail
          onFilter={setView}
          onNewTask={() => setCreatingTask(true)}
          onSelect={(task) => selectTask(task, true)}
          selected={selected}
          tasks={filtered}
          view={view}
        />
      </div>
      {taskPaneOpen ? (
        <SplitHandle
          className="task-divider"
          label={copy.splitters.tasks}
          maximum={480}
          minimum={200}
          onReset={() => setTaskPaneWidth(260)}
          onResize={setTaskPaneWidth}
          value={taskPaneWidth}
        />
      ) : null}
      <section className="graph-panel">
        <div className="graph-viewport">
          <Suspense fallback={<GraphModuleLoadingState />}>
            <TaskGraph
              focusVersion={graphFocusVersion}
              onSelect={(task) => selectTask(task, false)}
              selected={selected}
              tasks={plan.tasks}
            />
          </Suspense>
        </div>
      </section>
      {contextPaneOpen ? (
        <SplitHandle
          className="context-divider"
          invert
          label={copy.splitters.context}
          maximum={680}
          minimum={350}
          onReset={() => setContextPaneWidth(360)}
          onResize={setContextPaneWidth}
          value={contextPaneWidth}
        />
      ) : null}
      <div className="context-pane-slot" hidden={!contextPaneOpen}>
        <Inspector
          briefState={briefState}
          contextAvailable={context !== ""}
          copied={copied}
          onClosePanel={() => setContextPaneOpen(false)}
          onCloseRemediation={() => setRemediating(false)}
          onCopyContext={() => {
            void navigator.clipboard.writeText(context);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
          onInspectTask={inspectTask}
          onInspectWorkspace={() => void inspectWorkspace()}
          onPlan={setPlan}
          onPreviewDocument={setOpenDocument}
          onRunContext={() => {
            setCommandOutput("");
            void runContext();
          }}
          onResolveWorkspace={() => setRemediating(true)}
          onEvidence={setCommandOutput}
          remediating={remediating}
          task={selectedTask}
          workspacePaths={workspacePaths}
        />
      </div>
      <SplitHandle
        className="evidence-divider"
        invert
        label={copy.splitters.evidence}
        maximum={480}
        minimum={80}
        onReset={() => setEvidencePaneHeight(220)}
        onResize={setEvidencePaneHeight}
        orientation="horizontal"
        value={evidencePaneHeight}
      />
      <EvidencePanel
        briefState={briefState}
        commandOutput={commandOutput}
        context={context}
        contextLoading={contextLoading}
        onOpenDocument={setOpenDocument}
        task={selectedTask}
      />
      {openDocument === null ? null : (
        <Suspense fallback={null}>
          <DocumentViewer document={openDocument} onClose={() => setOpenDocument(null)} />
        </Suspense>
      )}
      {creatingTask ? (
        <Suspense fallback={null}>
          <NewTaskDialog
            onClose={() => setCreatingTask(false)}
            onCreated={(nextPlan, taskKey) => {
              setPlan(nextPlan);
              const task = nextPlan.tasks.find((candidate) => candidate.key === taskKey);
              if (task !== undefined) {
                setSelected(task.key);
                setView(queueView(task));
                setOpenDocument(task.document);
              }
              setCreatingTask(false);
            }}
            tasks={plan.tasks}
          />
        </Suspense>
      ) : null}
    </main>
  );
}
