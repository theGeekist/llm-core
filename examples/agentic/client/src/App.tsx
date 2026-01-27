/// <reference lib="dom" />
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChat } from "@ai-sdk/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import {
  useMemo,
  useState,
  type FC,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createAiSdkWebSocketChatTransport } from "@geekist/llm-core/adapters";
import "./styles.css";
import { Thread } from "./components/assistant-ui/thread";
import {
  SOURCE_SELECT_OPTIONS,
  PROVIDERS,
  readAvailableModels,
  readAvailableProviders,
  readProviderOption,
  readAgentProfile,
  PROFILE_SELECT_OPTIONS,
  APPROVAL_SELECT_OPTIONS,
  TOOL_PRESET_OPTIONS,
  SKILL_PRESET_OPTIONS,
  MCP_PRESET_OPTIONS,
  TOOL_OPTIONS,
  SKILL_DIRECTORY_OPTIONS,
  type AdapterSource,
  type ProviderId,
} from "./demo-options";
import { readAllProviderTokens, readProviderToken } from "./token-store";
import { AgentNarrative } from "./app/agent-narrative";
import { AdvancedPanel } from "./app/advanced-panel";
import { OutcomeBanner } from "./app/outcome-banner";
import { ProviderConnectDialog } from "./app/connect-dialog";
import { AgentConfigPanel } from "./app/agent-config-panel";
import { Footer, TopBar } from "./app/layout";
import { readConfigBindings } from "./app/config-bindings";
import {
  bindConnectOpenChange,
  bindHandleTransportEvent,
  bindModelChange,
  bindModelIdChange,
  bindProviderChange,
  bindSourceChange,
  bindSaveToken,
  bindTokenChange,
  bindClearToken,
} from "./app/transport-helpers";
import { applyTransportDraftUpdate, buildAgentDraft, readMcpJsonStatus } from "./app/agent-config";
import type { AgentConfigDraft, OutcomeSummary, TransportData } from "./app/types";
import { bindFirst } from "@geekist/llm-core";
import type { TransportEvent } from "@geekist/llm-core/adapters/ai-sdk-ui";
import { ModelControls } from "@examples/components/model-controls";
import { useModelCatalog, useModelSelection } from "@examples/components/model-catalog";

const DEFAULT_PROFILE = readAgentProfile("generalist");
const DEFAULT_DRAFT = buildAgentDraft(DEFAULT_PROFILE);

const transportData: TransportData = {
  adapterSource: "ai-sdk",
  providerId: "openai",
  modelId: "gpt-4o-mini",
};

applyTransportDraftUpdate(transportData, DEFAULT_DRAFT);

const readProviderId = (provider: { id: ProviderId }) => provider.id;
const readAuthTokens = () => readAllProviderTokens(PROVIDERS.map(readProviderId));
const readTransportData = () => {
  const { modelId, ...rest } = transportData;
  if (modelId) {
    return { ...rest, modelId };
  }
  return rest;
};

