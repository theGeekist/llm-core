import { useState } from "react";
import { copy } from "../copy";
import type { TaskBriefState } from "../hooks/useTaskBrief";
import type { WorkbenchDocument, WorkbenchTask } from "../model";
import { TaskBriefView } from "./TaskBriefView";

type EvidenceView = "ci" | "decisions" | "git" | "reading" | "summary";

const evidenceTabs: readonly {
  readonly id: EvidenceView;
  readonly icon: string;
}[] = [
  { id: "summary", icon: "▤" },
  { id: "reading", icon: "▥" },
  { id: "decisions", icon: "⌁" },
  { id: "git", icon: "⑂" },
  { id: "ci", icon: "✓" },
];

const taskLabel = (key: string): string => key.slice(key.indexOf("/") + 1);

export function EvidencePanel({
  briefState,
  commandOutput,
  context,
  contextLoading,
  onOpenDocument,
  task,
}: {
  readonly briefState: TaskBriefState;
  readonly commandOutput: string;
  readonly context: string;
  readonly contextLoading: boolean;
  readonly onOpenDocument: (document: WorkbenchDocument) => void;
  readonly task: WorkbenchTask;
}) {
  const [active, setActive] = useState<EvidenceView>("summary");
  const blockers = [...task.blockers, ...task.safetyBlockers];
  const textOutput = commandOutput || context || copy.evidence.empty;
  return (
    <section className="evidence-panel">
      <div className="evidence-tabs" role="tablist">
        {evidenceTabs.map((tab) => (
          <button
            aria-selected={active === tab.id}
            className={active === tab.id ? "selected" : ""}
            key={tab.id}
            onClick={() => setActive(tab.id)}
            role="tab"
          >
            <span className={tab.id === "ci" ? "ci-icon" : ""}>{tab.icon}</span>{" "}
            {copy.evidence.tabs[tab.id]}
            {tab.id === "git" && commandOutput !== "" ? <small>1</small> : null}
          </button>
        ))}
        <span className="evidence-collapse">⌄</span>
      </div>
      <div className="evidence-content">
        <div className="evidence-main">
          {active === "summary" ? (
            <>
              <h2>{copy.evidence.summary(taskLabel(task.key))}</h2>
              <TaskBriefView {...briefState} variant="full" />
              <h3>{copy.evidence.validationResults}</h3>
              <div className="validation-result valid">
                ✓ {copy.evidence.conflicts(task.conflictsWith.length)}
              </div>
              {blockers.length > 0 ? (
                <div className="validation-result warning">
                  ! {copy.evidence.warning(blockers.length)}
                </div>
              ) : null}
            </>
          ) : null}
          {active === "reading" ? (
            <ul className="evidence-list">
              {task.requiredReading.map((item) => (
                <li className="document-list-item" key={`${item.path}:${item.ref ?? ""}`}>
                  <div>
                    <code>{item.path}</code>
                    <span>{item.reason}</span>
                  </div>
                  {item.document === undefined ? null : (
                    <div>
                      <button onClick={() => onOpenDocument(item.document!)}>
                        {copy.documents.preview}
                      </button>
                      <a href={item.document.obsidianUrl}>{copy.documents.openInObsidian}</a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {active === "decisions" ? (
            <ul className="evidence-list">
              {task.decisions.map((document) => (
                <li className="document-list-item" key={document.path}>
                  <div>
                    <code>{document.id}</code>
                    <span>{document.path}</span>
                  </div>
                  <div>
                    <button onClick={() => onOpenDocument(document)}>
                      {copy.documents.preview}
                    </button>
                    <a href={document.obsidianUrl}>{copy.documents.openInObsidian}</a>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {active === "git" || active === "ci" ? (
            <pre>{contextLoading ? copy.evidence.compiling : textOutput}</pre>
          ) : null}
        </div>
        <aside className="affected-context">
          <h3>{copy.evidence.affectedContext}</h3>
          {(task.writeScope.length > 0 ? task.writeScope : [task.path]).slice(0, 8).map((path) => (
            <div key={path}>
              <span>⌘</span>
              <code>{path}</code>
              <small>{copy.evidence.owned}</small>
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}
