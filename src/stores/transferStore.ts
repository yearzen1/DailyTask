import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { downloadDir, join } from "@tauri-apps/api/path";
import { create } from "zustand";

import { getDb } from "../db/client";
import {
  exportData,
  importData,
  parseImportBundle,
  type ImportCounts,
} from "../db/transfer";
import { formatDate } from "../domain/date";

export interface ImportResult {
  path: string;
  counts: ImportCounts;
}

export interface TransferState {
  exporting: boolean;
  importing: boolean;
  /** 导出 JSON v2（含名称段）；取消对话框返回 null。 */
  exportToFile: () => Promise<string | null>;
  /** 选择文件导入并 upsert；取消返回 null。 */
  importFromFile: () => Promise<ImportResult | null>;
}

export const useTransferStore = create<TransferState>()((set) => ({
  exporting: false,
  importing: false,

  exportToFile: async () => {
    const folder = await downloadDir();
    const path = await save({
      defaultPath: await join(
        folder,
        `dailytask-${formatDate(new Date())}.json`,
      ),
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) {
      return null;
    }

    set({ exporting: true });
    try {
      const bundle = await exportData(await getDb());
      await writeTextFile(path, `${JSON.stringify(bundle, null, 2)}\n`);
      return path;
    } finally {
      set({ exporting: false });
    }
  },

  importFromFile: async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) {
      return null;
    }

    set({ importing: true });
    try {
      const text = await readTextFile(path);
      const bundle = parseImportBundle(text);
      const counts = await importData(await getDb(), bundle);
      return { path, counts };
    } finally {
      set({ importing: false });
    }
  },
}));
