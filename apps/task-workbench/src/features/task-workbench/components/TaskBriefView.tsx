import { copy } from "../copy";
import type { TaskBrief } from "../model";

const BriefList = ({ items }: { readonly items: readonly string[] }) =>
  items.length === 0 ? null : (
    <ul className="task-brief-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );

export function TaskBriefView({
  brief,
  error,
  loading,
  variant,
}: {
  readonly brief: TaskBrief | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly variant: "compact" | "full";
}) {
  if (loading) return <p className="task-brief-state">{copy.taskBrief.loading}</p>;
  if (error !== null) {
    return (
      <p className="task-brief-state error" role="alert">
        {copy.taskBrief.failed}: {error}
      </p>
    );
  }
  if (brief === null || brief.objective === "") {
    return <p className="task-brief-state">{copy.taskBrief.unavailable}</p>;
  }

  if (variant === "compact") {
    return (
      <section className="task-overview">
        <h2>{copy.taskBrief.objective}</h2>
        <p>{brief.objective}</p>
        {brief.why === "" ? null : (
          <details>
            <summary>{copy.taskBrief.why}</summary>
            <p>{brief.why}</p>
          </details>
        )}
      </section>
    );
  }

  return (
    <div className="task-brief-full">
      <section className="task-brief-lede">
        <div>
          <h3>{copy.taskBrief.objective}</h3>
          <p>{brief.objective}</p>
        </div>
        {brief.why === "" ? null : (
          <div>
            <h3>{copy.taskBrief.why}</h3>
            <p>{brief.why}</p>
          </div>
        )}
      </section>
      <section className="task-brief-columns">
        <div>
          <h3>{copy.taskBrief.acceptance}</h3>
          <BriefList items={brief.acceptanceCriteria} />
        </div>
        <div>
          <h3>{copy.taskBrief.scope}</h3>
          <BriefList items={brief.inScope} />
        </div>
        <div>
          <h3>{copy.taskBrief.outOfScope}</h3>
          <BriefList items={brief.outOfScope} />
        </div>
      </section>
      <section className="task-brief-progress">
        <div>
          <h3>{copy.taskBrief.workLog}</h3>
          <p>{brief.workLog || copy.taskBrief.unavailable}</p>
        </div>
        <div>
          <h3>{copy.taskBrief.verification}</h3>
          <BriefList items={brief.verification} />
        </div>
      </section>
    </div>
  );
}
