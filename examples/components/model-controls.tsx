"use client";

import type { ChangeEvent, FC } from "react";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectFieldProps = {
  id: string;
  label: string;
  value: string | null;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: SelectOption[];
  helper?: string;
  className?: string;
};

export const SelectField: FC<SelectFieldProps> = ({
  id,
  label,
  value,
  onChange,
  options,
  helper,
  className,
}) => {
  const rootClassName = className ? `ks-field ${className}` : "ks-field";
  const selectValue = value ?? "";
  return (
    <div className={rootClassName}>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <select id={id} value={selectValue} onChange={onChange} className="ks-select">
        {options.map(renderSelectOption)}
      </select>
      <span className="ks-select-helper">{helper ?? ""}</span>
    </div>
  );
};

export type ProviderEntry = {
  id: string;
  label: string;
};

export type ModelEntry = {
  id: string;
  label: string;
};

export type ModelControlsProps = {
  adapterSource: string;
  providerId: string;
  modelId: string | null;
  sourceOptions: SelectOption[];
  availableProviders: ProviderEntry[];
  availableModels: ModelEntry[];
  providerHelper: string;
  onSourceChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onProviderChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onModelChange: (event: ChangeEvent<HTMLSelectElement>) => void;
};

const mapProviderOption = (entry: ProviderEntry): SelectOption => ({
  value: entry.id,
  label: entry.label,
});

const mapModelOption = (entry: ModelEntry): SelectOption => ({
  value: entry.id,
  label: entry.label,
});

const createEmptyModelOption = (): SelectOption => ({
  value: "",
  label: "No models available",
  disabled: true,
});

const buildModelOptions = (models: ModelEntry[]) =>
  models.length > 0 ? models.map(mapModelOption) : [createEmptyModelOption()];

export const ModelControls: FC<ModelControlsProps> = ({
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
  const showModel = availableModels.length !== 1;
  const providerOptions = availableProviders.map(mapProviderOption);
  const modelOptions = buildModelOptions(availableModels);

  return (
    <>
      <SelectField
        id="source"
        label="Adapter source"
        value={adapterSource}
        onChange={onSourceChange}
        helper="Choose the ecosystem bridge."
        options={sourceOptions}
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
    </>
  );
};

const renderSelectOption = (option: SelectOption) => (
  <option key={option.value} value={option.value} disabled={option.disabled}>
    {option.label}
  </option>
);
