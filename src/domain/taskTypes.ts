import type { Task, TaskType } from "./types";

export const VOLUNTARY_TYPE_ID = "voluntary";
export const FORCED_TYPE_ID = "forced";

function builtinType(
  id: typeof VOLUNTARY_TYPE_ID | typeof FORCED_TYPE_ID,
  order: number,
): TaskType {
  return {
    id,
    name: null,
    parentId: null,
    order,
    systemKey: id,
    color: null,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

/** 内置的两个顶层类型；数据库迁移也会插入同样 id 的行。 */
export const DEFAULT_TASK_TYPES: readonly TaskType[] = Object.freeze([
  builtinType(VOLUNTARY_TYPE_ID, 0),
  builtinType(FORCED_TYPE_ID, 1),
]);

/** 空列表才回退到两个默认类型；非空列表原样使用。 */
export function resolveTaskTypes(types?: readonly TaskType[] | null): TaskType[] {
  // 空列表才回退默认值；非空列表原样使用，内置类型删除后不会被自动补回。
  if (!types || types.length === 0) {
    return DEFAULT_TASK_TYPES.map((type) => ({ ...type }));
  }
  return [...types];
}

/** 旧数据的任务只有 category；新数据以 typeId 为准。 */
export function resolveTaskTypeId(
  task: Pick<Task, "category"> & { typeId?: string | null },
): string {
  return task.typeId ? task.typeId : task.category;
}

export interface TypeNode {
  type: TaskType;
  depth: number;
  /** 从根到当前节点的完整路径（含自己）。 */
  path: TaskType[];
  children: TypeNode[];
}

export function compareTaskTypes(a: TaskType, b: TaskType): number {
  return (
    a.order - b.order ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

function wouldCreateCycle(
  id: string,
  parentId: string | null,
  byId: Map<string, TaskType>,
): boolean {
  let current = parentId;
  const visited = new Set<string>();
  while (current !== null) {
    if (current === id) {
      return true;
    }
    if (visited.has(current)) {
      return true;
    }
    visited.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/** 建树；父节点缺失或形成环时把节点当根处理，保证不丢任务。 */
export function buildTypeTree(types: readonly TaskType[]): TypeNode[] {
  const all = [...resolveTaskTypes(types)].sort(compareTaskTypes);
  const byId = new Map(all.map((type) => [type.id, type]));
  const nodes = new Map<string, TypeNode>();
  for (const type of all) {
    nodes.set(type.id, {
      type,
      depth: 0,
      path: [type],
      children: [],
    });
  }

  const roots: TypeNode[] = [];
  for (const type of all) {
    const node = nodes.get(type.id) as TypeNode;
    const parent =
      type.parentId !== null ? nodes.get(type.parentId) : undefined;
    if (
      parent &&
      type.parentId !== null &&
      !wouldCreateCycle(type.id, type.parentId, byId)
    ) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const assignDepth = (list: TypeNode[], depth: number, parentPath: TaskType[]) => {
    for (const node of list) {
      node.depth = depth;
      node.path = [...parentPath, node.type];
      assignDepth(node.children, depth + 1, node.path);
    }
  };
  assignDepth(roots, 0, []);

  return roots;
}

/** 先父后子的扁平列表；同级顺序由 buildTypeTree 决定。 */
export function flattenTypeTree(types: readonly TaskType[]): TypeNode[] {
  const flat: TypeNode[] = [];
  const walk = (nodes: TypeNode[]) => {
    for (const node of nodes) {
      flat.push(node);
      walk(node.children);
    }
  };
  walk(buildTypeTree(types));
  return flat;
}

/** 包含自己的整棵子树。 */
export function descendantTypeIds(
  types: readonly TaskType[],
  id: string,
): Set<string> {
  const children = new Map<string, string[]>();
  for (const type of types) {
    if (type.parentId === null) {
      continue;
    }
    const list = children.get(type.parentId);
    if (list) {
      list.push(type.id);
    } else {
      children.set(type.parentId, [type.id]);
    }
  }

  const result = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of children.get(current) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return result;
}

/** 祖先判断；自己不算自己的后代。 */
export function isTypeDescendant(
  types: readonly TaskType[],
  ancestorId: string,
  id: string,
): boolean {
  if (ancestorId === id) {
    return false;
  }
  const byId = new Map(types.map((type) => [type.id, type]));
  const visited = new Set<string>();
  let current = byId.get(id)?.parentId ?? null;
  while (current !== null) {
    if (current === ancestorId) {
      return true;
    }
    if (visited.has(current)) {
      return false;
    }
    visited.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/** 按类型树顺序给任务排序；未知类型排在已知类型之后。 */
export function sortedTasksByType<T extends Pick<Task, "category" | "typeId" | "order" | "createdAt" | "id">>(
  tasks: readonly T[],
  types: readonly TaskType[],
): T[] {
  const rank = new Map(
    flattenTypeTree(types).map((node, index) => [node.type.id, index]),
  );
  return [...tasks].sort((a, b) => {
    const aRank = rank.get(resolveTaskTypeId(a)) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(resolveTaskTypeId(b)) ?? Number.MAX_SAFE_INTEGER;
    return (
      aRank - bRank ||
      a.order - b.order ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id)
    );
  });
}
