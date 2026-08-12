import type { WorkbenchTask } from "./model";

export const detachedTaskCount = (
  tasks: readonly Pick<WorkbenchTask, "dependsOn" | "key">[],
): number => {
  const available = new Set(tasks.map(({ key }) => key));
  const connected = new Set<string>();
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!available.has(dependency)) continue;
      connected.add(dependency);
      connected.add(task.key);
    }
  }
  return tasks.filter(({ key }) => !connected.has(key)).length;
};
