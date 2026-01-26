import type { ChangeEvent, Dispatch, MouseEvent, SetStateAction } from "react";
import {
  readAgentProfile,
  type AgentProfile,
  type McpPresetId,
  type SkillPresetId,
  type ToolPresetId,
} from "../demo-options";
import { bindFirst } from "@geekist/llm-core";
import type { AgentConfigDraft, TransportData } from "./types";
import {
  applyMcpPreset,
  applySkillPreset,
  applyToolPreset,
  applyTransportDraftUpdate,
  buildAgentDraft,
  toggleListInputValue,
} from "./agent-config";

type DraftTextField =
  | "toolPresetId"
  | "skillPresetId"
  | "mcpPresetId"
  | "agentId"
  | "agentName"
  | "agentDescription"
  | "agentPrompt"
  | "agentTools"
  | "toolAllowlist"
  | "toolDenylist"
  | "skillDirectories"
  | "skillDisabled"
  | "mcpServersJson"
  | "approvalsPolicy"
  | "approvalsCache"
  | "subagentsMaxActive"
  | "subagentsIdPrefix"
  | "context"
  | "outputFormat"
  | "threadId";

type DraftBooleanField = "subagentsEnabled";

type DraftInput = {
  draft: AgentConfigDraft;
  setDraft: Dispatch<SetStateAction<AgentConfigDraft>>;
  transportData: TransportData;
};

const updateDraft = (draft: AgentConfigDraft, field: DraftTextField, value: string) => ({
  ...draft,
  [field]: value,
});

const updateDraftBoolean = (draft: AgentConfigDraft, field: DraftBooleanField, value: boolean) => ({
  ...draft,
  [field]: value,
});

const applyDraftTextChange = (
  input: DraftInput & { field: DraftTextField },
  event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
) => {
  const next = applyPresetOverride(
    updateDraft(input.draft, input.field, event.currentTarget.value),
    input.field,
  );
  input.setDraft(next);
  applyTransportDraftUpdate(input.transportData, next);
  return true;
};

export const bindDraftTextChange = (input: {
  field: DraftTextField;
  draft: AgentConfigDraft;
  setDraft: Dispatch<SetStateAction<AgentConfigDraft>>;
  transportData: TransportData;
}) => bindFirst(applyDraftTextChange, input);

const applyDraftBooleanChange = (
  input: DraftInput & { field: DraftBooleanField },
  event: ChangeEvent<HTMLInputElement>,
) => {
  const next = updateDraftBoolean(input.draft, input.field, event.currentTarget.checked);
  input.setDraft(next);
  applyTransportDraftUpdate(input.transportData, next);
  return true;
};

export const bindDraftBooleanChange = (input: {
  field: DraftBooleanField;
  draft: AgentConfigDraft;
  setDraft: Dispatch<SetStateAction<AgentConfigDraft>>;
  transportData: TransportData;
}) => bindFirst(applyDraftBooleanChange, input);

type DraftPresetField = "toolPresetId" | "skillPresetId" | "mcpPresetId";

const readPresetKind = (field: DraftTextField): DraftPresetField | null => {
  if (field === "toolAllowlist" || field === "toolDenylist" || field === "agentTools") {
    return "toolPresetId";
  }
  if (field === "skillDirectories" || field === "skillDisabled") {
    return "skillPresetId";
  }
  if (field === "mcpServersJson") {
    return "mcpPresetId";
  }
  return null;
};

const applyPresetOverride = (draft: AgentConfigDraft, field: DraftTextField) => {
  const presetField = readPresetKind(field);
  if (!presetField) {
    return draft;
  }
  return updateDraft(draft, presetField, "custom");
};

const applyToolPresetChange = (input: DraftInput, event: ChangeEvent<HTMLSelectElement>) => {
  const next = applyToolPreset(input.draft, event.currentTarget.value as ToolPresetId);
  input.setDraft(next);
  applyTransportDraftUpdate(input.transportData, next);
  return true;
};

export const bindToolPresetChange = (input: DraftInput) => bindFirst(applyToolPresetChange, input);

const applySkillPresetChange = (input: DraftInput, event: ChangeEvent<HTMLSelectElement>) => {
  const next = applySkillPreset(input.draft, event.currentTarget.value as SkillPresetId);
  input.setDraft(next);
  applyTransportDraftUpdate(input.transportData, next);
  return true;
};

export const bindSkillPresetChange = (input: DraftInput) =>
  bindFirst(applySkillPresetChange, input);

const applyMcpPresetChange = (input: DraftInput, event: ChangeEvent<HTMLSelectElement>) => {
  const next = applyMcpPreset(input.draft, event.currentTarget.value as McpPresetId);
  input.setDraft(next);
  applyTransportDraftUpdate(input.transportData, next);
  return true;
};

export const bindMcpPresetChange = (input: DraftInput) => bindFirst(applyMcpPresetChange, input);

const applyDraftListToggle = (
  input: DraftInput & { field: "agentTools" | "toolAllowlist" | "skillDirectories" },
  entry: string,
  _event: ChangeEvent<HTMLInputElement>,
) => {
  const next = applyPresetOverride(
    updateDraft(input.draft, input.field, toggleListInputValue(input.draft[input.field], entry)),
    input.field,
  );
  input.setDraft(next);
  applyTransportDraftUpdate(input.transportData, next);
  return true;
};

