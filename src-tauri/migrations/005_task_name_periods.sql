-- 005_task_name_periods.sql · 任务名按日期分段，改名不再覆盖历史
-- 每个任务回填一段：起点取最早区间启用日；没有区间时取创建日。

CREATE TABLE task_name_periods (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  start_date TEXT NOT NULL,               -- 含当天
  end_date   TEXT,                        -- NULL = 至今有效
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX idx_name_periods_task_start
  ON task_name_periods(task_id, start_date);

INSERT INTO task_name_periods (id, task_id, name, start_date, end_date)
SELECT
  lower(hex(randomblob(16))),
  t.id,
  t.name,
  COALESCE(
    (SELECT MIN(i.start_date) FROM task_intervals i WHERE i.task_id = t.id),
    date(t.created_at)
  ),
  NULL
FROM tasks t;
