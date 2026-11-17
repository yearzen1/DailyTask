import type { ViewName } from "../../stores/uiStore";

/** 侧边栏顺序以 settings 表为准；localStorage 只做首屏缓存。 */
export const NAV_ORDER_KEY = "dailytask.nav.order";

export const DEFAULT_NAV_ORDER: ViewName[] = [
  "today",
  "grid",
  "todos",
  "manage",
  "types",
  "stats",
  "settings",
];

function isViewName(value: string): value is ViewName {
  return (DEFAULT_NAV_ORDER as string[]).includes(value);
}

/**
 * 过滤未知项与重复项，再把缺失的 view 按默认顺序补到末尾。
 * 以后新增导航项时，老用户存的顺序不会把它弄丢。
 */
export function sanitizeNavOrder(raw: unknown): ViewName[] {
  const seen = new Set<ViewName>();
  const order: ViewName[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && isViewName(item) && !seen.has(item)) {
        seen.add(item);
        order.push(item);
      }
    }
  }

  for (const view of DEFAULT_NAV_ORDER) {
    if (!seen.has(view)) {
      order.push(view);
    }
  }

  return order;
}

export function readNavOrder(): ViewName[] {
  try {
    const raw = localStorage.getItem(NAV_ORDER_KEY);
    return raw === null
      ? [...DEFAULT_NAV_ORDER]
      : sanitizeNavOrder(JSON.parse(raw));
  } catch {
    return [...DEFAULT_NAV_ORDER];
  }
}

export function writeNavOrder(order: ViewName[]): void {
  try {
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(sanitizeNavOrder(order)));
  } catch {
    // 隐私模式或存储被禁用时忽略，本次会话里的顺序仍然生效。
  }
}

/** 把 from 位置的项移到最终下标 to（调用方已把插入缝隙换算成最终下标）。 */
export function moveNavItem(
  order: ViewName[],
  from: number,
  to: number,
): ViewName[] {
  if (from === to || from < 0 || from >= order.length) {
    return order;
  }

  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}
