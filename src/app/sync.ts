import {
  currentSource,
  onCheckinsChanged,
  onSettingsChanged,
  onTaskTypesChanged,
  onTasksChanged,
  onTodosChanged,
} from "../shared/events";
import { useCheckinsStore } from "../stores/checkinsStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useTaskTypesStore } from "../stores/taskTypesStore";
import { useTasksStore } from "../stores/tasksStore";
import { useTodosStore } from "../stores/todosStore";

type Stop = () => void;

/**
 * 主窗与挂件各自持有独立 store。写库方在成功后发失效信号，
 * 另一窗口收到后重查数据库；自己的事件直接丢弃，避免回环。
 */
export async function startCrossWindowSync(): Promise<Stop> {
  const source = currentSource();
  const stops: Stop[] = [];

  const reloadCheckins = () => {
    void useCheckinsStore
      .getState()
      .reload()
      .catch((error: unknown) => {
        console.error("[sync] 打卡重查失败", error);
      });
  };
  const reloadTasks = () => {
    void useTasksStore
      .getState()
      .reload()
      .catch((error: unknown) => {
        console.error("[sync] 任务重查失败", error);
      });
  };
  const reloadTaskTypes = () => {
    void useTaskTypesStore
      .getState()
      .reload()
      .catch((error: unknown) => {
        console.error("[sync] 任务类型重查失败", error);
      });
  };
  const reloadTodos = () => {
    void useTodosStore
      .getState()
      .reload()
      .catch((error: unknown) => {
        console.error("[sync] 待办重查失败", error);
      });
  };
  const reloadSettings = () => {
    void useSettingsStore
      .getState()
      .reload()
      .catch((error: unknown) => {
        console.error("[sync] 设置重查失败", error);
      });
  };

  try {
    stops.push(
      await onCheckinsChanged((payload) => {
        if (payload.source !== source) {
          reloadCheckins();
        }
      }),
    );
    stops.push(
      await onTasksChanged((payload) => {
        if (payload.source !== source) {
          reloadTasks();
        }
      }),
    );
    stops.push(
      await onTaskTypesChanged((payload) => {
        if (payload.source !== source) {
          reloadTaskTypes();
        }
      }),
    );
    stops.push(
      await onTodosChanged((payload) => {
        if (payload.source !== source) {
          reloadTodos();
        }
      }),
    );
    stops.push(
      await onSettingsChanged((payload) => {
        if (payload.source !== source) {
          reloadSettings();
        }
      }),
    );
  } catch (error) {
    stops.splice(0).forEach((stop) => stop());
    throw error;
  }

  return () => {
    stops.splice(0).forEach((stop) => stop());
  };
}
