import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CreateTaskInput } from "../../../../shared/task-authoring-contract";
import { copy } from "../copy";
import type { WorkbenchPlan, WorkbenchTask } from "../model";
import { createTask } from "../services/task-workbench-api";

const taskId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .split("-")
    .filter(Boolean)
    .join("-");

export function NewTaskDialog({
  onClose,
  onCreated,
  tasks,
}: {
  readonly onClose: () => void;
  readonly onCreated: (plan: WorkbenchPlan, taskKey: string) => void;
  readonly tasks: readonly WorkbenchTask[];
}) {
  const [authority, setAuthority] = useState<CreateTaskInput["authority"]>("aifsd");
  const [dependsOn, setDependsOn] = useState("");
  const [id, setId] = useState("");
  const [objective, setObjective] = useState("");
  const [priority, setPriority] = useState<CreateTaskInput["priority"]>("normal");
  const [stage, setStage] = useState("");
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const stages = useMemo(
    () =>
      [...new Set(tasks.filter((task) => task.authority === authority).map((task) => task.stage))]
        .filter((value) => value !== "unclassified")
        .sort(),
    [authority, tasks],
  );

  useEffect(() => {
    if (!stages.includes(stage)) setStage(stages[0] ?? "implementation");
  }, [stage, stages]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError("");
    void createTask({
      authority,
      dependsOn: dependsOn
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      id,
      objective,
      priority,
      stage,
      title,
      why,
    })
      .then(({ plan, taskKey }) => onCreated(plan, taskKey))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setCreating(false));
  };

  return (
    <div className="document-modal-backdrop" role="presentation">
      <form aria-modal="true" className="new-task-dialog" onSubmit={submit} role="dialog">
        <header>
          <div>
            <strong>{copy.taskAuthoring.title}</strong>
            <span>{copy.taskAuthoring.description}</span>
          </div>
          <button aria-label={copy.taskAuthoring.close} onClick={onClose} type="button">
            ×
          </button>
        </header>
        <div className="new-task-fields">
          <label>
            <span>{copy.taskAuthoring.authority}</span>
            <select
              onChange={(event) => setAuthority(event.target.value as CreateTaskInput["authority"])}
              value={authority}
            >
              <option value="aifsd">AIFSD</option>
              <option value="llm-core">llm-core</option>
            </select>
          </label>
          <label>
            <span>{copy.taskAuthoring.priority}</span>
            <select
              onChange={(event) => setPriority(event.target.value as CreateTaskInput["priority"])}
              value={priority}
            >
              {(["critical", "high", "medium", "normal"] as const).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="wide-field">
            <span>{copy.taskAuthoring.taskTitle}</span>
            <input
              onChange={(event) => {
                const value = event.target.value;
                setTitle(value);
                setId((current) =>
                  current === "" || current === taskId(title) ? taskId(value) : current,
                );
              }}
              required
              value={title}
            />
          </label>
          <label>
            <span>{copy.taskAuthoring.taskId}</span>
            <input onChange={(event) => setId(taskId(event.target.value))} required value={id} />
          </label>
          <label>
            <span>{copy.taskAuthoring.stage}</span>
            <select onChange={(event) => setStage(event.target.value)} value={stage}>
              {stages.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="wide-field">
            <span>{copy.taskAuthoring.objective}</span>
            <textarea
              onChange={(event) => setObjective(event.target.value)}
              required
              value={objective}
            />
          </label>
          <label className="wide-field">
            <span>{copy.taskAuthoring.why}</span>
            <textarea onChange={(event) => setWhy(event.target.value)} required value={why} />
          </label>
          <label className="wide-field">
            <span>{copy.taskAuthoring.dependsOn}</span>
            <input
              onChange={(event) => setDependsOn(event.target.value)}
              placeholder={copy.taskAuthoring.dependsOnPlaceholder}
              value={dependsOn}
            />
          </label>
          {error === "" ? null : <p className="new-task-error">{error}</p>}
        </div>
        <footer>
          <button onClick={onClose} type="button">
            {copy.taskAuthoring.cancel}
          </button>
          <button className="create-task-action" disabled={creating} type="submit">
            {creating ? copy.taskAuthoring.creating : copy.taskAuthoring.create}
          </button>
        </footer>
      </form>
    </div>
  );
}
