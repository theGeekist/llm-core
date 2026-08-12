import { useEffect, useState } from "react";
import { copy } from "../copy";
import type { WorkbenchCommand } from "../model";
import { loadCommands, runCommand } from "../services/task-workbench-api";

export function CommandRunner({
  onResult,
  task,
}: {
  readonly onResult: (output: string) => void;
  readonly task: string;
}) {
  const [commands, setCommands] = useState<readonly WorkbenchCommand[]>([]);
  const [selected, setSelected] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    loadCommands()
      .then((items) => {
        setCommands(items);
        setSelected(items[0]?.id ?? "");
      })
      .catch((error: unknown) => onResult(copy.commands.loadFailed(String(error))));
  }, [onResult]);

  const command = commands.find(({ id }) => id === selected);
  const commandText =
    command === undefined
      ? null
      : (copy.commands.catalogue[command.id as keyof typeof copy.commands.catalogue] ?? {
          description: command.description,
          label: command.label,
        });
  const execute = async () => {
    if (command === undefined || commandText === null) return;
    if (command.mutates && !window.confirm(copy.commands.mutatingPrompt(commandText.label))) {
      return;
    }
    setRunning(true);
    onResult(copy.commands.runningCommand(commandText.label));
    try {
      const result = await runCommand(command.id, task);
      const resultText =
        copy.commands.catalogue[result.command.id as keyof typeof copy.commands.catalogue];
      onResult(`${resultText?.label ?? result.command.label}\n\n${result.output}`);
    } catch (error) {
      onResult(copy.commands.failed(error instanceof Error ? error.message : String(error)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="command-runner" title={commandText?.description}>
      <select
        aria-label={copy.commands.ariaLabel}
        onChange={(event) => setSelected(event.target.value)}
        value={selected}
      >
        {commands.map((item) => (
          <option key={item.id} value={item.id}>
            {item.mutates ? copy.commands.mutatingPrefix : ""}
            {copy.commands.catalogue[item.id as keyof typeof copy.commands.catalogue]?.label ??
              item.label}
          </option>
        ))}
      </select>
      <button disabled={running || selected === ""} onClick={() => void execute()}>
        {running ? copy.commands.running : copy.commands.run}
      </button>
    </div>
  );
}
