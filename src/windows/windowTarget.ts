export type WindowTarget = "main" | "widget" | "widget-menu";

/** 三个窗口共用同一份 index.html，用查询参数区分渲染入口。 */
export function windowTarget(search: string): WindowTarget {
  const target = new URLSearchParams(search).get("window");
  if (target === "widget") {
    return "widget";
  }
  if (target === "widget-menu") {
    return "widget-menu";
  }
  return "main";
}
