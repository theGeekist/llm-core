"use client";

import type { ChangeEvent, FC } from "react";

type ToggleProps = {
  id: string;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  suffix?: string;
};

export const Toggle: FC<ToggleProps> = ({ id, checked, onChange, suffix }) => {
  const hasSuffix = Boolean(suffix && suffix.trim().length > 0);

  return (
    <div className="agentic-toggle-field">
      <label htmlFor={id} className="agentic-toggle-label">
        <input id={id} type="checkbox" checked={checked} onChange={onChange} />
        <span>{checked ? "On" : "Off"}</span>
      </label>
      {hasSuffix ? (
        <span className="agentic-suffix" aria-hidden="true">
          {suffix}
        </span>
      ) : null}
    </div>
  );
};
