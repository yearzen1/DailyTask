/**
 * 任务管理表格的列宽模型：6 列百分比，和 100。
 * 拖动分隔线只改两侧两列，表格总宽恒等于卡片宽；窗口变宽变窄时按比例缩放。
 */
export const MANAGE_COLUMNS = [
  "task",
  "category",
  "start",
  "end",
  "status",
  "actions",
] as const;

export type ManageColumnKey = (typeof MANAGE_COLUMNS)[number];

/** 按旧固定宽度换算：832px 内容宽下约为 166 / 92 / 125 / 125 / 133 / 191。 */
export const DEFAULT_MANAGE_COLUMN_WIDTHS: readonly number[] = [
  20, 11, 15, 15, 16, 23,
];

/** 最小宽之和 78%，任何窗口宽度都留得下。 */
export const MIN_MANAGE_COLUMN_WIDTHS: readonly number[] = [
  11, 10, 11, 11, 13, 22,
];

export const MAX_MANAGE_COLUMN_WIDTHS: readonly number[] = [
  60, 24, 30, 30, 30, 40,
];

const FULL_WIDTH = 100;
/** 存库值的合法区间，超出视为脏数据。 */
const STORED_MIN = 4;
const STORED_MAX = 70;
/** 和偏离 100 不超过该值就当作正常误差。 */
const SUM_TOLERANCE = 0.5;

const round = (value: number) => Math.round(value * 100) / 100;

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** 四舍五入后修掉 0.01 的累计误差，让和精确落在 100；protect 指定的列不参与调剂。 */
function roundToFullWidth(
  values: readonly number[],
  protect?: number,
): number[] {
  const rounded = values.map(round);
  const drift = round(FULL_WIDTH - sum(rounded));
  if (Math.abs(drift) < 0.005) {
    return rounded;
  }
  let widest = -1;
  for (let index = 0; index < rounded.length; index += 1) {
    if (index === protect) {
      continue;
    }
    if (widest < 0 || rounded[index] > rounded[widest]) {
      widest = index;
    }
  }
  if (widest < 0) {
    return rounded;
  }
  const adjusted = round(rounded[widest] + drift);
  if (adjusted >= STORED_MIN && adjusted <= STORED_MAX) {
    rounded[widest] = adjusted;
  }
  return rounded;
}

/**
 * 校验存库的列宽：形状不对、坏值、越界一律回默认；
 * 和偏离 100 超过 0.5 时等比缩放。
 */
export function sanitizeManageColumnWidths(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length !== MANAGE_COLUMNS.length) {
    return [...DEFAULT_MANAGE_COLUMN_WIDTHS];
  }
  const values = raw.map((value) =>
    typeof value === "number" ? value : Number.NaN,
  );
  if (
    values.some(
      (value) => !Number.isFinite(value) || value < STORED_MIN || value > STORED_MAX,
    )
  ) {
    return [...DEFAULT_MANAGE_COLUMN_WIDTHS];
  }

  const stored = sum(values);
  if (stored <= 0) {
    return [...DEFAULT_MANAGE_COLUMN_WIDTHS];
  }
  if (Math.abs(stored - FULL_WIDTH) <= SUM_TOLERANCE) {
    return roundToFullWidth(values);
  }

  const scaled = values.map((value) => (value * FULL_WIDTH) / stored);
  if (scaled.some((value) => value < STORED_MIN || value > STORED_MAX)) {
    return [...DEFAULT_MANAGE_COLUMN_WIDTHS];
  }
  return roundToFullWidth(scaled);
}

/**
 * 拖动 boundary（左列的索引）右侧分隔线：左列加 delta，右列减 delta，
 * 两侧都夹在自己的最小 / 最大宽之间；其余列不动。
 */
export function resizeBoundary(
  widths: readonly number[],
  boundary: number,
  delta: number,
): number[] {
  if (boundary < 0 || boundary >= widths.length - 1) {
    return [...widths];
  }
  if (!Number.isFinite(delta)) {
    return [...widths];
  }
  const left = widths[boundary];
  const right = widths[boundary + 1];
  const lower = Math.max(
    MIN_MANAGE_COLUMN_WIDTHS[boundary] - left,
    right - MAX_MANAGE_COLUMN_WIDTHS[boundary + 1],
  );
  const upper = Math.min(
    MAX_MANAGE_COLUMN_WIDTHS[boundary] - left,
    right - MIN_MANAGE_COLUMN_WIDTHS[boundary + 1],
  );
  const applied = Math.min(upper, Math.max(lower, delta));

  const next = [...widths];
  next[boundary] = round(left + applied);
  next[boundary + 1] = round(right - applied);
  return next;
}

/**
 * 双击复位单列：该列精确回到默认宽，差值按其余列的可用余量比例分摊。
 * 余量不足时尽量接近默认宽，不会把任何列推出自己的最小 / 最大宽。
 */
export function resetColumnWidth(
  widths: readonly number[],
  index: number,
): number[] {
  if (index < 0 || index >= widths.length) {
    return [...widths];
  }
  const target = DEFAULT_MANAGE_COLUMN_WIDTHS[index];
  const diff = target - widths[index];
  if (Math.abs(diff) < 0.005) {
    return roundToFullWidth(widths);
  }

  const next = widths.map(round);
  const donors = widths.map((_, position) => position).filter(
    (position) => position !== index,
  );
  const needsSpace = diff > 0;
  const capacityOf = (position: number) =>
    needsSpace
      ? Math.max(0, next[position] - MIN_MANAGE_COLUMN_WIDTHS[position])
      : Math.max(0, MAX_MANAGE_COLUMN_WIDTHS[position] - next[position]);

  const capacities = donors.map(capacityOf);
  const totalCapacity = capacities.reduce((total, value) => total + value, 0);
  if (totalCapacity <= 0) {
    return roundToFullWidth(widths);
  }

  next[index] = target;
  let remaining = Math.abs(diff);
  donors.forEach((donor, position) => {
    const share = Math.min(
      capacities[position],
      (Math.abs(diff) * capacities[position]) / totalCapacity,
    );
    const taken = Math.min(share, remaining);
    next[donor] += needsSpace ? -taken : taken;
    remaining -= taken;
  });

  // 比例分摊的余数：按顺序补给还有余量的列。
  if (remaining > 0.005) {
    for (const donor of donors) {
      const capacity = needsSpace
        ? next[donor] - MIN_MANAGE_COLUMN_WIDTHS[donor]
        : MAX_MANAGE_COLUMN_WIDTHS[donor] - next[donor];
      const taken = Math.min(capacity, remaining);
      next[donor] += needsSpace ? -taken : taken;
      remaining -= taken;
      if (remaining <= 0.005) {
        break;
      }
    }
  }

  // 实在腾不出空间：目标列只能拿到实际让出的部分。
  if (remaining > 0.005) {
    next[index] = round(
      widths[index] + (Math.abs(diff) - remaining) * (needsSpace ? 1 : -1),
    );
  }

  return roundToFullWidth(next, index);
}
