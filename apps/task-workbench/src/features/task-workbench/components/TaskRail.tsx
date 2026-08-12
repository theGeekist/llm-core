import { copy } from "../copy";
import type { WorkbenchTask } from "../model";
import { taskView } from "../task-state";

export type QueueView = "active" | "blocked" | "done" | "ready";

const queueViews: readonly QueueView[] = ["ready", "active", "blocked", "done"];
const priorityCodes: Readonly<Record<string, string>> = {
  critical: "P0",
  high: "P1",
  medium: "P2",
  normal: "P3",
};

export const taskLabel = (key: string): string => key.slice(key.indexOf("/") + 1);
export const priorityCode = (priority: string): string => priorityCodes[priority] ?? "P3";
export const queueView = (task: WorkbenchTask): QueueView => {
  const state = taskView(task);
  return state === "needs-action" || state === "waiting" ? "blocked" : state;
};

export function TaskRail({
  onFilter,
  onNewTask,
  onSelect,
  selected,
  tasks,
  view,
}: {
  readonly onFilter: (value: QueueView) => void;
  readonly onNewTask: () => void;
  readonly onSelect: (task: WorkbenchTask) => void;
  readonly selected: string;
  readonly tasks: readonly WorkbenchTask[];
  readonly view: QueueView;
}) {
  return (
    <aside className="task-rail">
      <div className="task-rail-heading">
        <strong>
          <span className="dataset-icon">⊞</span> {copy.queue.title}
        </strong>
        <small>{copy.queue.subtitle}</small>
      </div>
      <div className="new-task-action">
        <button onClick={onNewTask}>{copy.queue.newTask}</button>
      </div>
      <div className="task-tabs" role="tablist">
        {queueViews.map((item) => (
          <button
            aria-selected={view === item}
            className={view === item ? "selected" : ""}
            key={item}
            onClick={() => onFilter(item)}
            role="tab"
          >
            <span>{copy.queue.tabs[item]}</span>
          </button>
        ))}
      </div>
      <div className="task-list">
        {tasks.length === 0 ? <p className="empty">{copy.queue.empty}</p> : null}
        {tasks.map((task) => (
          <button
            className={`task-row state-${taskView(task)} ${selected === task.key ? "selected" : ""}`}
            key={task.key}
            onClick={() => onSelect(task)}
          >
            <span className="state-dot" />
            <span className="task-row-copy">
              <strong>{taskLabel(task.key)}</strong>
              <small>
                <span>♙</span> {task.authority}
              </small>
            </span>
            <span className={`priority priority-${task.priority}`}>
              {priorityCode(task.priority)}
            </span>
          </button>
        ))}
      </div>
      <div className="task-rail-footer">
        <button>
          <span>↶</span> {copy.queue.history}
        </button>
        <button>
          <span>□</span> {copy.queue.archive}
        </button>
      </div>
    </aside>
  );
}
