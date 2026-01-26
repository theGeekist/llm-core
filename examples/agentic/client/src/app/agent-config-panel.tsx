"use client";

import type { FC, ChangeEvent, MouseEvent, ReactNode } from "react";
import type { OptionItem, SelectOption } from "../demo-options";
import type { AgentConfigDraft } from "./types";
import { readListFromInput } from "./agent-config";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { Toggle } from "../components/ui/toggle";
import { cn } from "../lib/utils";

type AgentConfigPanelProps = {
  showConfig: boolean;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => boolean;
  profileOptions: SelectOption[];
  approvalOptions: SelectOption[];
  toolPresetOptions: SelectOption[];
  skillPresetOptions: SelectOption[];
  mcpPresetOptions: SelectOption[];
  toolOptions: OptionItem[];
  skillOptions: OptionItem[];
  mcpStatus: { value: Record<string, unknown> | null; error: string | null };
  draft: AgentConfigDraft;
  onToolPresetChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onSkillPresetChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onMcpPresetChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onAgentToolsToggle: (entry: string) => (event: ChangeEvent<HTMLInputElement>) => boolean;
  onToolAllowlistToggle: (entry: string) => (event: ChangeEvent<HTMLInputElement>) => boolean;
  onSkillDirectoryToggle: (entry: string) => (event: ChangeEvent<HTMLInputElement>) => boolean;
  onProfileChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onAgentIdChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAgentNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAgentDescriptionChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onAgentPromptChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onAgentToolsChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onToolAllowlistChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onToolDenylistChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onSkillDirectoriesChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onSkillDisabledChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onMcpServersChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onApprovalsPolicyChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onApprovalsCacheChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onSubagentsEnabledChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubagentsMaxActiveChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubagentsIdPrefixChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onContextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onOutputFormatChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onThreadIdChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onReset: (event: MouseEvent<HTMLButtonElement>) => boolean;
};

const CACHE_OPTIONS: SelectOption[] = [
  { value: "", label: "No cache" },
  { value: "session", label: "Session cache" },
];

