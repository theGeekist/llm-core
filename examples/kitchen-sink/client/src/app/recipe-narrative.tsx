"use client";

import type { FC } from "react";
import { ADAPTER_SOURCES, readProviderOption, readRecipeOption } from "../demo-options";
import type { AdapterSource, ProviderId, RecipeId } from "../demo-options";

type RecipeNarrativeProps = {
  recipeId: RecipeId;
  adapterSource: AdapterSource;
  providerId: ProviderId;
  modelId: string;
};

export const RecipeNarrative: FC<RecipeNarrativeProps> = ({
  recipeId,
  adapterSource,
  providerId,
  modelId,
}) => {
  const recipe = readRecipeOption(recipeId);
  const source = ADAPTER_SOURCES.find((entry) => entry.id === adapterSource);
  const provider = readProviderOption(providerId);

  return (
    <section className="ks-panel px-5 py-5">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        What&rsquo;s happening
      </div>
      <div className="ks-panel-grid">
        <div>
          <h3 className="text-base font-semibold">{recipe.label}</h3>
          <p className="text-sm text-muted-foreground">{recipe.description}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>{source?.label ?? adapterSource}</span>
            <span>{provider.label}</span>
            <span>{modelId}</span>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Packs
          </div>
          <p className="text-xs text-muted-foreground">
            Deterministic order: dependencies → priority → name.
          </p>
          <ul className="ks-pack-list">{recipe.packs.map(renderPackEntry)}</ul>
        </div>
      </div>
    </section>
  );
};

const renderPackEntry = (pack: string) => (
  <li key={pack} className="ks-pack-pill">
    {pack}
  </li>
);
