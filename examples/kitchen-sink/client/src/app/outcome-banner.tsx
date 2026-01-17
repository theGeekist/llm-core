"use client";

import type { FC } from "react";
import type { OutcomeSummary } from "./helpers";

export const OutcomeBanner: FC<{ outcome: OutcomeSummary | null }> = ({ outcome }) => {
  if (!outcome || outcome.status !== "paused") {
    return null;
  }
  const tokenLabel = outcome.token ?? "unknown";
  return (
    <section className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Paused for approval. Resume token: <span className="font-semibold">{tokenLabel}</span>
    </section>
  );
};