export const AgentConfigPanel: FC<AgentConfigPanelProps> = ({
  showConfig,
  onToggle,
  profileOptions,
  approvalOptions,
  toolPresetOptions,
  skillPresetOptions,
  mcpPresetOptions,
  toolOptions,
  skillOptions,
  mcpStatus,
  draft,
  onToolPresetChange,
  onSkillPresetChange,
  onMcpPresetChange,
  onAgentToolsToggle,
  onToolAllowlistToggle,
  onSkillDirectoryToggle,
  onProfileChange,
  onAgentIdChange,
  onAgentNameChange,
  onAgentDescriptionChange,
  onAgentPromptChange,
  onAgentToolsChange,
  onToolAllowlistChange,
  onToolDenylistChange,
  onSkillDirectoriesChange,
  onSkillDisabledChange,
  onMcpServersChange,
  onApprovalsPolicyChange,
  onApprovalsCacheChange,
  onSubagentsEnabledChange,
  onSubagentsMaxActiveChange,
  onSubagentsIdPrefixChange,
  onContextChange,
  onOutputFormatChange,
  onThreadIdChange,
  onReset,
}) => {
  return (
    <section className="ks-panel px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Agent configuration
          </div>
          <p className="text-sm text-muted-foreground">
            Control the agent loop contract without hand-wiring packs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggle}
            aria-expanded={showConfig}
            aria-controls="agent-config-controls"
          >
            {showConfig ? "Hide" : "Show"} config
          </Button>
        </div>
      </div>
      {showConfig ? (
        <div id="agent-config-controls" className="mt-5 flex flex-col gap-6">
          <Section
            title="Agent profile"
            description="Use a preset prompt and name to seed the loop."
          >
            <SelectRow
              id="profile"
              label="Profile"
              value={draft.profileId}
              onChange={onProfileChange}
              options={profileOptions}
            />
            <TextRow
              id="agent-id"
              label="Agent id"
              value={draft.agentId}
              onChange={onAgentIdChange}
            />
            <TextRow
              id="agent-name"
              label="Agent name"
              value={draft.agentName}
              onChange={onAgentNameChange}
            />
            <TextAreaRow
              id="agent-description"
              label="Agent description"
              value={draft.agentDescription}
              onChange={onAgentDescriptionChange}
              rows={2}
            />
            <TextAreaRow
              id="agent-prompt"
              label="Agent prompt"
              value={draft.agentPrompt}
              onChange={onAgentPromptChange}
              rows={4}
            />
            <TextAreaRow
              id="agent-tools"
              label="Agent tools"
              value={draft.agentTools}
              onChange={onAgentToolsChange}
              helper="Overrides tool routing for this agent only."
              rows={2}
            />
          </Section>
          <Section title="Tooling" description="Global allowlists and denylists for tools.">
            <SelectRow
              id="tool-preset"
              label="Tool preset"
              value={draft.toolPresetId}
              onChange={onToolPresetChange}
              options={toolPresetOptions}
            />
            <OptionToggleList
              label="Agent tools"
              helper="Choose which tools are exposed to the selected agent."
              options={toolOptions}
              value={draft.agentTools}
              onToggle={onAgentToolsToggle}
            />
            <OptionToggleList
              label="Allowlisted tools"
              helper="Apply a global tool allowlist."
              options={toolOptions}
              value={draft.toolAllowlist}
              onToggle={onToolAllowlistToggle}
            />
            <TextAreaRow
              id="tool-allowlist"
              label="Custom allowlist"
              value={draft.toolAllowlist}
              onChange={onToolAllowlistChange}
              helper="Use to add custom tool ids."
              rows={2}
            />
            <TextAreaRow
              id="tool-denylist"
              label="Tool denylist"
              value={draft.toolDenylist}
              onChange={onToolDenylistChange}
              helper="Explicit blocks even if allowlisted."
              rows={2}
            />
          </Section>
          <Section title="Skills" description="Load skills and block them deterministically.">
            <SelectRow
              id="skill-preset"
              label="Skill preset"
              value={draft.skillPresetId}
              onChange={onSkillPresetChange}
              options={skillPresetOptions}
            />
            <OptionToggleList
              label="Skill directories"
              helper="Select skill roots to load."
              options={skillOptions}
              value={draft.skillDirectories}
              onToggle={onSkillDirectoryToggle}
            />
            <TextAreaRow
              id="skill-directories"
              label="Custom skill directories"
              value={draft.skillDirectories}
              onChange={onSkillDirectoriesChange}
              helper="Add additional skill roots."
              rows={2}
            />
            <TextAreaRow
              id="skill-disabled"
              label="Disabled skills"
              value={draft.skillDisabled}
              onChange={onSkillDisabledChange}
              helper="One skill id per line."
              rows={2}
            />
          </Section>
          <Section
            title="MCP servers"
            description="Configure external tool servers to expose tools."
          >
            <SelectRow
              id="mcp-preset"
              label="MCP preset"
              value={draft.mcpPresetId}
              onChange={onMcpPresetChange}
              options={mcpPresetOptions}
            />
            <TextAreaRow
              id="mcp-servers"
              label="MCP servers JSON"
              value={draft.mcpServersJson}
              onChange={onMcpServersChange}
              helper="Leave empty if you are not using MCP."
              rows={4}
            />
            {mcpStatus.error ? (
              <p className="text-xs font-semibold text-destructive">{mcpStatus.error}</p>
            ) : null}
          </Section>
          <Section title="Approvals" description="Define when tools pause for approval.">
            <SelectRow
              id="approvals-policy"
              label="Policy"
              value={draft.approvalsPolicy}
              onChange={onApprovalsPolicyChange}
              options={approvalOptions}
            />
            <SelectRow
              id="approvals-cache"
              label="Cache scope"
              value={draft.approvalsCache}
              onChange={onApprovalsCacheChange}
              options={CACHE_OPTIONS}
            />
          </Section>
          <Section title="Sub-agents" description="Spawn specialists and route tasks to them.">
            <ToggleRow
              id="subagents-enabled"
              label="Enable sub-agents"
              checked={draft.subagentsEnabled}
              onChange={onSubagentsEnabledChange}
            />
            <TextRow
              id="subagents-max"
              label="Max active"
              value={draft.subagentsMaxActive}
              onChange={onSubagentsMaxActiveChange}
            />
            <TextRow
              id="subagents-prefix"
              label="Id prefix"
              value={draft.subagentsIdPrefix}
              onChange={onSubagentsIdPrefixChange}
            />
          </Section>
          <Section title="Prompts + outputs" description="System context and output contracts.">
            <TextAreaRow
              id="system-context"
              label="System context"
              value={draft.context}
              onChange={onContextChange}
              helper="Extra grounding for this run."
              rows={3}
            />
            <TextAreaRow
              id="output-format"
              label="Output format"
              value={draft.outputFormat}
              onChange={onOutputFormatChange}
              helper="Add structured output instructions."
              rows={3}
            />
          </Section>
          <Section title="State" description="Persist a thread id for resume and traceability.">
            <TextRow
              id="thread-id"
              label="Thread id"
              value={draft.threadId}
              onChange={onThreadIdChange}
              helper="Leave empty to use the chat id."
            />
          </Section>
        </div>
      ) : null}
    </section>
  );
};

