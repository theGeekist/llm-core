**Lifecycle artifacts:** planning documents, story files, specs, validation
reports, and code. Git supplies version history when teams commit them.

**Workflow progress:** sharded workflows commonly persist `stepsCompleted` in
document frontmatter. Sprint work uses `sprint-status.yaml`. Quick Dev and Dev
Auto use spec frontmatter and append-only logs.

**Dev Auto state:** `draft`, `ready-for-dev`, `in-progress`, `in-review`, `done`,
and `blocked` route resumption. Baseline/final revisions bind an out-of-tree spec
to produced commits. A triage log and spec change log preserve repair history.
This is a compact machine-readable contract suitable for an external
orchestrator to poll
([`dev-auto.md`, line 89](../repos/bmad-method/docs/reference/dev-auto.md#L89)).

**Working memory:** `memlog.py` maintains a flat, append-only chronological file.
It records decisions, ideas, questions, and events, not a transcript. Writes use
temp-file, flush, `fsync`, and atomic replacement; a fresh session reads the log
on resume
([`memlog.py`, line 5](../repos/bmad-method/src/scripts/memlog.py#L5)).
