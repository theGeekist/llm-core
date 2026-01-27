"use client";

import type { ChangeEvent, FC, ReactNode } from "react";
import type { AdapterSource, AgentProfile, SelectOption } from "../demo-options";
import type { AgentConfigDraft } from "./types";
import { readListFromInput, readMcpJsonStatus } from "./agent-config";
import { Select } from "../components/ui/select";
import { Toggle } from "../components/ui/toggle";

type AgentNarrativeProps = {
  adapterSource: AdapterSource;
  providerLabel: string;
  modelLabel: string;
  draft: AgentConfigDraft;
  profile: AgentProfile;
  toolPresetOptions: SelectOption[];
  skillPresetOptions: SelectOption[];
  mcpPresetOptions: SelectOption[];
  approvalOptions: SelectOption[];
  onToolPresetChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onSkillPresetChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onMcpPresetChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onApprovalsPolicyChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onSubagentsEnabledChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export const AgentNarrative: FC<AgentNarrativeProps> = ({
  adapterSource,
  providerLabel,
  modelLabel,
  draft,
  profile,
  toolPresetOptions,
  skillPresetOptions,
  mcpPresetOptions,
  approvalOptions,
  onToolPresetChange,
  onSkillPresetChange,
  onMcpPresetChange,
  onApprovalsPolicyChange,
  onSubagentsEnabledChange,
}) => {
  const toolsCount = readListFromInput(draft.toolAllowlist).length;
  const skillsCount = readListFromInput(draft.skillDirectories).length;
  const mcpStatus = readMcpJsonStatus(draft.mcpServersJson);
  const mcpCount = mcpStatus.value ? Object.keys(mcpStatus.value).length : 0;

  const items = buildItems({
    toolsCount,
    skillsCount,
    mcpCount,
    draft,
    toolPresetOptions,
    skillPresetOptions,
    mcpPresetOptions,
    approvalOptions,
    onToolPresetChange,
    onSkillPresetChange,
    onMcpPresetChange,
    onApprovalsPolicyChange,
    onSubagentsEnabledChange,
  });

  return (
    <section className="ks-panel px-5 py-5">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Agent loop profile
      </div>

      <div className="ks-panel-grid">
        <div>
          <h3 className="text-base font-semibold">{profile.label}</h3>
          <p className="text-sm text-muted-foreground">{profile.description}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>{adapterSource}</span>
            <span>{providerLabel}</span>
            <span>{modelLabel}</span>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Config summary
          </div>
          <p className="text-xs text-muted-foreground">
            Deterministic ordering applied across tools, skills, and approvals.
          </p>

          <ul className="agentic-config">
            {items.map((item) => (
              <li key={item.label} className="agentic-config-pill">
                <span className="agentic-config-label">{item.label}</span>
                {item.content}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

type Item = {
  label: string;
  content: ReactNode;
};

type ItemsInput = {
  toolsCount: number;
  skillsCount: number;
  mcpCount: number;
  draft: AgentConfigDraft;
  toolPresetOptions: SelectOption[];
  skillPresetOptions: SelectOption[];
  mcpPresetOptions: SelectOption[];
  approvalOptions: SelectOption[];
  onToolPresetChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onSkillPresetChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onMcpPresetChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onApprovalsPolicyChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onSubagentsEnabledChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

const buildItems = (input: ItemsInput): Item[] => [
  {
    label: "Tools",
    content: (
      <Select
        id="tools"
        value={input.draft.toolPresetId}
        options={input.toolPresetOptions}
        suffix={`${input.toolsCount} allowlisted`}
        onChange={input.onToolPresetChange}
      />
    ),
  },
  {
    label: "Skills",
    content: (
      <Select
        id="skills"
        value={input.draft.skillPresetId}
        options={input.skillPresetOptions}
        suffix={`${input.skillsCount} directories`}
        onChange={input.onSkillPresetChange}
      />
    ),
  },
  {
    label: "MCP",
    content: (
      <Select
        id="mcp"
        value={input.draft.mcpPresetId}
        options={input.mcpPresetOptions}
        suffix={`${input.mcpCount} servers`}
        onChange={input.onMcpPresetChange}
      />
    ),
  },
  {
    label: "Approvals",
    content: (
      <Select
        id="approvals"
        value={input.draft.approvalsPolicy}
        options={input.approvalOptions}
        suffix="Policy"
        onChange={input.onApprovalsPolicyChange}
      />
    ),
  },
  {
    label: "Subagents",
    content: (
      <Toggle
        id="subagents"
        checked={input.draft.subagentsEnabled}
        suffix={input.draft.subagentsEnabled ? "Enabled" : "Disabled"}
        onChange={input.onSubagentsEnabledChange}
      />
    ),
  },
];
