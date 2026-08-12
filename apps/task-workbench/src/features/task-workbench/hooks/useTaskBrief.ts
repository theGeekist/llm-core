import { useEffect, useState } from "react";
import type { TaskBrief } from "../model";
import { loadTaskBrief } from "../services/task-workbench-api";

export interface TaskBriefState {
  readonly brief: TaskBrief | null;
  readonly error: string | null;
  readonly loading: boolean;
}

export const useTaskBrief = (task: string): TaskBriefState => {
  const [state, setState] = useState<TaskBriefState>({
    brief: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let current = true;
    if (task === "") {
      setState({ brief: null, error: null, loading: false });
      return () => {
        current = false;
      };
    }
    setState({ brief: null, error: null, loading: true });
    void loadTaskBrief(task)
      .then((brief) => {
        if (current) setState({ brief, error: null, loading: false });
      })
      .catch((reason: unknown) => {
        if (current) {
          setState({
            brief: null,
            error: reason instanceof Error ? reason.message : String(reason),
            loading: false,
          });
        }
      });
    return () => {
      current = false;
    };
  }, [task]);

  return state;
};