export const bindDraftListToggle = (input: {
  field: "agentTools" | "toolAllowlist" | "skillDirectories";
  draft: AgentConfigDraft;
  setDraft: Dispatch<SetStateAction<AgentConfigDraft>>;
  transportData: TransportData;
  entry: string;
}) => bindFirst(bindFirst(applyDraftListToggle, input), input.entry);

const applyProfileChange = (input: DraftInput, event: ChangeEvent<HTMLSelectElement>) => {
  const profile = readAgentProfile(event.currentTarget.value);
  const next: AgentConfigDraft = {
    ...input.draft,
    profileId: profile.id,
    agentName: profile.label,
    agentDescription: profile.description,
    agentPrompt: profile.prompt,
  };
  input.setDraft(next);
  applyTransportDraftUpdate(input.transportData, next);
  return true;
};

export const bindProfileChange = (input: DraftInput) => bindFirst(applyProfileChange, input);

const applyDraftReset = (
  input: {
    profile: AgentProfile;
    setDraft: Dispatch<SetStateAction<AgentConfigDraft>>;
    transportData: TransportData;
  },
  _event: MouseEvent<HTMLButtonElement>,
) => {
  const next = buildAgentDraft(input.profile);
  input.setDraft(next);
  applyTransportDraftUpdate(input.transportData, next);
  return true;
};

export const bindDraftReset = (input: {
  profile: AgentProfile;
  setDraft: Dispatch<SetStateAction<AgentConfigDraft>>;
  transportData: TransportData;
}) => bindFirst(applyDraftReset, input);

const toggleBoolean = (value: boolean) => !value;

const applyToggle = (
  setter: Dispatch<SetStateAction<boolean>>,
  _event: MouseEvent<HTMLButtonElement>,
) => {
  setter(toggleBoolean);
  return true;
};

export const bindToggle = (setter: Dispatch<SetStateAction<boolean>>) =>
  bindFirst(applyToggle, setter);

export type ConfigBindingInput = {
  draft: AgentConfigDraft;
  setDraft: Dispatch<SetStateAction<AgentConfigDraft>>;
  setShowConfig: Dispatch<SetStateAction<boolean>>;
  setShowEvents: Dispatch<SetStateAction<boolean>>;
  transportData: TransportData;
  profile: AgentProfile;
};

export type ConfigBindings = {
  onToggleConfig: (event: MouseEvent<HTMLButtonElement>) => boolean;
  onToggleEvents: (event: MouseEvent<HTMLButtonElement>) => boolean;
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
  onResetConfig: (event: MouseEvent<HTMLButtonElement>) => boolean;
};

export const readConfigBindings = (input: ConfigBindingInput): ConfigBindings => ({
  onToggleConfig: bindToggle(input.setShowConfig),
  onToggleEvents: bindToggle(input.setShowEvents),
  onToolPresetChange: bindToolPresetChange({
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onSkillPresetChange: bindSkillPresetChange({
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onMcpPresetChange: bindMcpPresetChange({
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onAgentToolsToggle: (entry: string) =>
    bindDraftListToggle({
      field: "agentTools",
      entry,
      draft: input.draft,
      setDraft: input.setDraft,
      transportData: input.transportData,
    }),
  onToolAllowlistToggle: (entry: string) =>
    bindDraftListToggle({
      field: "toolAllowlist",
      entry,
      draft: input.draft,
      setDraft: input.setDraft,
      transportData: input.transportData,
    }),
  onSkillDirectoryToggle: (entry: string) =>
    bindDraftListToggle({
      field: "skillDirectories",
      entry,
      draft: input.draft,
      setDraft: input.setDraft,
      transportData: input.transportData,
    }),
  onProfileChange: bindProfileChange({
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onAgentIdChange: bindDraftTextChange({
    field: "agentId",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onAgentNameChange: bindDraftTextChange({
    field: "agentName",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onAgentDescriptionChange: bindDraftTextChange({
    field: "agentDescription",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onAgentPromptChange: bindDraftTextChange({
    field: "agentPrompt",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onAgentToolsChange: bindDraftTextChange({
    field: "agentTools",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onToolAllowlistChange: bindDraftTextChange({
    field: "toolAllowlist",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onToolDenylistChange: bindDraftTextChange({
    field: "toolDenylist",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onSkillDirectoriesChange: bindDraftTextChange({
    field: "skillDirectories",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onSkillDisabledChange: bindDraftTextChange({
    field: "skillDisabled",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onMcpServersChange: bindDraftTextChange({
    field: "mcpServersJson",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onApprovalsPolicyChange: bindDraftTextChange({
    field: "approvalsPolicy",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onApprovalsCacheChange: bindDraftTextChange({
    field: "approvalsCache",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onSubagentsEnabledChange: bindDraftBooleanChange({
    field: "subagentsEnabled",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onSubagentsMaxActiveChange: bindDraftTextChange({
    field: "subagentsMaxActive",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onSubagentsIdPrefixChange: bindDraftTextChange({
    field: "subagentsIdPrefix",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onContextChange: bindDraftTextChange({
    field: "context",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onOutputFormatChange: bindDraftTextChange({
    field: "outputFormat",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onThreadIdChange: bindDraftTextChange({
    field: "threadId",
    draft: input.draft,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
  onResetConfig: bindDraftReset({
    profile: input.profile,
    setDraft: input.setDraft,
    transportData: input.transportData,
  }),
});