export function App() {
  const [adapterSource, setAdapterSource] = useState<AdapterSource>("ai-sdk");
  const [providerId, setProviderId] = useState<ProviderId>("openai");
  const [modelId, setModelId] = useState<string | null>("gpt-4o-mini");
  const [draft, setDraft] = useState<AgentConfigDraft>(DEFAULT_DRAFT);
  const [events, setEvents] = useState<TransportEvent[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<OutcomeSummary | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");

  const transport = useMemo(
    bindFirst(buildTransportMemo, {
      setEvents,
      setOutcome: setLastOutcome,
    }),
    [],
  );

  const chat = useChat({ transport });
  const runtime = useChatRuntime(chat);

  const provider = readProviderOption(providerId);
  const availableProviders = readAvailableProviders(adapterSource);
  const token = readProviderToken(providerId);
  const hasToken = !!token;
  const canSend = readCanSend({ hasToken, requiresToken: provider.requiresToken });
  const profile = readAgentProfile(draft.profileId);
  const mcpStatus = readMcpJsonStatus(draft.mcpServersJson);
  const fallbackModels = readAvailableModels(adapterSource, providerId);
  const modelCatalog = useModelCatalog({
    providerId,
    token,
    fallbackModels,
    fallbackKey: readModelFallbackKey(adapterSource, providerId),
  });
  const availableModels = modelCatalog.models;
  useModelSelection({
    modelId,
    models: availableModels,
    setModelId,
    onModelIdChange: bindModelIdChange({
      transportData,
      adapterSource,
      providerId,
      setModelId,
    }),
  });

  const bindings = readConfigBindings({
    draft,
    setDraft,
    setShowConfig,
    setShowEvents,
    transportData,
    profile,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="ks-app">
        <TopBar
          connect={{
            providerLabel: provider.label,
            hasToken,
            requiresToken: provider.requiresToken,
            onOpen: bindOpenConnectDialog(setConnectOpen),
          }}
        />
        <HeaderBar
          adapterSource={adapterSource}
          providerId={providerId}
          modelId={modelId}
          availableProviders={availableProviders}
          availableModels={availableModels}
          providerHelper={readProviderHelper({ providerId })}
          sourceOptions={SOURCE_SELECT_OPTIONS}
          onSourceChange={bindSourceChange({
            transportData,
            adapterSource,
            providerId,
            modelId,
            setAdapterSource,
            setProviderId,
            setModelId,
          })}
          onProviderChange={bindProviderChange({
            transportData,
            adapterSource,
            modelId,
            connectOpen,
            setProviderId,
            setModelId,
            setTokenDraft,
          })}
          onModelChange={bindModelChange({
            transportData,
            adapterSource,
            providerId,
            setModelId,
          })}
        />
        <main className="ks-main ks-main-agentic">
          <div className="ks-stack">
            <AgentNarrative
              adapterSource={adapterSource}
              providerLabel={provider.label}
              modelLabel={modelId ?? "Auto"}
              draft={draft}
              profile={profile}
              toolPresetOptions={TOOL_PRESET_OPTIONS}
              skillPresetOptions={SKILL_PRESET_OPTIONS}
              mcpPresetOptions={MCP_PRESET_OPTIONS}
              approvalOptions={APPROVAL_SELECT_OPTIONS}
              onToolPresetChange={bindings.onToolPresetChange}
              onSkillPresetChange={bindings.onSkillPresetChange}
              onMcpPresetChange={bindings.onMcpPresetChange}
              onApprovalsPolicyChange={bindings.onApprovalsPolicyChange}
              onSubagentsEnabledChange={bindings.onSubagentsEnabledChange}
            />
            <AgentConfigPanel
              showConfig={showConfig}
              onToggle={bindings.onToggleConfig}
              profileOptions={PROFILE_SELECT_OPTIONS}
              approvalOptions={APPROVAL_SELECT_OPTIONS}
              toolPresetOptions={TOOL_PRESET_OPTIONS}
              skillPresetOptions={SKILL_PRESET_OPTIONS}
              mcpPresetOptions={MCP_PRESET_OPTIONS}
              toolOptions={TOOL_OPTIONS}
              skillOptions={SKILL_DIRECTORY_OPTIONS}
              mcpStatus={mcpStatus}
              draft={draft}
              onToolPresetChange={bindings.onToolPresetChange}
              onSkillPresetChange={bindings.onSkillPresetChange}
              onMcpPresetChange={bindings.onMcpPresetChange}
              onAgentToolsToggle={bindings.onAgentToolsToggle}
              onToolAllowlistToggle={bindings.onToolAllowlistToggle}
              onSkillDirectoryToggle={bindings.onSkillDirectoryToggle}
              onProfileChange={bindings.onProfileChange}
              onAgentIdChange={bindings.onAgentIdChange}
              onAgentNameChange={bindings.onAgentNameChange}
              onAgentDescriptionChange={bindings.onAgentDescriptionChange}
              onAgentPromptChange={bindings.onAgentPromptChange}
              onAgentToolsChange={bindings.onAgentToolsChange}
              onToolAllowlistChange={bindings.onToolAllowlistChange}
              onToolDenylistChange={bindings.onToolDenylistChange}
              onSkillDirectoriesChange={bindings.onSkillDirectoriesChange}
              onSkillDisabledChange={bindings.onSkillDisabledChange}
              onMcpServersChange={bindings.onMcpServersChange}
              onApprovalsPolicyChange={bindings.onApprovalsPolicyChange}
              onApprovalsCacheChange={bindings.onApprovalsCacheChange}
              onSubagentsEnabledChange={bindings.onSubagentsEnabledChange}
              onSubagentsMaxActiveChange={bindings.onSubagentsMaxActiveChange}
              onSubagentsIdPrefixChange={bindings.onSubagentsIdPrefixChange}
              onContextChange={bindings.onContextChange}
              onOutputFormatChange={bindings.onOutputFormatChange}
              onThreadIdChange={bindings.onThreadIdChange}
              onReset={bindings.onResetConfig}
            />
            <AdvancedPanel
              showAdvanced={showEvents}
              onToggle={bindings.onToggleEvents}
              events={events}
            />
          </div>
          <section className="ks-chat">
            <div className="ks-panel-header">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Agent Loop
                </div>
                <p className="text-xs text-muted-foreground">
                  {profile.label} agent · {provider.label}
                </p>
              </div>
            </div>
            <OutcomeBanner outcome={lastOutcome} />
            <div className="ks-chat-scroll">
              <Thread canSend={canSend} lockHint={null} />
            </div>
          </section>
        </main>
        <Footer />
      </div>
      <ProviderConnectDialog
        providerId={providerId}
        open={connectOpen}
        token={tokenDraft}
        onOpenChange={bindConnectOpenChange({
          providerId,
          setConnectOpen,
          setTokenDraft,
        })}
        onTokenChange={bindTokenChange(setTokenDraft)}
        onSave={bindSaveToken({
          providerId,
          token: tokenDraft,
          setTokenDraft,
          setConnectOpen,
        })}
        onClear={bindClearToken({
          providerId,
          setTokenDraft,
          setConnectOpen,
        })}
      />
    </AssistantRuntimeProvider>
  );
}

type HeaderBarProps = {
  adapterSource: AdapterSource;
  providerId: ProviderId;
  modelId: string | null;
  sourceOptions: Array<{ value: string; label: string }>;
  availableProviders: Array<{ id: ProviderId; label: string }>;
  availableModels: Array<{ id: string; label: string }>;
  providerHelper: string;
  onSourceChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onProviderChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onModelChange: (event: ChangeEvent<HTMLSelectElement>) => void;
};

const HeaderBar: FC<HeaderBarProps> = ({
  adapterSource,
  providerId,
  modelId,
  sourceOptions,
  availableProviders,
  availableModels,
  providerHelper,
  onSourceChange,
  onProviderChange,
  onModelChange,
}) => {
  return (
    <header className="ks-header">
      <div className="ks-header-inner">
        <div className="ks-header-brand">
          <img
            src="/llm-core-logo.svg"
            alt="LLM Core"
            className="h-10 w-10 rounded-sm border border-border/60 bg-background p-1"
          />
          <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Agentic
            <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
              Agent Loop Playground
            </span>
          </div>
        </div>
        <div className="ks-header-controls">
          <div className="ks-header-row ks-header-row-primary">
            <ModelControls
              adapterSource={adapterSource}
              providerId={providerId}
              modelId={modelId}
              sourceOptions={sourceOptions}
              availableProviders={availableProviders}
              availableModels={availableModels}
              providerHelper={providerHelper}
              onSourceChange={onSourceChange}
              onProviderChange={onProviderChange}
              onModelChange={onModelChange}
            />
          </div>
        </div>
      </div>
    </header>
  );
};

const readProviderHelper = (input: { providerId: ProviderId }) => {
  if (input.providerId === "ollama") {
    return "Ollama runs locally at http://127.0.0.1:11434.";
  }
  return "Swap providers without touching the agent loop.";
};

const readCanSend = (input: { hasToken: boolean; requiresToken: boolean }) =>
  !input.requiresToken || input.hasToken;

const readModelFallbackKey = (adapterSource: AdapterSource, providerId: ProviderId) =>
  `${adapterSource}:${providerId}`;

const buildTransportMemo = (input: {
  setEvents: Dispatch<SetStateAction<TransportEvent[]>>;
  setOutcome: Dispatch<SetStateAction<OutcomeSummary | null>>;
}) =>
  createAiSdkWebSocketChatTransport({
    url: "ws://localhost:3001/ws",
    readData: readTransportData,
    readAuth: readAuthTokens,
    onEvent: bindHandleTransportEvent({ setEvents: input.setEvents, setOutcome: input.setOutcome }),
  });

const applyOpenConnectDialog = (setter: Dispatch<SetStateAction<boolean>>) => {
  setter(true);
  return true;
};

const bindOpenConnectDialog = (setter: Dispatch<SetStateAction<boolean>>) =>
  bindFirst(applyOpenConnectDialog, setter);
