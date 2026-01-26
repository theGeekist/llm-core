import type { ChangeEvent, FC } from "react";

export type ToggleProps = {
  id: string;
  checked: boolean;
  suffix: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export const Toggle: FC<ToggleProps> = ({ id, checked, suffix, onChange }) => {
  return (
    <div className="agentic-control">
      <div className="agentic-field agentic-field--toggle">
        <label htmlFor={id} className="agentic-toggle">
          <input id={id} type="checkbox" checked={checked} onChange={onChange} />
          <span>{checked ? "On" : "Off"}</span>
        </label>

        <span className="agentic-suffix" aria-hidden="true">
          {suffix}
        </span>
      </div>
    </div>
  );
};
