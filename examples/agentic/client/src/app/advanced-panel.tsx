"use client";

import type { FC, MouseEvent } from "react";
import type { TransportEvent } from "@geekist/llm-core/adapters/ai-sdk-ui";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { formatTransportEvent } from "./transport-helpers";

type AdvancedPanelProps = {
  showAdvanced: boolean;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => boolean;
  events: TransportEvent[];
};

export const AdvancedPanel: FC<AdvancedPanelProps> = ({ showAdvanced, onToggle, events }) => {
  return (
    <section className="ks-panel px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Telemetry
          </div>
          <p className="text-sm text-muted-foreground">
            Inspect interaction events, diagnostics, and stream lifecycle.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onToggle}
          aria-expanded={showAdvanced}
          aria-controls="advanced-panel-controls"
        >
          {showAdvanced ? "Hide" : "Show"} telemetry
        </Button>
      </div>
      {showAdvanced ? (
        <div id="advanced-panel-controls" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <StatusPill active={showAdvanced} label="Live events" />
          </div>
          <EventLog events={events} />
        </div>
      ) : null}
    </section>
  );
};

type StatusPillProps = {
  active: boolean;
  label: string;
};

const StatusPill: FC<StatusPillProps> = ({ active, label }) => {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "rounded-sm border px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors",
        active && "border-ring/60 bg-muted text-foreground",
      )}
    >
      {label}
    </span>
  );
};

type EventEntry = {
  event: TransportEvent;
  index: number;
};

const buildEntries = (events: TransportEvent[]) => {
  const slice = events.slice(-12).reverse();
  return slice.map(toEventEntry);
};

const toEventEntry = (event: TransportEvent, index: number): EventEntry => ({ event, index });

const renderEventEntry = (entry: EventEntry) => (
  <li
    key={`${entry.event.direction}-${entry.index}`}
    className="rounded-md bg-background px-2 py-1"
  >
    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
      {entry.event.direction}
    </div>
    <div className="font-mono text-[11px]">{formatTransportEvent(entry.event)}</div>
  </li>
);

const EventLog: FC<{ events: TransportEvent[] }> = ({ events }) => {
  const entries = buildEntries(events);

  return (
    <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-3 text-xs">
      {entries.length === 0 ? (
        <div className="text-muted-foreground">No live events yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">{entries.map(renderEventEntry)}</ul>
      )}
    </div>
  );
};
