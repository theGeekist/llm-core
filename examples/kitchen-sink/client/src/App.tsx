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
import { createAiSdkWebSocketChatTransport } from "../../../../src/adapters";
import "./styles.css";
import { Thread } from "./components/assistant-ui/thread";
import { Button } from "./components/ui/button";
import {
  RECIPE_SELECT_OPTIONS,
  SOURCE_SELECT_OPTIONS,
  PROVIDERS,
  readAvailableModels,
  readAvailableProviders,
  readPresetForSelection,
  readProviderOption,
  type AdapterSource,
  type ProviderId,
  type RecipeId,
} from "./demo-options";
import { readAllProviderTokens, readProviderToken } from "./token-store";
import { RecipeNarrative } from "./app/recipe-narrative";
import { AdvancedPanel } from "./app/advanced-panel";
import { OutcomeBanner } from "./app/outcome-banner";
import { ProviderConnectDialog } from "./app/connect-dialog";
import {
  bindConnectOpenChange,
  bindHandleTransportEvent,
  bindModelChange,
  bindProviderChange,
  bindRecipeChange,
  bindSourceChange,
  bindToggle,
  bindSaveToken,
  bindTokenChange,
  bindClearToken,
  type TransportData,
  type OutcomeSummary,
} from "./app/helpers";
import { bindFirst } from "../../../../src/shared/fp";
import type { TransportEvent } from "../../../../src/adapters";

const transportData: TransportData = {
  recipeId: "agent",
  adapterSource: "ai-sdk",
  providerId: "openai",
  modelId: "gpt-4o-mini",
};

const readProviderId = (provider: { id: ProviderId }) => provider.id;
const readAuthTokens = () => readAllProviderTokens(PROVIDERS.map(readProviderId));
const readTransportData = () => transportData;

