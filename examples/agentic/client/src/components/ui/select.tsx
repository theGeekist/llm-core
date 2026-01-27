"use client";

import type { ChangeEvent, FC } from "react";
import type { SelectOption } from "../../demo-options";
import { cn } from "../../lib/utils";

type SelectProps = {
  id: string;
  value: string;
  options: SelectOption[];
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  suffix?: string;
  className?: string;
};

export const Select: FC<SelectProps> = ({ id, value, options, onChange, suffix, className }) => {
  const hasSuffix = Boolean(suffix && suffix.trim().length > 0);

  return (
    <div className="agentic-select-field">
      <select
        id={id}
        value={value}
        onChange={onChange}
        className={
          cn("agentic-select", hasSuffix && "agentic-select--with-suffix", className) as string
        }
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>

      {hasSuffix ? (
        <span className="agentic-suffix" aria-hidden="true">
          {suffix}
        </span>
      ) : null}

      <svg className="agentic-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M6 8l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
