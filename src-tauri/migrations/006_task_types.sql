-- 006_task_types.sql · 任务类型从枚举升级为可嵌套的树
-- 内置「自愿 / 被迫」保留为两个顶层类型；既有任务按 category 回填 type_id。

CREATE TABLE task_types (
  id         TEXT PRIMARY KEY,
  name       TEXT,                        -- NULL = 内置类型，显示走 i18n
  parent_id  TEXT REFERENCES task_types(id),
  sort_order INTEGER NOT NULL DEFAULT 0,  -- 只在同级内比较
  system_key TEXT UNIQUE,                 -- 'voluntary' | 'forced'
  color      TEXT,                        -- 调色板 key；NULL 用默认色
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (parent_id IS NULL OR parent_id <> id)
);

INSERT INTO task_types
  (id, name, parent_id, sort_order, system_key, color, created_at, updated_at)
VALUES
  ('voluntary', NULL, NULL, 0, 'voluntary', NULL,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('forced', NULL, NULL, 1, 'forced', NULL,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

ALTER TABLE tasks ADD COLUMN type_id TEXT;
UPDATE tasks SET type_id = category;
CREATE INDEX idx_tasks_type ON tasks(type_id);