export function App() {
  const [recipeId, setRecipeId] = useState<RecipeId>("agent");
  const [adapterSource, setAdapterSource] = useState<AdapterSource>("ai-sdk");
  const [providerId, setProviderId] = useState<ProviderId>("openai");
  const [modelId, setModelId] = useState<string>("gpt-4o-mini");
  const [events, setEvents] = useState<TransportEvent[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
  const availableModels = readAvailableModels(adapterSource, providerId);
  const activePreset = readPresetForSelection({
    recipeId,
    adapterSource,
    providerId,
    modelId,
  });
  const token = readProviderToken(providerId);
  const hasToken = !!token;
  const canSend = readCanSend({ hasToken, requiresToken: provider.requiresToken });

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
          recipeId={recipeId}
          adapterSource={adapterSource}
          providerId={providerId}
          modelId={modelId}
          availableProviders={availableProviders}
          availableModels={availableModels}
          providerHelper={readProviderHelper({ providerId })}
          onRecipeChange={bindRecipeChange({
            transportData,
            adapterSource,
            providerId,
            modelId,
            setRecipeId,
          })}
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
        <main className="ks-main">
          <RecipeNarrative
            recipeId={recipeId}
            adapterSource={adapterSource}
            providerId={providerId}
            modelId={modelId}
          />
          <OutcomeBanner outcome={lastOutcome} />
          <section className="ks-chat">
            <div className="ks-panel-header">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Conversation
                </div>
                <p className="text-xs text-muted-foreground">
                  {activePreset?.title ?? "Free chat"} · {provider.label}
                </p>
              </div>
            </div>
            <div className="ks-chat-scroll">
              <Thread canSend={canSend} lockHint={null} />
            </div>
          </section>
          <AdvancedPanel
            showAdvanced={showAdvanced}
            onToggle={bindToggle(setShowAdvanced)}
            showEvents={showEvents}
            onToggleEvents={bindToggle(setShowEvents)}
            events={events}
          />
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
  recipeId: RecipeId;
  adapterSource: AdapterSource;
  providerId: ProviderId;
  modelId: string;
  availableProviders: Array<{ id: ProviderId; label: string }>;
  availableModels: Array<{ id: string; label: string }>;
  providerHelper: string;
  onRecipeChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onSourceChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onProviderChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onModelChange: (event: ChangeEvent<HTMLSelectElement>) => void;
};

const HeaderBar: FC<HeaderBarProps> = ({
  recipeId,
  adapterSource,
  providerId,
  modelId,
  availableProviders,
  availableModels,
  providerHelper,
  onRecipeChange,
  onSourceChange,
  onProviderChange,
  onModelChange,
}) => {
  const showModel = availableModels.length > 1;
  const providerOptions = availableProviders.map(toSelectOptionFromProvider);
  const modelOptions = availableModels.map(toSelectOptionFromModel);

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
            Kitchen Sink
            <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
              Guided Playground
            </span>
          </div>
        </div>
        <div className="ks-header-controls">
          <div className="ks-header-row ks-header-row-primary">
            <SelectField
              id="recipe"
              label="Recipe"
              value={recipeId}
              onChange={onRecipeChange}
              helper="Pick the orchestration pattern to run."
              options={RECIPE_SELECT_OPTIONS}
            />
            <SelectField
              id="source"
              label="Adapter source"
              value={adapterSource}
              onChange={onSourceChange}
              helper="Choose the ecosystem bridge."
              options={SOURCE_SELECT_OPTIONS}
            />
            <SelectField
              id="provider"
              label="Provider"
              value={providerId}
              onChange={onProviderChange}
              helper={providerHelper}
              options={providerOptions}
            />
            {showModel ? (
              <SelectField
                id="model"
                label="Model"
                value={modelId}
                onChange={onModelChange}
                helper="Select a model within the provider."
                options={modelOptions}
              />
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
};

type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: Array<{ value: string; label: string }>;
  helper?: string;
  className?: string;
};

const SelectField: FC<SelectFieldProps> = ({
  id,
  label,
  value,
  onChange,
  options,
  helper,
  className,
}) => {
  const rootClassName = className ? `ks-field ${className}` : "ks-field";
  return (
    <div className={rootClassName}>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <select id={id} value={value} onChange={onChange} className="ks-select">
        {options.map(renderSelectOption)}
      </select>
      <span className="ks-select-helper">{helper ?? ""}</span>
    </div>
  );
};

type ConnectButtonProps = {
  providerLabel: string;
  hasToken: boolean;
  requiresToken: boolean;
  onOpen: () => void;
};

const ConnectButton: FC<ConnectButtonProps> = ({
  providerLabel,
  hasToken,
  requiresToken,
  onOpen,
}) => {
  if (!requiresToken) {
    return null;
  }
  return (
    <Button
      variant={hasToken ? "outline" : "default"}
      size="sm"
      onClick={onOpen}
      className="ks-connect-btn"
    >
      {hasToken ? "Manage" : "Connect"} {providerLabel}
    </Button>
  );
};

const toSelectOptionFromProvider = (entry: { id: ProviderId; label: string }) => ({
  value: entry.id,
  label: entry.label,
});

const toSelectOptionFromModel = (entry: { id: string; label: string }) => ({
  value: entry.id,
  label: entry.label,
});

const renderSelectOption = (option: { value: string; label: string }) => (
  <option key={option.value} value={option.value}>
    {option.label}
  </option>
);

const Footer: FC = () => {
  return (
    <footer className="ks-footer">
      <div className="ks-footer-inner">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-foreground">LLM Core</span>
          <span>@geekist/llm-core</span>
          <span className="text-[11px] uppercase tracking-[0.2em]">Geekist</span>
        </div>
        <LinkBar />
      </div>
    </footer>
  );
};

const TopBar: FC<{ connect: ConnectButtonProps }> = ({ connect }) => {
  return (
    <div className="ks-topbar">
      <div className="ks-topbar-inner">
        <div className="flex flex-wrap items-center gap-3">
          <img
            src="/llm-core-logo.svg"
            alt="LLM Core"
            className="h-7 w-7 rounded-sm border border-border/60 bg-background p-1"
          />
          <span className="font-semibold text-foreground">@geekist/llm-core</span>
          <span className="text-[11px] uppercase tracking-[0.2em]">Geekist</span>
        </div>
        <div className="ks-topbar-actions">
          <LinkBar />
          <ConnectButton
            providerLabel={connect.providerLabel}
            hasToken={connect.hasToken}
            requiresToken={connect.requiresToken}
            onOpen={connect.onOpen}
          />
        </div>
      </div>
    </div>
  );
};

const LINKS = [
  {
    href: "https://llm-core.geekist.co",
    label: "Docs",
    emphasis: true,
  },
  {
    href: "https://github.com/theGeekist/llm-core",
    label: "GitHub",
    emphasis: false,
  },
  {
    href: "https://www.npmjs.com/package/@geekist/llm-core",
    label: "npm",
    emphasis: false,
  },
  {
    href: "https://geekist.co",
    label: "geekist.co",
    emphasis: false,
  },
] as const;

const LinkBar: FC = () => {
  return <div className="ks-link-bar">{LINKS.map(renderLinkItem)}</div>;
};

const renderLinkItem = (link: (typeof LINKS)[number]) => (
  <a
    key={link.href}
    href={link.href}
    className={link.emphasis ? "ks-link ks-link-primary" : "ks-link"}
    target="_blank"
    rel="noreferrer"
  >
    {link.label}
  </a>
);

const readProviderHelper = (input: { providerId: ProviderId }) => {
  if (input.providerId === "ollama") {
    return "Ollama runs locally at http://127.0.0.1:11434.";
  }
  return "Swap providers without touching recipes.";
};

const readCanSend = (input: { hasToken: boolean; requiresToken: boolean }) =>
  !input.requiresToken || input.hasToken;


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
