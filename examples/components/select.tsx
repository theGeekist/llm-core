import type { ChangeEvent, FC } from "react";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = {
  id: string;
  value: string;
  options: SelectOption[];
  suffix?: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
};

export const Select: FC<SelectProps> = ({ id, value, options, suffix, onChange }) => {
  return (
    <div className="agentic-control">
      <div className="agentic-field">
        <select
          id={id}
          value={value}
          onChange={onChange}
          className="agentic-select agentic-select--with-suffix"
        >
          {options.map(renderOption)}
        </select>

        <span className="agentic-suffix" aria-hidden="true">
          {suffix}
        </span>

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
    </div>
  );
};

export const renderOption = (option: SelectOption) => (
  <option key={option.value} value={option.value} disabled={option.disabled}>
    {option.label}
  </option>
);
