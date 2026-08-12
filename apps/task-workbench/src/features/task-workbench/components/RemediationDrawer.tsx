import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RemediationReceipt,
  WorkspacePathState,
  WorkspaceRemediationId,
  WorkspaceRemediationPreview,
} from "../../../../shared/remediation-contract";
import type { WorkbenchPlan, WorkbenchTask } from "../model";
import { copy } from "../copy";
import { executeRemediation, previewRemediation } from "../services/task-workbench-api";

type DrawerStage = "explain" | "configure" | "preview" | "execute" | "receipt";

const stages: readonly DrawerStage[] = ["explain", "configure", "preview", "execute", "receipt"];
const taskLabel = (key: string): string => key.slice(key.indexOf("/") + 1);

function OperationPreview({
  actionId,
  busy,
  error,
  onChange,
  onExecute,
  preview,
}: {
  readonly actionId: WorkspaceRemediationId;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onChange: () => void;
  readonly onExecute: () => void;
  readonly preview: WorkspaceRemediationPreview;
}) {
  const executeLabel =
    actionId === "workspace.checkpoint"
      ? copy.remediation.commitAndValidate
      : copy.remediation.stashAndValidate;
  return (
    <div className="operation-preview">
      <div className="preview-heading">
        <strong>{copy.remediation.boundPreview}</strong>
        <small>{copy.remediation.expires(new Date(preview.expiresAt).toLocaleTimeString())}</small>
      </div>
      <dl>
        <dt>{copy.remediation.currentHead}</dt>
        <dd>
          <code>{preview.head.slice(0, 12)}</code>
        </dd>
        <dt>{copy.remediation.statusDigest}</dt>
        <dd>
          <code>{preview.statusDigest.slice(0, 16)}</code>
        </dd>
        <dt>{copy.remediation.gitOperation}</dt>
        <dd>
          <code>{preview.command.join(" && ")}</code>
        </dd>
        <dt>{copy.remediation.effect}</dt>
        <dd>{preview.effect}</dd>
        <dt>{copy.remediation.validation}</dt>
        <dd>{preview.validation.join(" · ")}</dd>
      </dl>
      {preview.warnings.map((warning) => (
        <p className="preview-warning" key={warning}>
          {warning}
        </p>
      ))}
      <div className="operation-queue">
        <strong>{copy.remediation.operationsQueue}</strong>
        <span className="queued-operation">{copy.remediation.checkpointQueueItem}</span>
        <span className="disabled-operation">{copy.remediation.stashQueueItem}</span>
      </div>
      <div className="preview-actions">
        {busy ? (
          <div aria-live="polite" className="execution-progress" role="status">
            <span />
            <div>
              <strong>{copy.remediation.executingOperation}</strong>
              <small>{copy.remediation.executionDetails}</small>
            </div>
          </div>
        ) : null}
        {error === null ? null : (
          <p aria-live="assertive" className="remediation-error" role="alert">
            <strong>{copy.remediation.executionRejected}</strong>
            {error}
          </p>
        )}
        <button className="change-configuration" onClick={onChange}>
          {copy.remediation.changeConfiguration}
        </button>
        <button
          className="execute-action"
          disabled={busy || !preview.executable}
          onClick={onExecute}
        >
          {busy ? copy.remediation.executing : executeLabel}
        </button>
      </div>
    </div>
  );
}

