import { compareTaskTypes, isTypeDescendant } from "./taskTypes";
import type { TaskType } from "./types";

export type TypeDropPosition = "before" | "inside" | "after" | "invalid";

export interface TypeMovePlan {
  parentId: string | null;
  /** 最终同级顺序里的下标（已排除被移动的节点）。 */
  index: number;
}

/** 按行的上 / 中 / 下三分之一判断插入位置。 */
export function typeDropZone(
  clientY: number,
  top: number,
  height: number,
): Exclude<TypeDropPosition, "invalid"> {
  const ratio = height > 0 ? (clientY - top) / height : 0.5;
  if (ratio < 0.3) {
    return "before";
  }
  if (ratio > 0.7) {
    return "after";
  }
  return "inside";
}

/**
 * 计算拖放后的新父级与同级下标；非法拖放返回 null。
 * 与仓库层一致：同级顺序按「order → 创建时间 → id」。
 */
export function planTypeMove(
  types: readonly TaskType[],
  sourceId: string,
  targetId: string,
  position: TypeDropPosition,
): TypeMovePlan | null {
  if (position === "invalid") {
    return null;
  }
  const source = types.find((type) => type.id === sourceId);
  const target = types.find((type) => type.id === targetId);
  if (!source || !target || source.id === target.id) {
    return null;
  }
  // 不能把类型挂到自己的子孙下。
  if (isTypeDescendant(types, source.id, target.id)) {
    return null;
  }

  const parentId = position === "inside" ? target.id : target.parentId;
  const siblings = types
    .filter((type) => type.parentId === parentId && type.id !== source.id)
    .sort(compareTaskTypes);

  if (position === "inside") {
    return { parentId, index: siblings.length };
  }

  const targetIndex = siblings.findIndex((type) => type.id === target.id);
  if (targetIndex < 0) {
    return null;
  }
  return {
    parentId,
    index: targetIndex + (position === "after" ? 1 : 0),
  };
}
