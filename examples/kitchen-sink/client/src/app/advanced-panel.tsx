"use client";

import type { FC } from "react";
import type { TransportEvent } from "@geekist/llm-core/adapters/ai-sdk-ui";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { formatTransportEvent } from "./helpers";
import { bindFirst } from "@geekist/llm-core";

type AdvancedPanelProps = {
  showAdvanced: boolean;
  onToggle: () => void;
  showEvents: boolean;
  onToggleEvents: () => void;
  events: TransportEvent[];
};

export const AdvancedPanel: FC<AdvancedPanelProps> = ({
  showAdvanced,
  onToggle,
  showEvents,
  onToggleEvents,
  events,
}) => {
  return (
    <section className="ks-panel px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Advanced
          </div>
          <p className="text-sm text-muted-foreground">
            Toggle event streams and diagnostics without overwhelming the main UI.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onToggle}>
          {showAdvanced ? "Hide" : "Show"} controls
        </Button>
      </div>
      {showAdvanced ? (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <ToggleButton active={showEvents} onClick={onToggleEvents} label="Live events" />
          </div>
          {showEvents ? <EventLog events={events} /> : null}
        </div>
      ) : null}
    </section>
  );
};

type ToggleButtonProps = {
  active: boolean;
  onClick: () => void;
  label: string;
};

const ToggleButton: FC<ToggleButtonProps> = ({ active, onClick, label }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-sm border px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors",
        active && "border-ring/60 bg-muted text-foreground",
      )}
    >
      {label}
    </button>
  );
};

const EventLog: FC<{ events: TransportEvent[] }> = ({ events }) => {
  const entries = events.slice(-12).reverse();
  const renderEntry = bindFirst(renderEventEntry, {});

  return (
    <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-3 text-xs">
      {entries.length === 0 ? (
        <div className="text-muted-foreground">No live events yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">{entries.map(renderEntry)}</ul>
      )}
    </div>
  );
};

const renderEventEntry = (_: Record<string, never>, event: TransportEvent, index: number) => {
  return (
    <li key={`${event.direction}-${index}`} className="rounded-md bg-background px-2 py-1">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {event.direction}
      </div>
      <div className="font-mono text-[11px]">{formatTransportEvent(event)}</div>
    </li>
  );
};