function ReceiptBody({
  onClose,
  receipt,
}: {
  readonly onClose: () => void;
  readonly receipt: RemediationReceipt;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="receipt-body">
      <div className="receipt-success">
        <strong>{copy.remediation.receiptAdmitted}</strong>
        <span>{copy.remediation.plannerRerun(receipt.plannerRerun)}</span>
      </div>
      <dl>
        <dt>{copy.remediation.receipt}</dt>
        <dd>
          <code>{receipt.id}</code>
        </dd>
        <dt>{copy.remediation.operation}</dt>
        <dd>
          <code>{receipt.operationIdentity}</code>
        </dd>
        <dt>{copy.remediation.before}</dt>
        <dd>
          <code>
            {receipt.before.head.slice(0, 12)} / {receipt.before.statusDigest.slice(0, 12)}
          </code>
        </dd>
        <dt>{copy.remediation.after}</dt>
        <dd>
          <code>
            {receipt.after.head.slice(0, 12)} / {receipt.after.statusDigest.slice(0, 12)}
          </code>
        </dd>
        <dt>{copy.remediation.affectedPaths}</dt>
        <dd>
          {receipt.affectedPaths.map((path) => (
            <code key={path}>{path}</code>
          ))}
        </dd>
      </dl>
      <div className="receipt-validations">
        {receipt.validation.map((item) => (
          <p key={item.command}>
            <span className={item.exitCode === 0 ? "passed" : "failed"} />
            <code>{item.command}</code>
            <small>{copy.remediation.exitCode(item.exitCode)}</small>
          </p>
        ))}
      </div>
      <div className="receipt-actions">
        <button
          onClick={() => {
            void navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? copy.actions.copied : copy.remediation.copyReceipt}
        </button>
        <button className="return-action" onClick={onClose}>
          {copy.remediation.returnToTask}
        </button>
      </div>
    </div>
  );
}

function RemediationBody({
  actionId,
  busy,
  criticalSelected,
  error,
  message,
  onAction,
  onExecute,
  onInvalidate,
  onMessage,
  onPreview,
  onTogglePath,
  orderedPaths,
  paths,
  preview,
  task,
}: {
  readonly actionId: WorkspaceRemediationId;
  readonly busy: boolean;
  readonly criticalSelected: boolean;
  readonly error: string | null;
  readonly message: string;
  readonly onAction: (action: WorkspaceRemediationId) => void;
  readonly onExecute: () => void;
  readonly onInvalidate: () => void;
  readonly onMessage: (message: string) => void;
  readonly onPreview: () => void;
  readonly onTogglePath: (path: string) => void;
  readonly orderedPaths: readonly WorkspacePathState[];
  readonly paths: readonly string[];
  readonly preview: WorkspaceRemediationPreview | null;
  readonly task: WorkbenchTask;
}) {
  const messageLabel =
    actionId === "workspace.checkpoint"
      ? copy.remediation.commitMessage
      : copy.remediation.stashLabel;
  const stashDescription = criticalSelected
    ? copy.remediation.stashDisabled
    : copy.remediation.stashDescription;
  return (
    <div className="remediation-body">
      <div className="remediation-explanation">
        <strong>{copy.remediation.whatIsWrong}</strong>
        <p>{copy.remediation.overlap(task.key)}</p>
      </div>

      <div className="operation-options">
        <button
          className={actionId === "workspace.checkpoint" ? "selected" : ""}
          onClick={() => onAction("workspace.checkpoint")}
        >
          <strong>{copy.remediation.checkpointTitle}</strong>
          <small>{copy.remediation.checkpointDescription}</small>
        </button>
        <button
          className={actionId === "workspace.stash" ? "selected" : ""}
          disabled={criticalSelected}
          onClick={() => onAction("workspace.stash")}
        >
          <strong>{copy.remediation.safelyStash}</strong>
          <small>{stashDescription}</small>
        </button>
      </div>

      <fieldset className="path-selection">
        <legend>{copy.remediation.exactPaths}</legend>
        {orderedPaths.map((item) => (
          <label key={item.path}>
            <input
              checked={paths.includes(item.path)}
              onChange={() => onTogglePath(item.path)}
              type="checkbox"
            />
            <code>{item.path}</code>
            {item.runtimeCritical ? <small>{copy.remediation.runningSource}</small> : null}
          </label>
        ))}
      </fieldset>

      <label className="message-field">
        <span>{messageLabel}</span>
        <input
          maxLength={120}
          onChange={(event) => onMessage(event.target.value)}
          value={message}
        />
      </label>

      {preview === null ? (
        <button
          className="preview-action"
          disabled={busy || paths.length === 0}
          onClick={onPreview}
        >
          {busy ? copy.remediation.buildPreview : copy.remediation.previewOperation}
        </button>
      ) : (
        <OperationPreview
          actionId={actionId}
          busy={busy}
          error={error}
          onChange={onInvalidate}
          onExecute={onExecute}
          preview={preview}
        />
      )}
      {preview === null && error !== null ? <p className="remediation-error">{error}</p> : null}
    </div>
  );
}

export function RemediationDrawer({
  initialPaths,
  onClose,
  onEvidence,
  onPlan,
  task,
}: {
  readonly initialPaths: readonly string[];
  readonly onClose: () => void;
  readonly onEvidence: (value: string) => void;
  readonly onPlan: (plan: WorkbenchPlan) => void;
  readonly task: WorkbenchTask;
}) {
  const defaultMessage = copy.remediation.defaultMessage(taskLabel(task.key));
  const [actionId, setActionId] = useState<WorkspaceRemediationId>("workspace.checkpoint");
  const [message, setMessage] = useState(defaultMessage);
  const [paths, setPaths] = useState<readonly string[]>(initialPaths);
  const [preview, setPreview] = useState<WorkspaceRemediationPreview | null>(null);
  const [availablePaths, setAvailablePaths] = useState<readonly WorkspacePathState[]>(
    initialPaths.map((path) => ({
      indexStatus: "",
      path,
      runtimeCritical: path.startsWith("apps/task-workbench/"),
      worktreeStatus: "",
    })),
  );
  const [receipt, setReceipt] = useState<RemediationReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stage: DrawerStage =
    receipt !== null
      ? "receipt"
      : busy && preview !== null
        ? "execute"
        : preview !== null
          ? "preview"
          : "configure";
  const criticalSelected = useMemo(
    () =>
      availablePaths.some(({ path, runtimeCritical }) => runtimeCritical && paths.includes(path)),
    [availablePaths, paths],
  );
  const orderedPaths = useMemo(
    () =>
      [...availablePaths].sort((left, right) => {
        const selectedOrder =
          Number(paths.includes(right.path)) - Number(paths.includes(left.path));
        return selectedOrder === 0 ? left.path.localeCompare(right.path) : selectedOrder;
      }),
    [availablePaths, paths],
  );

  const requestPreview = useCallback(async () => {
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const result = await previewRemediation({ actionId, message, paths, task: task.key });
      setPreview(result);
      setAvailablePaths(result.availablePaths);
    } catch (reason) {
      setPreview(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }, [actionId, message, paths, task.key]);

  useEffect(() => {
    void requestPreview();
  }, []);

  const invalidatePreview = () => {
    setPreview(null);
    setReceipt(null);
    setError(null);
  };

  const chooseAction = (next: WorkspaceRemediationId) => {
    setActionId(next);
    invalidatePreview();
  };

  const togglePath = (path: string) => {
    setPaths((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path],
    );
    invalidatePreview();
  };

  const execute = async () => {
    if (preview === null || !preview.executable) return;
    setBusy(true);
    setError(null);
    try {
      const result = await executeRemediation(preview.token);
      setReceipt(result.receipt);
      if (result.plan !== null) onPlan(result.plan);
      onEvidence(JSON.stringify(result.receipt, null, 2));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="remediation-drawer" aria-label={copy.remediation.title}>
      <div className="remediation-title">
        <div>
          <small>{copy.remediation.structured}</small>
          <strong>
            {receipt === null ? copy.remediation.title : copy.remediation.executionReceipt}
          </strong>
        </div>
        <button aria-label={copy.remediation.close} onClick={onClose}>
          ×
        </button>
      </div>
      <ol className="remediation-stages">
        {stages.map((item) => (
          <li
            className={
              item === stage
                ? "active"
                : stages.indexOf(item) < stages.indexOf(stage)
                  ? "complete"
                  : ""
            }
            key={item}
          >
            {copy.remediation.stages[item]}
          </li>
        ))}
      </ol>

      {receipt === null ? (
        <RemediationBody
          actionId={actionId}
          busy={busy}
          criticalSelected={criticalSelected}
          error={error}
          message={message}
          onAction={chooseAction}
          onExecute={() => void execute()}
          onInvalidate={invalidatePreview}
          onMessage={(value) => {
            setMessage(value);
            invalidatePreview();
          }}
          onPreview={() => void requestPreview()}
          onTogglePath={togglePath}
          orderedPaths={orderedPaths}
          paths={paths}
          preview={preview}
          task={task}
        />
      ) : (
        <ReceiptBody onClose={onClose} receipt={receipt} />
      )}
    </section>
  );
}
