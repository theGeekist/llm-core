---
name: Architect Workbench
version: 0.1.0
appearance: dark
tokens:
  colour:
    background: "#0b0d10"
    surface: "#11151a"
    border: "#27303a"
    text: "#d8dee7"
    muted: "#8793a1"
    ready: "#45b97c"
    active: "#5b9cf6"
    blocked: "#d49a43"
    invalid: "#e05b65"
  typography:
    ui: "Inter, system-ui, sans-serif"
    mono: "SFMono-Regular, Consolas, monospace"
  spacing:
    unit: 4
  shape:
    radius: 4
---

# Architect Workbench design grammar

## Intent

The interface is an engineering instrument for inspecting project state, authority, dependency and evidence. Density is useful when it preserves comparison and provenance. The project is the central object. Chat is not part of this surface.

## Semantic colour

- Green means ready or admitted.
- Blue means active work or a navigable reference.
- Amber means blocked, uncertain or awaiting admission. It is not generic emphasis.
- Red is reserved for invalid evidence, failed invariants and destructive consequences.
- State must remain understandable without colour.

## Components

- Task nodes are compact rectangles, never decorative cards.
- Dependencies have visible direction.
- Blockers and evidence are prose-bearing facts, not counters.
- Paths, task keys, revisions and commands use monospace typography.
- The selected task must remain visually identifiable in the task rail, graph and inspector.
- Pane boundaries are 4px keyboard-accessible separators with a 1px rule. Hover, focus and drag use active blue. Double-click restores the default split.
- Structured remediation uses a compact five-stage rail: explain, configure, preview, execute and receipt.
- Execution controls remain visually subordinate until an exact preview has been admitted. The admitted mutation uses success green.
- Receipts use literal identities, digests, paths and validation results rather than success decoration.

## Do

- Preserve exact task identifiers, revisions, authorities and reason text.
- Expose why a task is ready or blocked.
- Prefer filtered graph projections around the selected task.
- Keep raw governed context one action away.

## Do not

- Add decorative analytics, gradients, floating AI controls or conversational chrome.
- Collapse tasks, claims, evidence and projections into one generic card grammar.
- imply that a derived projection is project authority.
- Hide unknown, stale or unavailable state.