type SectionProps = {
  title: string;
  description: string;
  children: ReactNode;
};

const Section: FC<SectionProps> = ({ title, description, children }) => {
  return (
    <div className="agentic-section">
      <div className="agentic-section-header">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="agentic-section-body">{children}</div>
    </div>
  );
};

type RowProps = {
  label: string;
  htmlFor?: string;
  helper?: string;
  wide?: boolean;
  children: ReactNode;
};

const Row: FC<RowProps> = ({ label, htmlFor, helper, wide, children }) => {
  return (
    <div className={cn("agentic-row", wide && "agentic-row--wide") as string}>
      <div className="agentic-row-label">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="agentic-label">
            {label}
          </label>
        ) : (
          <div className="agentic-label">{label}</div>
        )}
      </div>

      <div className="agentic-row-body">
        <div className={cn("agentic-row-control", wide && "agentic-row-control--wide") as string}>
          {children}
        </div>
        {helper ? <div className="agentic-helper">{helper}</div> : null}
      </div>
    </div>
  );
};

type TextRowProps = {
  id: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  helper?: string;
};

const TextRow: FC<TextRowProps> = ({ id, label, value, onChange, helper }) => {
  return (
    <Row label={label} htmlFor={id} helper={helper}>
      <input id={id} value={value} onChange={onChange} className="agentic-input" />
    </Row>
  );
};

type TextAreaRowProps = {
  id: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  helper?: string;
  rows: number;
};

const TextAreaRow: FC<TextAreaRowProps> = ({ id, label, value, onChange, helper, rows }) => {
  const wide = rows >= 3;
  return (
    <Row label={label} htmlFor={id} helper={helper} wide={wide}>
      <textarea
        id={id}
        value={value}
        onChange={onChange}
        rows={rows}
        className={cn("agentic-input agentic-textarea", rows > 3 && "min-h-[120px]") as string}
      />
    </Row>
  );
};

type SelectRowProps = {
  id: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: SelectOption[];
  helper?: string;
  suffix?: string;
};

const SelectRow: FC<SelectRowProps> = ({ id, label, value, onChange, options, helper, suffix }) => {
  return (
    <Row label={label} htmlFor={id} helper={helper}>
      <Select id={id} value={value} onChange={onChange} options={options} suffix={suffix} />
    </Row>
  );
};

type ToggleRowProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  helper?: string;
  suffix?: string;
};

const ToggleRow: FC<ToggleRowProps> = ({ id, label, checked, onChange, helper, suffix }) => {
  return (
    <Row label={label} htmlFor={id} helper={helper}>
      <Toggle
        id={id}
        checked={checked}
        onChange={onChange}
        suffix={suffix ?? (checked ? "Enabled" : "Disabled")}
      />
    </Row>
  );
};

type OptionToggleListProps = {
  label: string;
  helper: string;
  options: OptionItem[];
  value: string;
  onToggle: (entry: string) => (event: ChangeEvent<HTMLInputElement>) => boolean;
};

type OptionToggleEntry = {
  option: OptionItem;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => boolean;
};

const buildOptionToggleEntries = (
  options: OptionItem[],
  value: string,
  onToggle: OptionToggleListProps["onToggle"],
): OptionToggleEntry[] => {
  const selected = readListFromInput(value);
  return options.map((option) => ({
    option,
    checked: selected.includes(option.id),
    onChange: onToggle(option.id),
  }));
};

const OptionToggleList: FC<OptionToggleListProps> = ({
  label,
  helper,
  options,
  value,
  onToggle,
}) => {
  const entries = buildOptionToggleEntries(options, value, onToggle);

  return (
    <Row label={label} helper={helper} wide>
      <div className="agentic-option-grid">{entries.map(renderOptionToggle)}</div>
    </Row>
  );
};

const renderOptionToggle = (entry: OptionToggleEntry) => (
  <label key={entry.option.id} className="agentic-option-card">
    <input type="checkbox" checked={entry.checked} onChange={entry.onChange} />
    <div>
      <div className="agentic-option-title">{entry.option.label}</div>
      <div className="agentic-option-description">{entry.option.description}</div>
    </div>
  </label>
);
