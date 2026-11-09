import { useEffect } from "react";

import { isDevBuild } from "../shared/env";
import { useUpdateStore } from "../stores/updateStore";

/** 启动时静默检查一次更新；开发构建不查，避免把正式版装进 dev 目录。 */
export function useUpdateCheck(): void {
  useEffect(() => {
    if (isDevBuild) {
      return;
    }
    void useUpdateStore.getState().checkForUpdate();
  }, []);
}
