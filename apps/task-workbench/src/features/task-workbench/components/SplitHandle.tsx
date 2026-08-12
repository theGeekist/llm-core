import { useRef } from "react";

export function SplitHandle({
  className,
  invert,
  label,
  maximum,
  minimum,
  onReset,
  onResize,
  orientation = "vertical",
  value,
}: {
  readonly className?: string;
  readonly invert?: boolean;
  readonly label: string;
  readonly maximum: number;
  readonly minimum: number;
  readonly onReset: () => void;
  readonly onResize: (value: number) => void;
  readonly orientation?: "horizontal" | "vertical";
  readonly value: number;
}) {
  const start = useRef({ pointer: 0, value });
  const clamp = (next: number) => Math.min(maximum, Math.max(minimum, next));
  const classes = ["split-handle", `split-handle-${orientation}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemax={maximum}
      aria-valuemin={minimum}
      aria-valuenow={value}
      className={classes}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const unit = event.shiftKey ? 48 : 16;
        const positiveKey = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
        const negativeKey = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
        const direction =
          event.key === positiveKey
            ? invert
              ? -1
              : 1
            : event.key === negativeKey
              ? invert
                ? 1
                : -1
              : 0;
        if (direction === 0) return;
        event.preventDefault();
        onResize(clamp(value + direction * unit));
      }}
      onPointerDown={(event) => {
        start.current = {
          pointer: orientation === "vertical" ? event.clientX : event.clientY,
          value,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const pointer = orientation === "vertical" ? event.clientX : event.clientY;
        const delta = pointer - start.current.pointer;
        onResize(clamp(start.current.value + (invert ? -delta : delta)));
      }}
      role="separator"
      tabIndex={0}
    >
      <span />
    </div>
  );
}
