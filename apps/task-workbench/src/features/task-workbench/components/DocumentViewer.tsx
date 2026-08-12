import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { copy } from "../copy";
import { displayMarkdown } from "../document-markdown";
import type { WorkbenchDocument } from "../model";
import { loadDocument } from "../services/task-workbench-api";

export function DocumentViewer({
  document,
  onClose,
}: {
  readonly document: WorkbenchDocument | null;
  readonly onClose: () => void;
}) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (document === null) return () => undefined;
    let current = true;
    setContent("");
    setError("");
    setLoading(true);
    void loadDocument(document)
      .then((value) => {
        if (current) setContent(value);
      })
      .catch((reason: unknown) => {
        if (current) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [document]);

  if (document === null) return null;
  return (
    <div className="document-modal-backdrop" role="presentation">
      <section aria-modal="true" className="document-modal" role="dialog">
        <header>
          <div>
            <strong>{document.label}</strong>
            <code>{document.path}</code>
          </div>
          <div>
            <a href={document.obsidianUrl}>{copy.documents.openInObsidian}</a>
            <button aria-label={copy.documents.close} onClick={onClose}>
              ×
            </button>
          </div>
        </header>
        <article className="markdown-document">
          {loading ? <p className="document-state">{copy.documents.loading}</p> : null}
          {error === "" ? null : (
            <p className="document-state error">{copy.documents.failed(error)}</p>
          )}
          {content === "" ? null : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayMarkdown(content)}</ReactMarkdown>
          )}
        </article>
      </section>
    </div>
  );
}
